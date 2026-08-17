// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepseekTokenPetElement } from '../src/widget/index.js'

describe('web component', () => {
  afterEach(() => document.body.replaceChildren())

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
    expect((element.shadowRoot?.querySelector('.character-body') as HTMLElement).style.backgroundImage).toContain('character-body.png?v=20260817-v5')
  })

  it('plays a manual feeding animation without changing token state', async () => {
    vi.useFakeTimers()
    const element = new DeepseekTokenPetElement()
    document.body.append(element)
    const before = element.state
    const bodyImage = (element.shadowRoot?.querySelector('.character-body') as HTMLElement).style.backgroundImage

    element.shadowRoot?.querySelector<HTMLButtonElement>('.manual-feed')?.click()

    expect(element.shadowRoot?.querySelector('.bowl.eating')).not.toBeNull()
    expect((element.shadowRoot?.querySelector('.bowl.eating') as HTMLElement).style.backgroundImage).toContain('?v=20260817-v5')
    expect(element.shadowRoot?.querySelector('style')?.textContent).toContain('translate(68px,0)')
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
    expect(element.style.height).toBe('387px')
    expect(element.getAttribute('scale')).toBe('1.500')
    expect(resized).toHaveBeenCalledOnce()
    expect(element.shadowRoot?.querySelector('.resize-handle')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('style')?.textContent).toContain('right:61px')

    const internals = element as unknown as {
      resizeStart: { x: number, y: number, scale: number }
      resizeFromPointer: (event: PointerEvent) => void
    }
    internals.resizeStart = { x: 100, y: 100, scale: 1.5 }
    internals.resizeFromPointer({ clientX: 144, clientY: 125.8 } as PointerEvent)
    expect(element.getAttribute('scale')).toBe('1.600')
  })
})
