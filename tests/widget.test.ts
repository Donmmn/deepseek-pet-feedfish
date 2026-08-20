// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepseekTokenPetElement } from '../src/widget/index.js'

// Node 26's built-in localStorage is gated behind --localstorage-file and is
// undefined under the jsdom environment; polyfill it for widget persistence tests.
const storage = new Map<string, string>()
const localStorageMock: Storage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: key => { storage.delete(key) },
  clear: () => { storage.clear() },
  key: index => Array.from(storage.keys())[index] ?? null,
  get length() { return storage.size },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })

describe('web component', () => {
  afterEach(() => {
    document.body.replaceChildren()
    localStorage.clear()
    vi.useRealTimers()
  })

  it('can be embedded and fed tokens without the daemon', () => {
    const element = new DeepseekTokenPetElement()
    document.body.append(element)
    const tail = element.shadowRoot?.querySelector('.tail-canvas') as HTMLCanvasElement
    expect(tail.dataset.durationMs).toBe('3200')
    expect(tail.dataset.rootWidth).toBe('84')
    expect(tail.dataset.tipWidth).toBe('32')
    const state = element.addTokens(450_000)
    expect(state.totalTokens).toBe(450_000)
    expect(state.nextBowlProgress).toBe(.45)
    expect(element.shadowRoot?.querySelector('.bowl-count')?.textContent).toBe('0 🍚')
    expect(element.shadowRoot?.querySelector('.hud')?.children).toHaveLength(2)
    expect(tail.dataset.joints).toBe('6')
    expect(tail.dataset.resample).toBe('2.667')
    expect(Number(tail.dataset.durationMs)).toBeLessThan(3_200)
    expect((element.shadowRoot?.querySelector('.character-body') as HTMLElement).style.backgroundImage).toContain('character-body.png?v=20260819-v9')
  })

  it('plays a manual feeding animation without changing token state', async () => {
    vi.useFakeTimers()
    const element = new DeepseekTokenPetElement()
    document.body.append(element)
    const before = element.state
    const bodyImage = (element.shadowRoot?.querySelector('.character-body') as HTMLElement).style.backgroundImage

    element.shadowRoot?.querySelector<HTMLButtonElement>('.manual-feed')?.click()

    expect(element.shadowRoot?.querySelector('.bowl.eating')).not.toBeNull()
    expect((element.shadowRoot?.querySelector('.bowl.eating') as HTMLElement).style.backgroundImage).toContain('?v=20260819-v9')
    expect(element.shadowRoot?.querySelector('style')?.textContent).toContain('translate(var(--food-distance),0)')
    expect(element.style.getPropertyValue('--food-distance')).toBe('68px')
    expect((element.shadowRoot?.querySelector('.character-face') as HTMLElement).style.backgroundImage).toContain('character-face-feed.png')
    expect((element.shadowRoot?.querySelector('.character-face') as HTMLElement).dataset.expression).toBe('feed')
    expect((element.shadowRoot?.querySelector('.character-body') as HTMLElement).style.backgroundImage).toBe(bodyImage)
    expect(element.state.totalTokens).toBe(before.totalTokens)
    expect(element.state.earnedBowls).toBe(before.earnedBowls)

    await vi.advanceTimersByTimeAsync(1_200)
    expect(element.state.totalTokens).toBe(before.totalTokens)
    expect(element.state.consumedBowls).toBe(before.consumedBowls)
    expect((element.shadowRoot?.querySelector('.character-face') as HTMLElement).dataset.expression).toBe('idle')
    element.remove()
    vi.useRealTimers()
  })

  it('supports programmatic resizing for embedded clients', () => {
    const element = new DeepseekTokenPetElement()
    document.body.append(element)
    const resized = vi.fn()
    element.addEventListener('pet-resize', resized)

    element.setScale(1.5)

    expect(element.style.width).toBe('660px')
    expect(element.style.height).toBe('555px')
    expect(element.getAttribute('scale')).toBe('1.500')
    expect(resized).toHaveBeenCalledOnce()
    expect(element.shadowRoot?.querySelector('.resize-handle')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.settings-toggle')?.textContent).toBe('⚙')
    expect(element.shadowRoot?.querySelector('style')?.textContent).toContain('right:61px')
    expect(element.shadowRoot?.querySelector('style')?.textContent).toContain('right:346px')

    const internals = element as unknown as {
      resizeStart: { x: number, y: number, scale: number }
      resizeFromPointer: (event: PointerEvent) => void
    }
    internals.resizeStart = { x: 100, y: 100, scale: 1.5 }
    internals.resizeFromPointer({ clientX: 144, clientY: 129 } as PointerEvent)
    expect(element.getAttribute('scale')).toBe('1.591')
  })

  it('persists settings, previews the mouth target, and reloads food motion dynamically', () => {
    vi.useFakeTimers()
    const element = new DeepseekTokenPetElement()
    document.body.append(element)
    const root = element.shadowRoot as ShadowRoot

    root.querySelector<HTMLButtonElement>('.settings-toggle')?.click()
    expect((root.querySelector('.settings-panel') as HTMLElement).hidden).toBe(false)
    expect((root.querySelector('.feed-target-marker') as HTMLElement).hidden).toBe(false)
    expect((root.querySelector('.feed-flight-guide') as HTMLElement).hidden).toBe(false)
    expect(root.querySelector('.feed-distance-label')?.textContent).toBe('68px')

    const offsetX = root.querySelector<HTMLInputElement>('[data-setting="feed.offsetX"]') as HTMLInputElement
    offsetX.value = '12'
    offsetX.dispatchEvent(new Event('input', { bubbles: true }))
    expect(element.settings.feed.offsetX).toBe(12)
    expect(element.style.getPropertyValue('--feed-offset-x')).toBe('12px')

    element.feedOnce()
    const eating = root.querySelector('.bowl.eating') as HTMLElement
    const distance = root.querySelector<HTMLInputElement>('[data-setting="feed.distance"]') as HTMLInputElement
    distance.value = '92'
    distance.dispatchEvent(new Event('input', { bubbles: true }))
    expect(element.settings.feed.distance).toBe(92)
    expect(element.style.getPropertyValue('--food-distance')).toBe('92px')
    expect(element.style.getPropertyValue('--food-half-distance')).toBe('46px')
    expect(root.querySelector('.feed-distance-label')?.textContent).toBe('92px')
    expect(root.querySelector('style')?.textContent).toContain('border-top:2px dashed')
    expect(eating.dataset.animationReloaded).toBe('true')

    const progressColor = root.querySelector<HTMLInputElement>('[data-setting="theme.progressFill"]') as HTMLInputElement
    progressColor.value = '#12abef'
    progressColor.dispatchEvent(new Event('input', { bubbles: true }))
    expect(element.style.getPropertyValue('--progress-fill')).toBe('#12abef')

    const saved = JSON.parse(localStorage.getItem('deepseek-token-pet/widget-settings@1') ?? '{}') as { feed?: { offsetX?: number, distance?: number } }
    expect(saved.feed).toMatchObject({ offsetX: 12, distance: 92 })
  })

  it('switches between the six-joint tail and alternating two-bone-per-leg animation', () => {
    const element = new DeepseekTokenPetElement()
    document.body.append(element)
    const tail = element.shadowRoot?.querySelector<HTMLCanvasElement>('.tail-canvas') as HTMLCanvasElement
    const legs = element.shadowRoot?.querySelector<HTMLCanvasElement>('.legs-canvas') as HTMLCanvasElement
    const legOption = element.shadowRoot?.querySelector<HTMLOptionElement>('#appendage-mode option[value="legs"]') as HTMLOptionElement
    const legSettings = [...(element.shadowRoot?.querySelectorAll<HTMLElement>('[data-leg-setting]') ?? [])]

    expect(tail.hidden).toBe(false)
    expect(legs.hidden).toBe(true)
    expect(legOption.textContent).toBe('腿')
    expect(legSettings).toHaveLength(2)
    expect(legSettings.every(row => row.hidden)).toBe(true)
    expect(legs.dataset.bonesPerLeg).toBe('2')
    expect(legs.dataset.staticPose).toBe('false')
    expect(legs.dataset.animation).toBe('alternating')

    element.updateSettings({ appendageMode: 'legs', legStyle: 'black-stockings', legFootwear: 'barefoot' })

    expect(tail.hidden).toBe(true)
    expect(legs.hidden).toBe(false)
    expect(legSettings.every(row => !row.hidden)).toBe(true)
    expect(legs.dataset.legStyle).toBe('black-stockings')
    expect(legs.dataset.footwear).toBe('barefoot')
    expect(element.settings.appendageMode).toBe('legs')
    expect(element.settings.legStyle).toBe('black-stockings')
    expect(element.settings.legFootwear).toBe('barefoot')

    expect(element.shadowRoot?.querySelector('style')?.textContent).toContain('scrollbar-color:var(--progress-fill) var(--button-bg)')
    expect(element.shadowRoot?.querySelector('style')?.textContent).toContain('.settings-panel::-webkit-scrollbar-thumb')

  })

  it('applies the persisted startup scale and can restore the verified defaults', () => {
    const first = new DeepseekTokenPetElement()
    document.body.append(first)
    first.updateSettings({
      initialScalePercent: 125,
      feed: { offsetY: -8 },
      theme: { buttonBackground: '#112233', buttonBorder: '#abcdef', buttonText: '#fedcba', progressFill: '#123456' },
    })
    expect(first.style.width).toBe('550px')
    expect(first.style.height).toBe('463px')
    first.remove()

    const second = new DeepseekTokenPetElement()
    document.body.append(second)
    expect(second.settings.initialScalePercent).toBe(125)
    expect(second.style.width).toBe('550px')
    expect(second.style.getPropertyValue('--button-bg')).toBe('#112233')

    second.shadowRoot?.querySelector<HTMLButtonElement>('.reset-settings')?.click()
    expect(second.settings.feed).toEqual({ offsetX: 0, offsetY: 0, distance: 68 })
    expect(second.settings.initialScalePercent).toBe(100)
    expect(second.settings.appendageMode).toBe('tail')
    expect(second.settings.legStyle).toBe('bare')
    expect(second.settings.legFootwear).toBe('shoes')
    expect(second.settings.theme).toEqual({
      buttonBackground: '#16295f',
      buttonBorder: '#79b8ff',
      buttonText: '#ffffff',
      progressFill: '#4387e7',
    })
    expect(second.style.width).toBe('440px')
  })
})
