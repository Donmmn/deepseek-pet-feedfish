import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { TokenPetLedger, type LedgerSeed, type PetSnapshotV1 } from '../core/index.js'
import { scanFoodCatalog, type FoodCatalogV1 } from './food-catalog.js'

export * from './food-catalog.js'

export interface PetServerOptions {
  host?: string
  port?: number
  stateFile?: string
  packageRoot?: string
  /** Optional pre-shared token. A random one is generated when omitted. */
  authToken?: string
  /** Require Bearer auth on write endpoints. Defaults to false for backward compatibility. */
  requireAuth?: boolean
  /** Where to publish endpoint discovery metadata. Defaults to ~/.deepseek-token-pet.json */
  discoveryFile?: string
}

export interface PetDiscoveryV1 {
  schema: 'deepseek-token-pet/discovery@1'
  url: string
  host: string
  port: number
  pid: number
  protocolVersion: string
  serverVersion: string
  authToken?: string
  requireAuth: boolean
  startedAt: number
}

export interface PetServerInfoV1 {
  schema: 'deepseek-token-pet/info@1'
  protocolVersion: string
  serverVersion: string
  capabilities: string[]
  heartbeatTimeoutMs: number
  authRequired: boolean
}

export interface RunningPetServer {
  server: Server
  url: string
  state: () => PetSnapshotV1
  foods: FoodCatalogV1
  info: () => PetServerInfoV1
  discovery: () => PetDiscoveryV1
  close: () => Promise<void>
}

export const PET_PROTOCOL_VERSION = 'deepseek-token-pet/protocol@1'
export const PET_SERVER_VERSION = '0.4.0'
export const DEFAULT_DISCOVERY_FILE = join(homedir(), '.deepseek-token-pet.json')

const DSH_HEARTBEAT_TIMEOUT_MS = 30_000

class PetStore extends EventEmitter {
  readonly ledger: TokenPetLedger
  private heartbeatSource: string | undefined
  private heartbeatAt: number | undefined
  constructor(private readonly stateFile?: string) {
    super()
    let seed: LedgerSeed = {}
    if (stateFile !== undefined && existsSync(stateFile)) {
      try { seed = JSON.parse(readFileSync(stateFile, 'utf8')) as LedgerSeed } catch { seed = {} }
    }
    this.ledger = new TokenPetLedger(undefined, seed)
  }
  markHeartbeat(source: string, at = Date.now()): void {
    this.heartbeatSource = source
    this.heartbeatAt = at
  }
  snapshot(): PetSnapshotV1 {
    const state = this.ledger.snapshot()
    if (this.heartbeatAt === undefined) return state
    const result: PetSnapshotV1 = { ...state }
    result.dshConnected = Date.now() - this.heartbeatAt < DSH_HEARTBEAT_TIMEOUT_MS
    result.dshLastSeenAt = this.heartbeatAt
    if (this.heartbeatSource !== undefined) result.dshSource = this.heartbeatSource
    return result
  }
  publish(): PetSnapshotV1 {
    const state = this.snapshot()
    if (this.stateFile !== undefined) writeFileSync(this.stateFile, `${JSON.stringify(this.ledger.serialize(), null, 2)}\n`, 'utf8')
    this.emit('state', state)
    return state
  }
}

export async function createPetServer(options: PetServerOptions = {}): Promise<RunningPetServer> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 47832
  const packageRoot = resolve(options.packageRoot ?? process.cwd())
  const assetRoot = resolve(packageRoot, 'assets')
  const foodCatalog = scanFoodCatalog(resolve(assetRoot, 'foods'))
  const store = new PetStore(options.stateFile)
  const authToken = options.authToken ?? randomBytes(24).toString('hex')
  const requireAuth = options.requireAuth ?? false
  const discoveryFile = resolve(options.discoveryFile ?? DEFAULT_DISCOVERY_FILE)
  const clients = new Set<ServerResponse>()
  const broadcast = (state: PetSnapshotV1): void => {
    const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`
    for (const client of clients) client.write(payload)
  }
  store.on('state', broadcast)

  const authorized = (request: IncomingMessage): boolean => {
    if (!requireAuth) return true
    return request.headers.authorization === `Bearer ${authToken}`
  }
  const writeGuard = (request: IncomingMessage, response: ServerResponse): boolean => {
    if (authorized(request)) return true
    json(response, 401, { error: 'unauthorized' })
    return false
  }

  const server = createServer(async (request, response) => {
    cors(response)
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return }
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
    try {
      if (request.method === 'GET' && url.pathname === '/v1/info') {
        return json(response, 200, {
          schema: 'deepseek-token-pet/info@1',
          protocolVersion: PET_PROTOCOL_VERSION,
          serverVersion: PET_SERVER_VERSION,
          capabilities: ['events', 'heartbeat', 'state', 'stream', 'foods', 'bowls', 'discovery'],
          heartbeatTimeoutMs: DSH_HEARTBEAT_TIMEOUT_MS,
          authRequired: requireAuth,
        })
      }
      if (request.method === 'GET' && url.pathname === '/v1/state') return json(response, 200, store.snapshot())
      if (request.method === 'GET' && url.pathname === '/v1/foods') return json(response, 200, foodCatalog)
      if (request.method === 'GET' && url.pathname === '/v1/discovery') return json(response, 200, discovery())
      if (request.method === 'GET' && url.pathname === '/v1/stream') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        clients.add(response)
        response.write(`event: state\ndata: ${JSON.stringify(store.snapshot())}\n\n`)
        request.on('close', () => clients.delete(response))
        return
      }
      if (request.method === 'POST' && url.pathname === '/v1/heartbeat') {
        if (!writeGuard(request, response)) return
        const body = await readJson(request) as { source?: unknown }
        if (typeof body?.source !== 'string' || body.source.length === 0) {
          return json(response, 400, { error: 'source_required' })
        }
        store.markHeartbeat(body.source)
        return json(response, 200, { ok: true, state: store.publish() })
      }
      if (request.method === 'POST' && url.pathname === '/v1/events') {
        if (!writeGuard(request, response)) return
        const body = await readJson(request)
        const events = Array.isArray(body) ? body : [body]
        const results = events.map(event => store.ledger.ingest(event))
        const state = store.publish()
        return json(response, 202, { accepted: results.filter(result => result.accepted).length, state })
      }
      const ack = request.method === 'POST' ? /^\/v1\/bowls\/(\d+)\/ack$/.exec(url.pathname) : null
      if (ack !== null) {
        if (!writeGuard(request, response)) return
        store.ledger.acknowledgeBowl(Number(ack[1]))
        return json(response, 200, store.publish())
      }
      if (request.method === 'GET' && url.pathname === '/') return html(response, demoHtml())
      if (request.method === 'GET' && url.pathname === '/widget.js') return file(response, join(packageRoot, 'dist', 'widget', 'index.js'))
      if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
        const assetPath = resolve(packageRoot, `.${decodeURIComponent(url.pathname)}`)
        if (assetPath !== assetRoot && !assetPath.startsWith(`${assetRoot}${sep}`)) return json(response, 403, { error: 'asset_path_forbidden' })
        return file(response, assetPath)
      }
      return json(response, 404, { error: 'not_found' })
    } catch (error) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.off('error', reject); resolveListen() })
  })
  const address = server.address()
  const actualPort = typeof address === 'object' && address !== null ? address.port : port
  const url = `http://${host}:${actualPort}`
  let discovery: () => PetDiscoveryV1
  const info = (): PetServerInfoV1 => ({
    schema: 'deepseek-token-pet/info@1',
    protocolVersion: PET_PROTOCOL_VERSION,
    serverVersion: PET_SERVER_VERSION,
    capabilities: ['events', 'heartbeat', 'state', 'stream', 'foods', 'bowls', 'discovery'],
    heartbeatTimeoutMs: DSH_HEARTBEAT_TIMEOUT_MS,
    authRequired: requireAuth,
  })
  const writeDiscovery = (): void => {
    discovery = () => ({
      schema: 'deepseek-token-pet/discovery@1',
      url,
      host,
      port: actualPort,
      pid: process.pid,
      protocolVersion: PET_PROTOCOL_VERSION,
      serverVersion: PET_SERVER_VERSION,
      authToken,
      requireAuth,
      startedAt: Date.now(),
    })
    const payload = `${JSON.stringify(discovery(), null, 2)}\n`
    mkdirSync(dirname(discoveryFile), { recursive: true })
    writeFileSync(discoveryFile, payload, 'utf8')
  }
  writeDiscovery()
  return {
    server, url,
    state: () => store.snapshot(), foods: foodCatalog,
    info,
    discovery: () => discovery(),
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close(error => {
        if (error !== undefined) { reject(error); return }
        try {
          if (existsSync(discoveryFile)) {
            const current = JSON.parse(readFileSync(discoveryFile, 'utf8')) as PetDiscoveryV1
            if (current.url === url && current.pid === process.pid && current.authToken === authToken) {
              rmSync(discoveryFile, { force: true })
            }
          }
        } catch {
          // Best-effort cleanup; stale discovery files are overwritten on next start.
        }
        resolveClose()
      })
    }),
  }
}

function cors(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}
function json(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(value)) }
function html(response: ServerResponse, value: string): void { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(value) }
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1_048_576) throw new Error('request body exceeds 1 MiB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
function file(response: ServerResponse, path: string): void {
  if (!existsSync(path)) { json(response, 404, { error: 'asset_not_found' }); return }
  const extension = extname(path)
  const contentType = ({ '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' } as Record<string, string>)[extension] ?? 'application/octet-stream'
  const cacheControl = extension === '.js' || extension === '.png' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl })
  createReadStream(path).pipe(response)
}
function demoHtml(): string { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DeepSeek Token Pet</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{display:grid;place-items:center;-webkit-app-region:drag}.close{position:fixed;right:8px;top:7px;width:24px;height:24px;border:2px solid #79b8ff;background:#16295f;color:#fff;font:16px/16px monospace;opacity:0;transition:opacity .15s;-webkit-app-region:no-drag}.desktop:hover .close{opacity:.8}.close:hover{opacity:1!important}</style></head><body><deepseek-token-pet endpoint="" asset-base="/assets"></deepseek-token-pet><script type="module">import '/widget.js?v=0.2.4';const pet=document.querySelector('deepseek-token-pet');pet.setAttribute('endpoint',location.origin);if(new URLSearchParams(location.search).has('desktop')){document.body.classList.add('desktop');pet.addEventListener('pet-resize',event=>window.resizeTo(event.detail.width,event.detail.height));const button=document.createElement('button');button.className='close';button.title='关闭桌宠';button.textContent='×';button.onclick=()=>window.close();document.body.append(button)}</script></body></html>` }
