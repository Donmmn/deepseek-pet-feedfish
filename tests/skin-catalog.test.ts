import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installSkinPackage, resolveInstalledSkinAsset, scanSkinCatalog } from '../src/server/skin-catalog.js'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('skin catalog', () => {
  it('scans and installs a replacement-only skin ZIP', () => {
    const root = mkdtempSync(join(tmpdir(), 'deepseek-pet-skin-'))
    temporaryRoots.push(root)
    const packageDir = join(root, 'dlc')
    mkdirSync(packageDir)
    const manifest = JSON.stringify({
      schema: 'deepseek-token-pet/skin@1',
      id: 'test-legs',
      name: 'Test Legs',
      version: '1.0.0',
      appendageMode: 'legs',
      legStyle: 'white-stockings',
      assets: { calf: 'assets/calf.svg' },
    })
    writeFileSync(join(packageDir, 'test.zip'), storedZip(new Map([
      ['manifest.json', Buffer.from(manifest)],
      ['assets/calf.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 54"/>')],
    ])))

    const catalog = scanSkinCatalog(root)
    expect(catalog.packages).toHaveLength(1)
    expect(catalog.packages[0]?.manifest?.id).toBe('test-legs')

    const installed = installSkinPackage(root, 'dlc/test.zip')
    expect(installed.assetUrls.calf).toContain('/skin-assets/test-legs/assets/calf.svg')
    expect(installed.assets.body).toBeUndefined()
    expect(resolveInstalledSkinAsset(root, 'test-legs', 'assets/calf.svg')).toBeDefined()
    expect(resolveInstalledSkinAsset(root, 'test-legs', '../../manifest.json')).toBeUndefined()

    const refreshed = scanSkinCatalog(root)
    expect(refreshed.installed[0]).toMatchObject({ id: 'test-legs', appendageMode: 'legs', legStyle: 'white-stockings' })
  })

  it('rejects traversal paths inside a ZIP', () => {
    const root = mkdtempSync(join(tmpdir(), 'deepseek-pet-skin-'))
    temporaryRoots.push(root)
    writeFileSync(join(root, 'bad.zip'), storedZip(new Map([['../manifest.json', Buffer.from('{}')]])))
    expect(() => installSkinPackage(root, 'bad.zip')).toThrow('skin_zip_path_invalid')
  })
})

function storedZip(entries: Map<string, Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let localOffset = 0
  for (const [name, data] of entries) {
    const nameBuffer = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    locals.push(local, nameBuffer, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(localOffset, 42)
    centrals.push(central, nameBuffer)
    localOffset += local.length + nameBuffer.length + data.length
  }
  const centralDirectory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.size, 8)
  end.writeUInt16LE(entries.size, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...locals, centralDirectory, end])
}
