import type { PetSnapshotV1 } from '../core/index.js'

export interface TuiRenderOptions { width?: number; unicode?: boolean; color?: boolean }

export function renderPetTui(state: PetSnapshotV1, options: TuiRenderOptions = {}): string {
  const width = Math.max(10, options.width ?? 24)
  const filled = Math.round(width * state.nextBowlProgress)
  const unicode = options.unicode ?? true
  const full = unicode ? '█' : '#'
  const empty = unicode ? '░' : '-'
  const whale = unicode ? '𓆝 ᶻ 𝗓 𐰁' : '<WHALE> zZ'
  const bowl = unicode ? '🍚' : '[rice]'
  const line = full.repeat(filled) + empty.repeat(width - filled)
  const activity = state.activityLabel ?? state.activity
  return `${whale}  ${bowl} x ${state.pendingBowls}\n[${line}] ${Math.floor(state.nextBowlProgress * 100)}%\n${state.totalTokens.toLocaleString()} tokens · ${activity}`
}

