#!/usr/bin/env node
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { createPetServer } from './server/index.js'
import { PET_EVENT_SCHEMA } from './core/index.js'
import { renderPetTui } from './tui/index.js'

const args = process.argv.slice(2)
const command = args[0] ?? 'serve'
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined }

if (command === 'serve') {
  const packageRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
  const server = await createPetServer({
    host: value('--host') ?? '127.0.0.1', port: Number(value('--port') ?? 47832),
    stateFile: value('--state') ?? join(homedir(), '.deepseek-token-pet-state.json'), packageRoot,
  })
  console.log(`DeepSeek Token Pet listening on ${server.url}`)
  if (args.includes('--open')) openBrowser(server.url)
} else if (command === 'add') {
  const tokens = Number(args[1] ?? 1_000_000)
  const endpoint = value('--endpoint') ?? 'http://127.0.0.1:47832/v1/events'
  const payload = { schema: PET_EVENT_SCHEMA, id: `cli:${Date.now()}`, timestamp: Date.now(), source: 'cli', type: 'usage', mode: 'delta', usage: { inputTokens: tokens, outputTokens: 0 } }
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  console.log(JSON.stringify(await response.json(), null, 2))
} else if (command === 'tui') {
  const endpoint = value('--endpoint') ?? 'http://127.0.0.1:47832/v1/state'
  const response = await fetch(endpoint)
  console.log(renderPetTui(await response.json()))
} else {
  console.log('Usage: deepseek-pet serve [--open] [--port 47832] | add <tokens> | tui')
  process.exitCode = command === 'help' || command === '--help' ? 0 : 1
}

function openBrowser(url: string): void {
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url])
  else if (process.platform === 'darwin') execFile('open', [url])
  else execFile('xdg-open', [url])
}

