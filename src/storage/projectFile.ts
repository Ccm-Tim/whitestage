import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Project } from '../core/types'
import { normalizeProject } from '../core/defaults'

export interface ProjectAssetFile {
  id: string
  name: string
  type: string
  data: Uint8Array
}

export interface ImportedAsset {
  id: string
  name: string
  type: string
  blob: Blob
}

export interface ReadProjectResult {
  project: Project
  assets: ImportedAsset[]
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const meta = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const binary = meta.includes('base64') ? atob(body) : decodeURIComponent(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function sanitizeFileName(name: string): string {
  return (name || '未命名项目').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
}

/** 打包为 .wsp 工程文件（zip 容器：project.json + manifest.json + thumb.jpg + assets/） */
export function buildProjectZip(
  project: Project,
  thumb?: string,
  assets: ProjectAssetFile[] = [],
): Blob {
  const files: Record<string, Uint8Array> = {
    'project.json': strToU8(JSON.stringify(project, null, 2)),
    'manifest.json': strToU8(
      JSON.stringify(
        {
          app: 'WhiteStage',
          appName: '白膜预演台',
          schemaVersion: project.schemaVersion,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    ),
  }
  if (thumb && thumb.startsWith('data:image')) {
    try {
      files['thumb.jpg'] = dataUrlToBytes(thumb)
    } catch {
      /* 缩略图损坏时忽略 */
    }
  }
  if (assets.length > 0) {
    files['assets.json'] = strToU8(
      JSON.stringify(
        assets.map((a) => ({ id: a.id, name: a.name, type: a.type })),
        null,
        2,
      ),
    )
    for (const asset of assets) {
      files[`assets/${asset.id}`] = asset.data
    }
  }
  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
}

export async function readProjectZip(file: File): Promise<ReadProjectResult> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(buffer)
  } catch {
    throw new Error('不是有效的 .wsp 工程文件（zip 解包失败）')
  }
  const jsonBytes = unzipped['project.json']
  if (!jsonBytes) throw new Error('工程文件缺少 project.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(jsonBytes))
  } catch {
    throw new Error('工程文件内容不是合法 JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('工程文件内容损坏')
  const candidate = parsed as Partial<Project>
  if (candidate.schemaVersion !== 1) {
    throw new Error(`不支持的工程版本：${String(candidate.schemaVersion ?? '未知')}`)
  }
  if (!Array.isArray(candidate.cameras)) throw new Error('工程文件缺少相机数据')

  const assets: ImportedAsset[] = []
  if (unzipped['assets.json']) {
    try {
      const list = JSON.parse(strFromU8(unzipped['assets.json'])) as {
        id?: string
        name?: string
        type?: string
      }[]
      for (const item of list) {
        if (!item || typeof item.id !== 'string') continue
        const bytes = unzipped[`assets/${item.id}`]
        if (!bytes) continue
        const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        assets.push({
          id: item.id,
          name: item.name || '背景图片',
          type: item.type || 'image/jpeg',
          blob: new Blob([payload as ArrayBuffer], { type: item.type || 'image/jpeg' }),
        })
      }
    } catch {
      /* 资源清单损坏时忽略资源，仅导入工程数据 */
    }
  }

  return { project: normalizeProject(candidate), assets }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 2000)
}
