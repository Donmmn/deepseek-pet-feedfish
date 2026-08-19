import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const pngSize = (relativePath: string): { width: number, height: number } => {
  const bytes = readFileSync(resolve(relativePath))
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

const pngColorType = (relativePath: string): number => readFileSync(resolve(relativePath))[25] as number

const pngAlphaValues = (relativePath: string): Set<number> => {
  const png = readFileSync(resolve(relativePath))
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const chunks: Buffer[] = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const encoded = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  const previous = Buffer.alloc(stride)
  const alpha = new Set<number>()
  let sourceOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = encoded[sourceOffset++] as number
    const row = Buffer.from(encoded.subarray(sourceOffset, sourceOffset + stride))
    sourceOffset += stride
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] as number : 0
      const above = previous[x] as number
      const upperLeft = x >= 4 ? previous[x - 4] as number : 0
      if (filter === 1) row[x] = (row[x] as number) + left
      else if (filter === 2) row[x] = (row[x] as number) + above
      else if (filter === 3) row[x] = (row[x] as number) + Math.floor((left + above) / 2)
      else if (filter === 4) row[x] = (row[x] as number) + paeth(left, above, upperLeft)
      else if (filter !== 0) throw new Error(`unsupported_png_filter:${filter}`)
    }
    for (let x = 3; x < stride; x += 4) alpha.add(row[x] as number)
    row.copy(previous)
  }
  return alpha
}

const paeth = (left: number, above: number, upperLeft: number): number => {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft
}

describe('layered character sprite contracts', () => {
  it('keeps a static body and registered four-frame face sheets', () => {
    expect(pngSize('assets/character-body.png')).toEqual({ width: 96, height: 96 })
    expect(pngSize('assets/character-face-idle.png')).toEqual({ width: 384, height: 96 })
    expect(pngSize('assets/character-face-feed.png')).toEqual({ width: 384, height: 96 })
  })

  it('keeps SVG limbs and aligned transparent raster feet on one skeletal contract', () => {
    for (const style of ['bare', 'black-stockings', 'white-stockings']) {
      const thigh = readFileSync(resolve(`assets/legs/${style}/thigh.svg`), 'utf8')
      const calf = readFileSync(resolve(`assets/legs/${style}/calf.svg`), 'utf8')
      expect(thigh).toContain('viewBox="0 0 46 24"')
      expect(calf).toContain('viewBox="0 0 24 54"')
      expect(thigh).toContain('<mask id="shape">')
      expect(calf).toContain('<mask id="shape">')
      expect(thigh).not.toContain('stroke="#202766"')
      expect(calf).not.toContain('stroke="#202766"')
      for (const perspective of ['far', 'near']) {
        const path = `assets/legs/${style}/foot-${perspective}.png`
        expect(pngSize(path)).toEqual({ width: 48, height: 28 })
        expect(pngColorType(path)).toBe(6)
        expect([...pngAlphaValues(path)].sort((a, b) => a - b)).toEqual([0, 255])
      }
    }
    for (const perspective of ['far', 'near']) {
      const path = `assets/legs/shoe-${perspective}.png`
      expect(pngSize(path)).toEqual({ width: 48, height: 28 })
      expect(pngColorType(path)).toBe(6)
      expect([...pngAlphaValues(path)].sort((a, b) => a - b)).toEqual([0, 255])
    }
  })

})
