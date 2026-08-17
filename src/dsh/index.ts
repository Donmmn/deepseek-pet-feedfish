import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { PET_EVENT_SCHEMA, type TokenUsageBreakdown } from '../core/index.js'

export const name = 'deepseek-token-pet'
export const inject = ['sessions']

export interface Config { endpoint?: string; source?: string }
export function apply(ctx: Context, config: Config = {}): void {
  const endpoint = (config.endpoint ?? 'http://127.0.0.1:47832/v1/events').replace(/\/$/, '')
  const source = config.source ?? 'deepseek-harness'
  let chain = Promise.resolve()
  let warned = false
  const send = (payload: unknown): void => {
    chain = chain.then(async () => {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(2500) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        warned = false
      } catch (error) {
        if (!warned) ctx.logger?.(name).warn(`desktop pet endpoint unavailable: ${String(error)}`)
        warned = true
      }
    })
  }
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
