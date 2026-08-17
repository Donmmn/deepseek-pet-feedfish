import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { scanFoodCatalog } from '../src/server/food-catalog.js'

describe('food catalog', () => {
  it('recursively loads weighted 48x48 PNG sprites once', () => {
    const catalog = scanFoodCatalog(resolve('assets/foods'))
    expect(catalog.count).toBe(9)
    expect(catalog.discoveredFiles).toBe(9)
    expect(catalog.totalWeight).toBe(44)
    expect(catalog.rejected).toEqual([])
    expect(catalog.foods.some(food => food.id === 'core/plain-rice{10}.png' && food.weight === 10)).toBe(true)
    expect(catalog.foods.some(food => food.id.startsWith('dlc-gaijiaofan/'))).toBe(true)
    expect(catalog.foods.every(food => food.width === 48 && food.height === 48)).toBe(true)
  })
})
