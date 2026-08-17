import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { TokenPetLedger, type LedgerSeed, type PetSnapshotV1 } from '../core/index.js'
import { scanFoodCatalog, type FoodCatalogV1 } from './food-catalog.js'

export * from './food-catalog.js'

export interface PetServerOptions {
  host?: string
  port?: number
  stateFile?: string
  packageRoot?: string
}

export interface RunningPetServer {
  server: Server
  url: string
  state: () => PetSnapshotV1
  foods: FoodCatalogV1
  close: () => Promise<void>
}

class PetStore extends EventEmitter {
  readonly ledger: TokenPetLedger
  constructor(private readonly stateFile?: string) {
    super()
    let seed: LedgerSeed = {}
    if (stateFile !== undefined && existsSync(stateFile)) {
      try { seed = JSON.parse(readFileSync(stateFile, 'utf8')) as LedgerSeed } catch { seed = {} }
    }
    this.ledger = new TokenPetLedger(undefined, seed)
  }
  publish(): PetSnapshotV1 {
    const state = this.ledger.snapshot()
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
  const clients = new Set<ServerResponse>()
  const broadcast = (state: PetSnapshotV1): void => {
    const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`
    for (const client of clients) client.write(payload)
  }
  store.on('state', broadcast)

  const server = createServer(async (request, response) => {
    cors(response)
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return }
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
    try {
      if (request.method === 'GET' && url.pathname === '/v1/state') return json(response, 200, store.ledger.snapshot())
      if (request.method === 'GET' && url.pathname === '/v1/foods') return json(response, 200, foodCatalog)
      if (request.method === 'GET' && url.pathname === '/v1/stream') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        clients.add(response)
        response.write(`event: state\ndata: ${JSON.stringify(store.ledger.snapshot())}\n\n`)
        request.on('close', () => clients.delete(response))
        return
      }
      if (request.method === 'POST' && url.pathname === '/v1/events') {
        const body = await readJson(request)
        const events = Array.isArray(body) ? body : [body]
        const results = events.map(event => store.ledger.ingest(event))
        const state = store.publish()
        return json(response, 202, { accepted: results.filter(result => result.accepted).length, state })
      }
      const ack = request.method === 'POST' ? /^\/v1\/bowls\/(\d+)\/ack$/.exec(url.pathname) : null
      if (ack !== null) {
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
  return {
    server, url,
    state: () => store.ledger.snapshot(), foods: foodCatalog,
    close: () => new Promise<void>((resolveClose, reject) => server.close(error => error === undefined ? resolveClose() : reject(error))),
  }
}

function cors(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'content-type')
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
function demoHtml(): string { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DeepSeek Token Pet</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{display:grid;place-items:center;-webkit-app-region:drag}.close{position:fixed;right:8px;top:7px;width:24px;height:24px;border:2px solid #79b8ff;background:#16295f;color:#fff;font:16px/16px monospace;opacity:0;transition:opacity .15s;-webkit-app-region:no-drag}.desktop:hover .close{opacity:.8}.close:hover{opacity:1!important}</style></head><body><deepseek-token-pet endpoint="" asset-base="/assets"></deepseek-token-pet><script type="module">import '/widget.js?v=0.2.3';const pet=document.querySelector('deepseek-token-pet');pet.setAttribute('endpoint',location.origin);if(new URLSearchParams(location.search).has('desktop')){document.body.classList.add('desktop');pet.addEventListener('pet-resize',event=>window.resizeTo(event.detail.width,event.detail.height));const button=document.createElement('button');button.className='close';button.title='关闭桌宠';button.textContent='×';button.onclick=()=>window.close();document.body.append(button)}</script></body></html>` }
