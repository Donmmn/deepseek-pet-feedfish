export const PET_EVENT_SCHEMA = 'deepseek-token-pet/event@1' as const
export const DEFAULT_BOWL_SIZE = 1_000_000

export interface TokenUsageBreakdown {
  /** Uncached input tokens. Cached tokens belong in the cache buckets. */
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** Informational subdivision of outputTokens; never added a second time. */
  reasoningTokens?: number
}

interface PetEventBase {
  schema: typeof PET_EVENT_SCHEMA
  id: string
  timestamp: number
  source: string
  sessionId?: string
}

export interface UsagePetEvent extends PetEventBase {
  type: 'usage'
  usage: TokenUsageBreakdown
  /** Delta adds once. Sample replaces the previous value for sampleKey. */
  mode: 'delta' | 'sample'
  sampleKey?: string
}

export interface ActivityPetEvent extends PetEventBase {
  type: 'activity'
  activity: 'idle' | 'thinking' | 'tool' | 'waiting' | 'error' | 'done'
  label?: string
}

export interface ResetPetEvent extends PetEventBase {
  type: 'reset'
  totalTokens?: number
  consumedBowls?: number
}

export type PetEventV1 = UsagePetEvent | ActivityPetEvent | ResetPetEvent

export interface PetSnapshotV1 {
  schema: 'deepseek-token-pet/state@1'
  revision: number
  updatedAt: number
  totalTokens: number
  bowlSize: number
  earnedBowls: number
  consumedBowls: number
  pendingBowls: number
  nextBowlTokens: number
  nextBowlProgress: number
  activity: ActivityPetEvent['activity']
  activityLabel?: string
  /** True when a DSH plugin has sent a heartbeat within the timeout window. */
  dshConnected?: boolean
  /** Identifier of the most recent DSH plugin that sent a heartbeat. */
  dshSource?: string
  /** Unix epoch ms of the most recent DSH heartbeat. */
  dshLastSeenAt?: number
}

const finiteNonNegative = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a finite non-negative number`)
  }
  return Math.floor(value)
}

export function usageTokens(usage: TokenUsageBreakdown): number {
  return finiteNonNegative(usage.inputTokens, 'usage.inputTokens')
    + finiteNonNegative(usage.outputTokens, 'usage.outputTokens')
    + finiteNonNegative(usage.cacheReadTokens ?? 0, 'usage.cacheReadTokens')
    + finiteNonNegative(usage.cacheWriteTokens ?? 0, 'usage.cacheWriteTokens')
}

export function petEvent(input: Omit<UsagePetEvent, 'schema' | 'id' | 'timestamp'> & Partial<Pick<UsagePetEvent, 'id' | 'timestamp'>>): UsagePetEvent
export function petEvent(input: Omit<ActivityPetEvent, 'schema' | 'id' | 'timestamp'> & Partial<Pick<ActivityPetEvent, 'id' | 'timestamp'>>): ActivityPetEvent
export function petEvent(input: Omit<ResetPetEvent, 'schema' | 'id' | 'timestamp'> & Partial<Pick<ResetPetEvent, 'id' | 'timestamp'>>): ResetPetEvent
export function petEvent(input: Omit<PetEventV1, 'schema' | 'id' | 'timestamp'> & { id?: string; timestamp?: number }): PetEventV1 {
  const timestamp = input.timestamp ?? Date.now()
  const id = input.id ?? `${input.source}:${timestamp}:${Math.random().toString(36).slice(2, 10)}`
  return { ...input, schema: PET_EVENT_SCHEMA, id, timestamp } as PetEventV1
}

export function parsePetEvent(value: unknown): PetEventV1 {
  if (value === null || typeof value !== 'object') throw new TypeError('event must be an object')
  const event = value as Record<string, unknown>
  if (event.schema !== PET_EVENT_SCHEMA) throw new TypeError(`schema must be ${PET_EVENT_SCHEMA}`)
  if (typeof event.id !== 'string' || event.id.length === 0) throw new TypeError('id must be a non-empty string')
  if (typeof event.source !== 'string' || event.source.length === 0) throw new TypeError('source must be a non-empty string')
  finiteNonNegative(event.timestamp, 'timestamp')
  if (event.type === 'usage') {
    if (event.mode !== 'delta' && event.mode !== 'sample') throw new TypeError('usage mode must be delta or sample')
    if (event.mode === 'sample' && (typeof event.sampleKey !== 'string' || event.sampleKey.length === 0)) {
      throw new TypeError('sample events require sampleKey')
    }
    usageTokens(event.usage as TokenUsageBreakdown)
  } else if (event.type === 'activity') {
    if (!['idle', 'thinking', 'tool', 'waiting', 'error', 'done'].includes(String(event.activity))) {
      throw new TypeError('unknown activity')
    }
  } else if (event.type === 'reset') {
    finiteNonNegative(event.totalTokens ?? 0, 'totalTokens')
    finiteNonNegative(event.consumedBowls ?? 0, 'consumedBowls')
  } else {
    throw new TypeError('unknown event type')
  }
  return value as PetEventV1
}

