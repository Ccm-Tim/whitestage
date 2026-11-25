import type { CameraConfig, LensTemplate, SensorId } from './types'
import { SENSORS } from './constants'

/** 系统自带的镜头参数模板：固定、不可删除 */
export const BUILTIN_LENS_TEMPLATES: LensTemplate[] = [
  {
    id: 'builtin-cine-wide-24',
    name: '电影 · 广角环境 24mm',
    builtin: true,
    focal: 24,
    sensor: 'ff',
    aperture: 2.8,
    focusDistance: 4,
    dof: true,
  },
  {
    id: 'builtin-cine-standard-35',
    name: '电影 · 标准叙事 35mm',
    builtin: true,
    focal: 35,
    sensor: 'ff',
    aperture: 2,
    focusDistance: 3.5,
    dof: true,
  },
  {
    id: 'builtin-cine-medium-50',
    name: '电影 · 人物中景 50mm',
    builtin: true,
    focal: 50,
    sensor: 'ff',
    aperture: 1.8,
    focusDistance: 3,
    dof: true,
  },
  {
    id: 'builtin-cine-close-85',
    name: '电影 · 人物特写 85mm',
    builtin: true,
    focal: 85,
    sensor: 'ff',
    aperture: 1.4,
    focusDistance: 2.5,
    dof: true,
  },
  {
    id: 'builtin-cine-tele-135',
    name: '电影 · 长焦压缩 135mm',
    builtin: true,
    focal: 135,
    sensor: 'ff',
    aperture: 2.8,
    focusDistance: 6,
    dof: true,
  },
  {
    id: 'builtin-tv-dialogue-40',
    name: '剧集 · 双人对话 40mm',
    builtin: true,
    focal: 40,
    sensor: 's35',
    aperture: 4,
    focusDistance: 3,
    dof: true,
  },
  {
    id: 'builtin-tv-ots-50',
    name: '剧集 · 过肩镜头 50mm',
    builtin: true,
    focal: 50,
    sensor: 's35',
    aperture: 2.8,
    focusDistance: 2.2,
    dof: true,
  },
  {
    id: 'builtin-vlog-handheld-18',
    name: 'VLOG · 手持广角 18mm',
    builtin: true,
    focal: 18,
    sensor: 'ff',
    aperture: 4,
    focusDistance: 1.2,
    dof: false,
  },
  {
    id: 'builtin-vlog-selfie-24',
    name: 'VLOG · 自拍口播 24mm',
    builtin: true,
    focal: 24,
    sensor: 'ff',
    aperture: 2.8,
    focusDistance: 0.8,
    dof: false,
  },
  {
    id: 'builtin-doc-follow-70',
    name: '纪录片 · 长焦跟拍 70mm',
    builtin: true,
    focal: 70,
    sensor: 's35',
    aperture: 4,
    focusDistance: 8,
    dof: true,
  },
  {
    id: 'builtin-aerial-16',
    name: '航拍 · 大景 16mm',
    builtin: true,
    focal: 16,
    sensor: 'ff',
    aperture: 5.6,
    focusDistance: 12,
    dof: false,
  },
  {
    id: 'builtin-daily-mft-25',
    name: '日常 · 街拍 25mm',
    builtin: true,
    focal: 25,
    sensor: 'mft',
    aperture: 2.8,
    focusDistance: 3,
    dof: true,
  },
]

export function templateMatchesCamera(camera: CameraConfig, template: LensTemplate): boolean {
  return (
    Math.abs(camera.focal - template.focal) < 0.01 &&
    camera.sensor === template.sensor &&
    Math.abs(camera.aperture - template.aperture) < 0.01 &&
    Math.abs(camera.focusDistance - template.focusDistance) < 0.01 &&
    camera.dof === template.dof
  )
}

function isSensor(value: unknown): value is SensorId {
  return typeof value === 'string' && value in SENSORS
}

/** 解析用户上传的镜头模板文件（单个、数组或 { templates: [...] } 都支持） */
export function parseLensTemplateFile(raw: unknown): LensTemplate[] {
  const source = raw as { templates?: unknown } | unknown[] | null
  let list: unknown[]
  if (Array.isArray(source)) list = source
  else if (source && typeof source === 'object' && Array.isArray((source as { templates?: unknown[] }).templates)) {
    list = (source as { templates: unknown[] }).templates
  } else list = [source]

  const result: LensTemplate[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const value = item as Record<string, unknown>
    const focal = Number(value.focal)
    const aperture = Number(value.aperture)
    const focusDistance = Number(value.focusDistance)
    if (!Number.isFinite(focal) || focal < 8 || focal > 400) continue
    if (!Number.isFinite(aperture) || aperture < 0.7 || aperture > 32) continue
    if (!Number.isFinite(focusDistance) || focusDistance < 0.1 || focusDistance > 100) continue
    if (!isSensor(value.sensor)) continue
    const name =
      typeof value.name === 'string' && value.name.trim()
        ? value.name.trim().slice(0, 40)
        : `导入镜头 ${Math.round(focal)}mm`
    result.push({
      id: `import-${Math.random().toString(36).slice(2, 9)}`,
      name,
      focal,
      sensor: value.sensor,
      aperture,
      focusDistance,
      dof: Boolean(value.dof),
      builtin: false,
    })
  }
  return result
}
