import { request } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { PET_EVENT_SCHEMA, type TokenUsageBreakdown } from '../core/index.js'

export const name = 'deepseek-token-pet'
export const inject = ['sessions']

export interface Config {
  endpoint?: string
  source?: string
  /** Heartbeat interval in milliseconds. */
  heartbeatIntervalMs?: number
  /** How long a pet may stay silent before the plugin reports it disconnected. */
  heartbeatTimeoutMs?: number
}

export interface PetConnectionStatus {
  connected: boolean
  endpoint: string
  source: string
  lastSeenAt?: number
  lastError: string | undefined
}

export function apply(ctx: Context, config: Config = {}): void {
  ensureLocalhostBypassesProxy()
  const endpoint = (config.endpoint ?? 'http://127.0.0.1:47832/v1/events').replace(/\/$/, '')
  const source = config.source ?? 'deepseek-harness'
  const heartbeatIntervalMs = config.heartbeatIntervalMs ?? 10_000

  const endpointUrl = new URL(endpoint)
  const heartbeatUrl = new URL(endpointUrl.origin)
  heartbeatUrl.pathname = '/v1/heartbeat'
  heartbeatUrl.search = ''
  const stateUrl = new URL(endpointUrl.origin)
  stateUrl.pathname = '/v1/state'
  stateUrl.search = ''

  const status: PetConnectionStatus = { connected: false, endpoint, source, lastError: undefined }
  let warned = false
  let chain = Promise.resolve()
  const markConnected = (): void => {
    if (!status.connected) ctx.logger?.(name).info(`desktop pet connected: ${endpoint}`)
    status.connected = true
    status.lastError = undefined
    status.lastSeenAt = Date.now()
    warned = false
  }
  const markDisconnected = (error: unknown): void => {
    if (!status.connected || !warned) ctx.logger?.(name).warn(`desktop pet unavailable: ${String(error)}`)
    status.connected = false
    status.lastError = String(error)
    warned = true
  }
  const postJson = (url: string, payload: unknown): Promise<unknown> => {
    return httpJson('POST', url, payload, 2500)
  }
  const send = (payload: unknown): void => {
    chain = chain.then(async () => {
      try {
        await postJson(endpoint, payload)
        markConnected()
      } catch (error) {
        markDisconnected(error)
      }
    })
  }

  const sendHeartbeat = (): void => {
    void postJson(heartbeatUrl.toString(), { source, time: Date.now() })
      .then(markConnected)
      .catch((error: unknown) => {
        // Older pet builds may not implement /v1/heartbeat yet; fall back to
        // the state endpoint so the plugin still reports a valid connection.
        void httpJson('GET', stateUrl.toString(), undefined, 2500)
          .then(markConnected)
          .catch(() => markDisconnected(error))
      })
  }

  // Keep the pet's connection status live even when no token event is flowing.
  const registerEffect: (fn: () => (() => void) | void, label?: string) => unknown =
    (ctx as any).effect ?? (ctx as unknown as { fiber: { effect(fn: () => (() => void) | void, label?: string): unknown } }).fiber.effect
  registerEffect(() => {
    const timer = setInterval(sendHeartbeat, heartbeatIntervalMs)
    void sendHeartbeat()
    return () => clearInterval(timer)
  }, `${name} heartbeat`)

  ctx.on('session/event', (session, event) => {
    const sessionId = String(session.id ?? session.header?.id ?? 'unknown')
    const base = { schema: PET_EVENT_SCHEMA, source, sessionId, timestamp: event.time, id: `${source}:${sessionId}:${event.seq}` }
    const usage = usageFrom(event)
    if (usage !== undefined) {
      const data = event.data as { turn?: unknown; step?: unknown }
      send({ ...base, type: 'usage', mode: 'sample', sampleKey: `${String(data.turn)}:${String(data.step)}`, usage })
      return
    }
    const activity = activityFrom(event)
    if (activity !== undefined) send({ ...base, type: 'activity', activity })
  }, { global: true })
}

function ensureLocalhostBypassesProxy(): void {
  // Node.js with NODE_USE_ENV_PROXY routes even http.request through the
  // configured proxy. Local pet traffic must never go through the proxy.
  const existing = process.env.NO_PROXY ?? process.env.no_proxy ?? ''
  const entries = existing.split(',').map((item) => item.trim()).filter(Boolean)
  for (const host of ['127.0.0.1', 'localhost', '::1']) {
    if (!entries.includes(host)) entries.push(host)
  }
  process.env.NO_PROXY = entries.join(',')
  process.env.no_proxy = process.env.NO_PROXY
}

function httpJson(method: 'GET' | 'POST', url: string, payload?: unknown, timeoutMs = 2500): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body: string | undefined
    const headers: Record<string, string> = {}
    if (payload !== undefined) {
      body = JSON.stringify(payload)
      headers['content-type'] = 'application/json'
      headers['content-length'] = String(Buffer.byteLength(body))
    }
    const req = request(url, { method, headers, timeout: timeoutMs, agent: false }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode ?? 'unknown'}`))
          return
        }
        try {
          resolve(text.length === 0 ? undefined : JSON.parse(text) as unknown)
        } catch {
          resolve(text)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

function usageFrom(event: SessionEvent): TokenUsageBreakdown | undefined {
  let raw: unknown
  if (event.type === 'assistant/message') raw = event.data.usage
  if (event.type === 'assistant/chunk') {
    const chunk = event.data.chunk as { type?: string; usage?: unknown } | undefined
    if (chunk?.type === 'usage') raw = chunk.usage
  }
  if (raw === null || typeof raw !== 'object') return undefined
  const usage = raw as Record<string, unknown>
  return {
    inputTokens: numeric(usage.inputTokens), outputTokens: numeric(usage.outputTokens),
    cacheReadTokens: numeric(usage.cacheReadTokens), cacheWriteTokens: numeric(usage.cacheWriteTokens),
    reasoningTokens: numeric(usage.reasoningTokens),
  }
}
function numeric(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0 }
function activityFrom(event: SessionEvent): 'thinking' | 'tool' | 'error' | 'done' | undefined {
  if (event.type === 'turn/start' || event.type === 'step/start') return 'thinking'
  if (event.type === 'tool/call') return 'tool'
  if (event.type === 'turn/end') {
    const reason = (event.data.reason as { kind?: string } | undefined)?.kind
    return reason === 'error' ? 'error' : 'done'
  }
  return undefined
}
