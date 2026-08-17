import { afterEach, describe, expect, it } from 'vitest'
import { createPetServer, type RunningPetServer } from '../src/server/index.js'
import { PET_EVENT_SCHEMA } from '../src/core/index.js'

let runtime: RunningPetServer | undefined
afterEach(async () => { await runtime?.close(); runtime = undefined })

describe('HTTP bridge', () => {
  it('accepts portable events and acknowledges bowls', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd() })
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
})
