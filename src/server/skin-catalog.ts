import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'

export const SKIN_SCHEMA = 'deepseek-token-pet/skin@1' as const
export const SKIN_CATALOG_SCHEMA = 'deepseek-token-pet/skins@1' as const

export type AppendageMode = 'tail' | 'legs'
export type LegStyle = 'bare' | 'black-stockings' | 'white-stockings'

export interface SkinAssetPathsV1 {
  body?: string
  faceIdle?: string
  faceFeed?: string
  thigh?: string
  calf?: string
  foot?: string
  shoe?: string
  footFar?: string
  footNear?: string
  shoeFar?: string
  shoeNear?: string
}

export interface SkinManifestV1 {
  schema: typeof SKIN_SCHEMA
  id: string
  name: string
  version: string
  appendageMode?: AppendageMode
  legStyle?: LegStyle
  assets: SkinAssetPathsV1
}

export interface SkinPackageV1 {
  file: string
  size: number
  manifest?: SkinManifestV1
  error?: string
}

export interface InstalledSkinV1 extends SkinManifestV1 {
  assetUrls: SkinAssetPathsV1
}

export interface SkinCatalogV1 {
  schema: typeof SKIN_CATALOG_SCHEMA
  packages: SkinPackageV1[]
  installed: InstalledSkinV1[]
}

const MAX_ARCHIVE_SIZE = 32 * 1024 * 1024
const MAX_ENTRY_SIZE = 8 * 1024 * 1024
const MAX_EXTRACTED_SIZE = 48 * 1024 * 1024
const MAX_ENTRIES = 256
const ASSET_KEYS = ['body', 'faceIdle', 'faceFeed', 'thigh', 'calf', 'foot', 'shoe', 'footFar', 'footNear', 'shoeFar', 'shoeNear'] as const

export function ensureSkinRoot(root: string): void {
  mkdirSync(root, { recursive: true })
  mkdirSync(resolve(root, 'installed'), { recursive: true })
  const readme = resolve(root, 'README.txt')
  if (!existsSync(resolve(root, 'README.md')) && !existsSync(readme)) {
    writeFileSync(readme, 'Put DeepSeek Token Pet skin ZIP files in this directory. Install and select them from the pet settings panel.\r\n', 'utf8')
  }
}

export function scanSkinCatalog(root: string): SkinCatalogV1 {
  ensureSkinRoot(root)
  const packages = findZipFiles(root).map(path => inspectSkinPackage(root, path))
  const installedRoot = resolve(root, 'installed')
  const installed = readdirSync(installedRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.tmp-'))
    .map(entry => readInstalledSkin(resolve(installedRoot, entry.name)))
    .filter((skin): skin is InstalledSkinV1 => skin !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name))
  return { schema: SKIN_CATALOG_SCHEMA, packages, installed }
}

export function installSkinPackage(root: string, packageFile: string): InstalledSkinV1 {
  ensureSkinRoot(root)
  const archivePath = safePath(root, packageFile)
  if (extname(archivePath).toLowerCase() !== '.zip' || !existsSync(archivePath)) throw new Error('skin_package_not_found')
  if (archivePath.startsWith(`${resolve(root, 'installed')}${sep}`)) throw new Error('skin_package_forbidden')
  const archive = readFileSync(archivePath)
  if (archive.length > MAX_ARCHIVE_SIZE) throw new Error('skin_package_too_large')
  const entries = readZipEntries(archive)
  const manifest = parseManifest(entries.get('manifest.json'))
  validateManifestAssets(manifest, name => entries.has(name))

  const installedRoot = resolve(root, 'installed')
  const target = safePath(installedRoot, manifest.id)
  const temporary = safePath(installedRoot, `.tmp-${manifest.id}-${randomUUID()}`)
  mkdirSync(temporary, { recursive: true })
  try {
    for (const [name, data] of entries) {
      const output = safePath(temporary, name)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, data)
    }
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    renameSync(temporary, target)
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
  const installed = readInstalledSkin(target)
  if (installed === undefined) throw new Error('installed_skin_invalid')
  return installed
}

export function resolveInstalledSkinAsset(root: string, skinId: string, assetPath: string): string | undefined {
  if (!validSkinId(skinId)) return undefined
  try {
    const installedRoot = resolve(root, 'installed')
    const skinRoot = safePath(installedRoot, skinId)
    const file = safePath(skinRoot, assetPath)
    return existsSync(file) && statSync(file).isFile() ? file : undefined
  } catch { return undefined }
}

function findZipFiles(root: string): string[] {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'installed') continue
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.zip') files.push(path)
    }
  }
  visit(root)
  return files.sort()
}

function inspectSkinPackage(root: string, path: string): SkinPackageV1 {
  const file = relative(root, path).split(sep).join('/')
  const size = statSync(path).size
  try {
    if (size > MAX_ARCHIVE_SIZE) throw new Error('skin_package_too_large')
    const entries = readZipEntries(readFileSync(path))
    const manifest = parseManifest(entries.get('manifest.json'))
    validateManifestAssets(manifest, name => entries.has(name))
    return { file, size, manifest }
  } catch (error) {
    return { file, size, error: error instanceof Error ? error.message : String(error) }
  }
}

function readInstalledSkin(directory: string): InstalledSkinV1 | undefined {
  try {
    const manifest = parseManifest(readFileSync(resolve(directory, 'manifest.json')))
    validateManifestAssets(manifest, name => existsSync(safePath(directory, name)))
    const assetUrls: SkinAssetPathsV1 = {}
    for (const key of ASSET_KEYS) {
      const path = manifest.assets[key]
      if (path !== undefined) assetUrls[key] = `/skin-assets/${encodeURIComponent(manifest.id)}/${encodeAssetPath(path)}`
    }
    return { ...manifest, assetUrls }
  } catch { return undefined }
}

function parseManifest(data: Uint8Array | undefined): SkinManifestV1 {
  if (data === undefined) throw new Error('manifest.json_missing')
  const value = JSON.parse(Buffer.from(data).toString('utf8')) as unknown
  if (!isRecord(value) || value.schema !== SKIN_SCHEMA) throw new Error('skin_manifest_schema_invalid')
  if (typeof value.id !== 'string' || !validSkinId(value.id)) throw new Error('skin_id_invalid')
  if (typeof value.name !== 'string' || value.name.trim() === '') throw new Error('skin_name_invalid')
  if (typeof value.version !== 'string' || value.version.trim() === '') throw new Error('skin_version_invalid')
  if (value.appendageMode !== undefined && value.appendageMode !== 'tail' && value.appendageMode !== 'legs') throw new Error('appendage_mode_invalid')
  if (value.legStyle !== undefined && !isLegStyle(value.legStyle)) throw new Error('leg_style_invalid')
  const sourceAssets = isRecord(value.assets) ? value.assets : {}
  const assets: SkinAssetPathsV1 = {}
  for (const key of ASSET_KEYS) {
    const path = sourceAssets[key]
    if (path === undefined) continue
    if (typeof path !== 'string' || !validArchivePath(path)) throw new Error(`skin_asset_path_invalid:${key}`)
    assets[key] = path
  }
  return {
    schema: SKIN_SCHEMA,
    id: value.id,
    name: value.name.trim(),
    version: value.version.trim(),
    ...(value.appendageMode === undefined ? {} : { appendageMode: value.appendageMode }),
    ...(value.legStyle === undefined ? {} : { legStyle: value.legStyle }),
    assets,
  }
}

function validateManifestAssets(manifest: SkinManifestV1, exists: (name: string) => boolean): void {
  for (const key of ASSET_KEYS) {
    const path = manifest.assets[key]
    if (path === undefined) continue
    const extension = extname(path).toLowerCase()
    const expected = key === 'thigh' || key === 'calf' ? '.svg' : '.png'
    if (extension !== expected) throw new Error(`skin_asset_type_invalid:${key}`)
    if (!exists(path)) throw new Error(`skin_asset_missing:${key}`)
  }
}

function readZipEntries(archive: Buffer): Map<string, Uint8Array> {
  const end = findEndOfCentralDirectory(archive)
  const count = archive.readUInt16LE(end + 10)
  const centralOffset = archive.readUInt32LE(end + 16)
  if (count > MAX_ENTRIES) throw new Error('skin_package_too_many_files')
  const entries = new Map<string, Uint8Array>()
  let offset = centralOffset
  let totalSize = 0
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('skin_zip_central_directory_invalid')
    const compression = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const uncompressedSize = archive.readUInt32LE(offset + 24)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localOffset = archive.readUInt32LE(offset + 42)
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replaceAll('\\', '/')
    offset += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (!validArchivePath(name)) throw new Error('skin_zip_path_invalid')
    if (uncompressedSize > MAX_ENTRY_SIZE) throw new Error('skin_zip_entry_too_large')
    totalSize += uncompressedSize
    if (totalSize > MAX_EXTRACTED_SIZE) throw new Error('skin_zip_expanded_too_large')
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('skin_zip_local_header_invalid')
    const localNameLength = archive.readUInt16LE(localOffset + 26)
    const localExtraLength = archive.readUInt16LE(localOffset + 28)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize)
    const data = compression === 0 ? Buffer.from(compressed) : compression === 8 ? inflateRawSync(compressed) : undefined
    if (data === undefined) throw new Error('skin_zip_compression_unsupported')
    if (data.length !== uncompressedSize) throw new Error('skin_zip_entry_size_mismatch')
    entries.set(name, data)
  }
  return entries
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimum = Math.max(0, archive.length - 65_557)
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new Error('skin_zip_end_record_missing')
}

function safePath(root: string, path: string): string {
  const normalizedRoot = resolve(root)
  const target = resolve(normalizedRoot, path)
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${sep}`)) throw new Error('skin_path_forbidden')
  return target
}

function validArchivePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\')) return false
  const segments = path.split('/')
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function validSkinId(id: string): boolean { return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) }
function isLegStyle(value: unknown): value is LegStyle { return value === 'bare' || value === 'black-stockings' || value === 'white-stockings' }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function encodeAssetPath(path: string): string { return path.split('/').map(encodeURIComponent).join('/') }
