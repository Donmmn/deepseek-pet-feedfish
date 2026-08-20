import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/dsh/index.js'
import { createPetServer, type RunningPetServer } from '../src/server/index.js'
import type { Context } from '@deepseek-ai/cordis'

let runtime: RunningPetServer | undefined
const disposers: Array<() => void> = []
const discoveryFile = join(tmpdir(), `deepseek-token-pet-dsh-test-${process.pid}.json`)
afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose()
  await runtime?.close()
  runtime = undefined
  rmSync(discoveryFile, { force: true })
})

function fakeContext(): Context {
  const ctx: any = {
    listener: undefined,
    on(_name: string, next: unknown) { ctx.listener = next },
    logger: () => ({ info() {}, warn() {} }),
    effect: (fn: () => (() => void) | void) => { const dispose = fn(); disposers.push(typeof dispose === 'function' ? dispose : () => {}) },
    fiber: { effect: (fn: () => (() => void) | void) => { const dispose = fn(); disposers.push(typeof dispose === 'function' ? dispose : () => {}) } },
  }
  return ctx as Context
}

describe('DeepSeek Harness adapter', () => {
  it('replaces a streamed usage sample with the finalized assistant sample', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd(), discoveryFile })
    const ctx = fakeContext() as any
    apply(ctx, { endpoint: `${runtime.url}/v1/events` })
    const listener = ctx.listener as ((session: unknown, event: unknown) => void) | undefined
    listener?.({ id: 's1' }, { type: 'assistant/chunk', seq: 1, time: 1, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 700_000, outputTokens: 0 } } } })
    listener?.({ id: 's1' }, { type: 'assistant/message', seq: 2, time: 2, data: { turn: 1, step: 1, usage: { inputTokens: 900_000, outputTokens: 100_000, cacheReadTokens: 250_000 } } })
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(runtime.state().totalTokens).toBe(1_250_000)
    expect(runtime.state().earnedBowls).toBe(1)
    expect(runtime.state().dshConnected).toBe(true)
  })

  it('discovers the pet endpoint and authenticates from the discovery file', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd(), authToken: 'secret', requireAuth: true, discoveryFile })
    const ctx = fakeContext() as any
    apply(ctx, { discoveryFile })
    const listener = ctx.listener as ((session: unknown, event: unknown) => void) | undefined
    listener?.({ id: 's1' }, { type: 'assistant/message', seq: 1, time: 1, data: { turn: 1, step: 1, usage: { inputTokens: 500_000, outputTokens: 0 } } })
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(runtime.state().totalTokens).toBe(500_000)
    expect(runtime.state().dshConnected).toBe(true)
  })
})
