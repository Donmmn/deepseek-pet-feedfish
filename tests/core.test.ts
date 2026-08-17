import { describe, expect, it } from 'vitest'
import { PET_EVENT_SCHEMA, TokenPetLedger, usageTokens } from '../src/core/index.js'

const usageEvent = (id: string, inputTokens: number, extra: Record<string, unknown> = {}) => ({
  schema: PET_EVENT_SCHEMA, id, timestamp: 1, source: 'test', type: 'usage', mode: 'delta',
  usage: { inputTokens, outputTokens: 0 }, ...extra,
})

describe('token ledger', () => {
  it('counts cache traffic and does not double-count reasoning', () => {
    expect(usageTokens({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, reasoningTokens: 15 })).toBe(100)
  })

  it('earns exactly one bowl at the one-million-token boundary', () => {
    const ledger = new TokenPetLedger()
    expect(ledger.ingest(usageEvent('a', 999_999)).snapshot.earnedBowls).toBe(0)
    const result = ledger.ingest(usageEvent('b', 1))
    expect(result.snapshot.earnedBowls).toBe(1)
    expect(result.snapshot.pendingBowls).toBe(1)
    expect(result.snapshot.nextBowlProgress).toBe(0)
  })

  it('replaces stream usage with final usage for the same sample', () => {
    const ledger = new TokenPetLedger()
    ledger.ingest({ ...usageEvent('stream', 700_000), mode: 'sample', sampleKey: '1:1' })
    const result = ledger.ingest({ ...usageEvent('final', 1_200_000), mode: 'sample', sampleKey: '1:1' })
    expect(result.tokenDelta).toBe(500_000)
    expect(result.snapshot.totalTokens).toBe(1_200_000)
    expect(result.snapshot.earnedBowls).toBe(1)
  })

  it('is idempotent by event id and acknowledges a specific bowl once', () => {
    const ledger = new TokenPetLedger()
    const event = usageEvent('same', 2_000_000)
    ledger.ingest(event)
    expect(ledger.ingest(event).accepted).toBe(false)
    expect(ledger.acknowledgeBowl(1).pendingBowls).toBe(1)
    expect(ledger.acknowledgeBowl(1).pendingBowls).toBe(1)
    expect(ledger.acknowledgeBowl(2).pendingBowls).toBe(0)
  })
})

