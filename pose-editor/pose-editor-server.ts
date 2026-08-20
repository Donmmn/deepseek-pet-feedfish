import { execFile } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { poseEditorHtml } from './pose-editor-page.js'

const args = process.argv.slice(2)
const value = (flag: string): string | undefined => {
  const index = args.indexOf(flag)
  return index < 0 ? undefined : args[index + 1]
}
const host = '127.0.0.1'
const port = Number(value('--port') ?? 47833)
const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const assetRoot = resolve(workspaceRoot, 'assets')

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`)
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(poseEditorHtml())
    return
  }
  if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
    const path = resolve(workspaceRoot, `.${decodeURIComponent(url.pathname)}`)
    if (path !== assetRoot && !path.startsWith(`${assetRoot}${sep}`)) return error(response, 403, 'asset_path_forbidden')
    if (!existsSync(path) || !statSync(path).isFile()) return error(response, 404, 'asset_not_found')
    response.writeHead(200, { 'Content-Type': mime(path), 'Cache-Control': 'no-store' })
    createReadStream(path).pipe(response)
    return
  }
  error(response, 404, 'not_found')
})

server.listen(port, host, () => {
  const url = `http://${host}:${port}`
  console.log(`DeepSeek Token Pet pose editor: ${url}`)
  if (!args.includes('--no-open')) openBrowser(url)
})

process.once('SIGINT', () => server.close(() => process.exit(0)))
process.once('SIGTERM', () => server.close(() => process.exit(0)))

function error(response: ServerResponse, status: number, code: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ error: code }))
}

function mime(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}

function openBrowser(url: string): void {
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url])
  else if (process.platform === 'darwin') execFile('open', [url])
  else execFile('xdg-open', [url])
}
