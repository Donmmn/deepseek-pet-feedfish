import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'

export const FOOD_SHEET_WIDTH = 48
export const FOOD_SHEET_HEIGHT = 48

export interface FoodAssetV1 {
  id: string
  name: string
  url: string
  weight: number
  width: number
  height: number
}

export interface RejectedFoodAssetV1 {
  path: string
  reason: 'invalid_name' | 'invalid_png' | 'invalid_dimensions'
}

export interface FoodCatalogV1 {
  schema: 'deepseek-token-pet/foods@1'
  scannedAt: number
  directory: string
  discoveredFiles: number
  count: number
  totalWeight: number
  foods: FoodAssetV1[]
  rejected: RejectedFoodAssetV1[]
}

export function scanFoodCatalog(directory: string, publicPrefix = '/assets/foods'): FoodCatalogV1 {
  const foods: FoodAssetV1[] = []
  const rejected: RejectedFoodAssetV1[] = []
  let discoveredFiles = 0

  const visit = (current: string): void => {
    if (!existsSync(current)) return
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) { visit(absolute); continue }
      if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.png') continue
      discoveredFiles += 1
      const relativePath = relative(directory, absolute).split(sep).join('/')
      const stem = basename(entry.name, extname(entry.name))
      const weightMatch = /\{([1-9]\d*)\}$/.exec(stem)
      if (weightMatch === null) {
        rejected.push({ path: relativePath, reason: 'invalid_name' })
        continue
      }
      const dimensions = readPngDimensions(absolute)
      if (dimensions === undefined) {
        rejected.push({ path: relativePath, reason: 'invalid_png' })
        continue
      }
      if (dimensions.width !== FOOD_SHEET_WIDTH || dimensions.height !== FOOD_SHEET_HEIGHT) {
        rejected.push({ path: relativePath, reason: 'invalid_dimensions' })
        continue
      }
      const weight = Number(weightMatch[1])
      const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
      foods.push({
        id: relativePath,
        name: stem.slice(0, weightMatch.index),
        url: `${publicPrefix.replace(/\/$/, '')}/${encodedPath}`,
        weight,
        ...dimensions,
      })
    }
  }

  visit(directory)
  return {
    schema: 'deepseek-token-pet/foods@1',
    scannedAt: Date.now(),
    directory,
    discoveredFiles,
    count: foods.length,
    totalWeight: foods.reduce((sum, food) => sum + food.weight, 0),
    foods,
    rejected,
  }
}

function readPngDimensions(path: string): { width: number; height: number } | undefined {
  const header = readFileSync(path).subarray(0, 24)
  if (header.length < 24 || header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return undefined
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
}
