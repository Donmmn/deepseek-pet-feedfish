import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import * as PetPlugin from '../src/dsh/index.js'
import { createPetServer, type RunningPetServer } from '../src/server/index.js'

let runtime: RunningPetServer | undefined
const fibers: Array<{ dispose(): Promise<void> }> = []
const discoveryFile = join(tmpdir(), `deepseek-token-pet-real-test-${process.pid}.json`)
afterEach(async () => {
  for (const fiber of fibers.splice(0).reverse()) await fiber.dispose()
  await runtime?.close()
  runtime = undefined
  rmSync(discoveryFile, { force: true })
})

describe('DeepSeek Harness real Cordis composition', () => {
  it('observes a real dsh-session append through session/event', async () => {
    runtime = await createPetServer({ port: 0, packageRoot: process.cwd(), discoveryFile })
    const context = new Context()
    fibers.push(await context.plugin(SessionStore))
    fibers.push(await context.plugin(PetPlugin, { endpoint: `${runtime.url}/v1/events`, source: 'real-dsh-test' }))
    const session = context.sessions.create(SessionId('pet-real-composition'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 250_000, outputTokens: 250_000, cacheReadTokens: 500_000 } },
    })
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(runtime.state().totalTokens).toBe(1_000_000)
    expect(runtime.state().earnedBowls).toBe(1)
  })
})
