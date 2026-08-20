import type { AppendageMode, LegStyle } from '../server/skin-catalog.js'

export const PET_SETTINGS_STORAGE_KEY = 'deepseek-token-pet/widget-settings@1'

export interface PetFeedSettings {
  offsetX: number
  offsetY: number
  distance: number
}

export interface PetThemeSettings {
  buttonBackground: string
  buttonBorder: string
  buttonText: string
  progressFill: string
}

export interface PetWidgetSettingsV1 {
  schema: 'deepseek-token-pet/widget-settings@1'
  feed: PetFeedSettings
  initialScalePercent: number
  appendageMode: AppendageMode
  legStyle: LegStyle
  legFootwear: 'barefoot' | 'shoes'
  activeSkinId: string
  theme: PetThemeSettings
}

export interface PetWidgetSettingsPatch {
  feed?: Partial<PetFeedSettings>
  initialScalePercent?: number
  appendageMode?: AppendageMode
  legStyle?: LegStyle
  legFootwear?: 'barefoot' | 'shoes'
  activeSkinId?: string
  theme?: Partial<PetThemeSettings>
}

export const DEFAULT_WIDGET_SETTINGS: Readonly<PetWidgetSettingsV1> = Object.freeze({
  schema: 'deepseek-token-pet/widget-settings@1',
  feed: Object.freeze({ offsetX: 0, offsetY: 0, distance: 68 }),
  initialScalePercent: 100,
  appendageMode: 'tail',
  legStyle: 'bare',
  legFootwear: 'shoes',
  activeSkinId: '',
  theme: Object.freeze({
    buttonBackground: '#16295f',
    buttonBorder: '#79b8ff',
    buttonText: '#ffffff',
    progressFill: '#4387e7',
  }),
})

export function normalizeWidgetSettings(value: unknown): PetWidgetSettingsV1 {
  const record = isRecord(value) ? value : {}
  const feed = isRecord(record.feed) ? record.feed : {}
  const theme = isRecord(record.theme) ? record.theme : {}
  return {
    schema: 'deepseek-token-pet/widget-settings@1',
    feed: {
      offsetX: boundedNumber(feed.offsetX, -120, 120, DEFAULT_WIDGET_SETTINGS.feed.offsetX),
      offsetY: boundedNumber(feed.offsetY, -120, 120, DEFAULT_WIDGET_SETTINGS.feed.offsetY),
      distance: boundedNumber(feed.distance, 20, 180, DEFAULT_WIDGET_SETTINGS.feed.distance),
    },
    initialScalePercent: boundedNumber(record.initialScalePercent, 60, 200, DEFAULT_WIDGET_SETTINGS.initialScalePercent),
    appendageMode: record.appendageMode === 'legs' ? 'legs' : 'tail',
    legStyle: isLegStyle(record.legStyle) ? record.legStyle : DEFAULT_WIDGET_SETTINGS.legStyle,
    legFootwear: record.legFootwear === 'barefoot' ? 'barefoot' : 'shoes',
    activeSkinId: typeof record.activeSkinId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(record.activeSkinId) ? record.activeSkinId : '',
    theme: {
      buttonBackground: color(theme.buttonBackground, DEFAULT_WIDGET_SETTINGS.theme.buttonBackground),
      buttonBorder: color(theme.buttonBorder, DEFAULT_WIDGET_SETTINGS.theme.buttonBorder),
      buttonText: color(theme.buttonText, DEFAULT_WIDGET_SETTINGS.theme.buttonText),
      progressFill: color(theme.progressFill, DEFAULT_WIDGET_SETTINGS.theme.progressFill),
    },
  }
}

export function mergeWidgetSettings(current: PetWidgetSettingsV1, patch: PetWidgetSettingsPatch): PetWidgetSettingsV1 {
  return normalizeWidgetSettings({
    ...current,
    ...patch,
    feed: { ...current.feed, ...patch.feed },
    theme: { ...current.theme, ...patch.theme },
  })
}

export function loadWidgetSettings(storage = localSettingsStorage()): PetWidgetSettingsV1 {
  if (storage === undefined) return normalizeWidgetSettings(DEFAULT_WIDGET_SETTINGS)
  try {
    const saved = storage.getItem(PET_SETTINGS_STORAGE_KEY)
    return saved === null ? normalizeWidgetSettings(DEFAULT_WIDGET_SETTINGS) : normalizeWidgetSettings(JSON.parse(saved))
  } catch {
    return normalizeWidgetSettings(DEFAULT_WIDGET_SETTINGS)
  }
}

export function saveWidgetSettings(settings: PetWidgetSettingsV1, storage = localSettingsStorage()): void {
  if (storage === undefined) return
  try { storage.setItem(PET_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeWidgetSettings(settings))) } catch { /* Storage can be disabled or full. */ }
}

export function cloneWidgetSettings(settings: PetWidgetSettingsV1): PetWidgetSettingsV1 {
  return normalizeWidgetSettings(settings)
}

function localSettingsStorage(): Storage | undefined {
  try { return globalThis.localStorage } catch { return undefined }
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(maximum, Math.max(minimum, number))
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLegStyle(value: unknown): value is LegStyle {
  return value === 'bare' || value === 'black-stockings' || value === 'white-stockings'
}
