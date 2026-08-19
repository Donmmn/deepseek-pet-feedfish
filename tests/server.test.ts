import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { createPetServer, type RunningPetServer } from '../src/server/index.js'
import { PET_EVENT_SCHEMA } from '../src/core/index.js'

let runtime: RunningPetServer | undefined
const discoveryFile = join(tmpdir(), `deepseek-token-pet-test-${process.pid}.json`)
afterEach(async () => {
  await runtime?.close()
  runtime = undefined
  rmSync(discoveryFile, { force: true })
})

describe('HTTP bridge', () => {
  it('accepts portable events and acknowledges bowls', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd(), authToken: 'test-token', discoveryFile })
    const event = { schema: PET_EVENT_SCHEMA, id: 'http-1', timestamp: Date.now(), source: 'test', type: 'usage', mode: 'delta', usage: { inputTokens: 400_000, outputTokens: 100_000, cacheReadTokens: 500_000 } }
    const accepted = await fetch(`${runtime.url}/v1/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) })
    expect(accepted.status).toBe(202)
    const state = await (await fetch(`${runtime.url}/v1/state`)).json()
    expect(state.totalTokens).toBe(1_000_000)
    expect(state.pendingBowls).toBe(1)
    const acknowledged = await (await fetch(`${runtime.url}/v1/bowls/1/ack`, { method: 'POST' })).json()
    expect(acknowledged.pendingBowls).toBe(0)
    const widget = await fetch(`${runtime.url}/widget.js`)
    expect(widget.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate')
    const foods = await (await fetch(`${runtime.url}/v1/foods`)).json()
    expect(foods.count).toBe(9)
    expect(foods.totalWeight).toBe(44)
    const foodAsset = await fetch(`${runtime.url}${foods.foods[0].url}`)
    expect(foodAsset.status).toBe(200)
    expect(foodAsset.headers.get('content-type')).toBe('image/png')
    expect(foodAsset.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate')
    for (const asset of ['character-body.png', 'character-face-idle.png', 'character-face-feed.png']) {
      const response = await fetch(`${runtime.url}/assets/${asset}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate')
    }
  })

  it('exposes protocol info and discovery metadata', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd(), authToken: 'test-token', discoveryFile })
    const info = await (await fetch(`${runtime.url}/v1/info`)).json()
    expect(info.schema).toBe('deepseek-token-pet/info@1')
    expect(info.protocolVersion).toBe('deepseek-token-pet/protocol@1')
    expect(info.capabilities).toContain('heartbeat')
    expect(info.authRequired).toBe(false)

    const discovery = await (await fetch(`${runtime.url}/v1/discovery`)).json()
    expect(discovery.url).toBe(runtime.url)
    expect(discovery.authToken).toBe('test-token')
    expect(discovery.requireAuth).toBe(false)

    expect(existsSync(discoveryFile)).toBe(true)
    const onDisk = JSON.parse(readFileSync(discoveryFile, 'utf8')) as { url: string; authToken: string }
    expect(onDisk.url).toBe(runtime.url)
    expect(onDisk.authToken).toBe('test-token')
  })

  it('requires bearer auth for write endpoints when enabled', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd(), authToken: 'secret', requireAuth: true, discoveryFile })
    const event = { schema: PET_EVENT_SCHEMA, id: 'auth-1', timestamp: Date.now(), source: 'test', type: 'usage', mode: 'delta', usage: { inputTokens: 1, outputTokens: 0 } }
    const rejected = await fetch(`${runtime.url}/v1/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) })
    expect(rejected.status).toBe(401)

    const accepted = await fetch(`${runtime.url}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify(event),
    })
    expect(accepted.status).toBe(202)
    expect(runtime.state().totalTokens).toBe(1)
  })

  it('accepts heartbeat and events over WebSocket', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd(), authToken: 'secret', requireAuth: true, discoveryFile })
    const wsUrl = `${runtime.url.replace('http', 'ws')}/v1/ws?source=ws-test&token=secret`
    const socket = new WebSocket(wsUrl)
    const messages: Array<Record<string, unknown>> = []
    const opened = new Promise<void>((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', reject)
    })
    socket.on('message', data => {
      messages.push(JSON.parse(String(data)) as Record<string, unknown>)
    })
    await opened
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(messages.some(message => message.type === 'hello')).toBe(true)

    socket.send(JSON.stringify({ type: 'heartbeat', source: 'ws-test', time: Date.now() }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(messages.some(message => message.type === 'pong')).toBe(true)
    expect(runtime.state().dshConnected).toBe(true)

    const event = { schema: PET_EVENT_SCHEMA, id: 'ws-1', timestamp: Date.now(), source: 'ws-test', type: 'usage', mode: 'delta', usage: { inputTokens: 300_000, outputTokens: 100_000 } }
    socket.send(JSON.stringify({ type: 'event', event }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(messages.some(message => message.type === 'ack')).toBe(true)
    expect(runtime.state().totalTokens).toBe(400_000)
    socket.close()
  })
})
