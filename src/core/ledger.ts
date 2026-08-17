import {
  DEFAULT_BOWL_SIZE,
  type PetEventV1,
  type PetSnapshotV1,
  type UsagePetEvent,
  parsePetEvent,
  usageTokens,
} from './protocol.js'

export interface LedgerSeed {
  totalTokens?: number
  consumedBowls?: number
  revision?: number
  updatedAt?: number
  samples?: Record<string, number>
}

export interface IngestResult {
  accepted: boolean
  tokenDelta: number
  bowlsDelta: number
  snapshot: PetSnapshotV1
}

export class TokenPetLedger {
  private totalTokens: number
  private consumedBowls: number
  private revision: number
  private updatedAt: number
  private activity: PetSnapshotV1['activity'] = 'idle'
  private activityLabel: string | undefined
  private readonly samples = new Map<string, number>()
  private readonly seen = new Set<string>()
  private readonly seenOrder: string[] = []

  constructor(readonly bowlSize = DEFAULT_BOWL_SIZE, seed: LedgerSeed = {}) {
    if (!Number.isSafeInteger(bowlSize) || bowlSize <= 0) throw new TypeError('bowlSize must be a positive safe integer')
    this.totalTokens = Math.max(0, Math.floor(seed.totalTokens ?? 0))
    this.consumedBowls = Math.max(0, Math.floor(seed.consumedBowls ?? 0))
    this.revision = Math.max(0, Math.floor(seed.revision ?? 0))
    this.updatedAt = seed.updatedAt ?? Date.now()
    for (const [key, value] of Object.entries(seed.samples ?? {})) this.samples.set(key, value)
    this.consumedBowls = Math.min(this.consumedBowls, Math.floor(this.totalTokens / bowlSize))
  }

  ingest(rawEvent: unknown): IngestResult {
    const event = parsePetEvent(rawEvent)
    if (this.seen.has(event.id)) return { accepted: false, tokenDelta: 0, bowlsDelta: 0, snapshot: this.snapshot() }
    this.remember(event.id)

    const previousBowls = Math.floor(this.totalTokens / this.bowlSize)
    let tokenDelta = 0
    if (event.type === 'usage') tokenDelta = this.ingestUsage(event)
    if (event.type === 'activity') {
      this.activity = event.activity
      this.activityLabel = event.label
    }
    if (event.type === 'reset') {
      this.totalTokens = Math.max(0, Math.floor(event.totalTokens ?? 0))
      this.consumedBowls = Math.min(
        Math.max(0, Math.floor(event.consumedBowls ?? 0)),
        Math.floor(this.totalTokens / this.bowlSize),
      )
      this.samples.clear()
    }
    this.revision += 1
    this.updatedAt = event.timestamp
    return {
      accepted: true,
      tokenDelta,
      bowlsDelta: Math.floor(this.totalTokens / this.bowlSize) - previousBowls,
      snapshot: this.snapshot(),
    }
  }

  acknowledgeBowl(index: number): PetSnapshotV1 {
    const earned = Math.floor(this.totalTokens / this.bowlSize)
    if (Number.isSafeInteger(index) && index > this.consumedBowls && index <= earned) {
      this.consumedBowls = index
      this.revision += 1
      this.updatedAt = Date.now()
    }
    return this.snapshot()
  }

  snapshot(): PetSnapshotV1 {
    const earnedBowls = Math.floor(this.totalTokens / this.bowlSize)
    const remainder = this.totalTokens % this.bowlSize
    return {
      schema: 'deepseek-token-pet/state@1',
      revision: this.revision,
      updatedAt: this.updatedAt,
      totalTokens: this.totalTokens,
      bowlSize: this.bowlSize,
      earnedBowls,
      consumedBowls: this.consumedBowls,
      pendingBowls: Math.max(0, earnedBowls - this.consumedBowls),
      nextBowlTokens: remainder,
      nextBowlProgress: remainder / this.bowlSize,
      activity: this.activity,
      ...(this.activityLabel === undefined ? {} : { activityLabel: this.activityLabel }),
    }
  }

  serialize(): LedgerSeed {
    return {
      totalTokens: this.totalTokens,
      consumedBowls: this.consumedBowls,
      revision: this.revision,
      updatedAt: this.updatedAt,
      samples: Object.fromEntries(this.samples),
    }
  }

  private ingestUsage(event: UsagePetEvent): number {
    const value = usageTokens(event.usage)
    if (event.mode === 'delta') {
      this.totalTokens += value
      return value
    }
    const key = `${event.source}\u0000${event.sessionId ?? ''}\u0000${event.sampleKey}`
    const previous = this.samples.get(key) ?? 0
    this.samples.set(key, value)
    const delta = value - previous
    this.totalTokens = Math.max(0, this.totalTokens + delta)
    return delta
  }

  private remember(id: string): void {
    this.seen.add(id)
    this.seenOrder.push(id)
    if (this.seenOrder.length > 4096) {
      const oldest = this.seenOrder.shift()
      if (oldest !== undefined) this.seen.delete(oldest)
    }
  }
}

