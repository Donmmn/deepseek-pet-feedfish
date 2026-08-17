import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pngSize = (relativePath: string): { width: number, height: number } => {
  const bytes = readFileSync(resolve(relativePath))
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('layered character sprite contracts', () => {
  it('keeps a static body and registered four-frame face sheets', () => {
    expect(pngSize('assets/character-body.png')).toEqual({ width: 96, height: 96 })
    expect(pngSize('assets/character-face-idle.png')).toEqual({ width: 384, height: 96 })
    expect(pngSize('assets/character-face-feed.png')).toEqual({ width: 384, height: 96 })
  })
})
