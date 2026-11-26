import type {
  AspectId,
  BackgroundConfig,
  CameraConfig,
  CameraTargetLock,
  EnvironmentConfig,
  Project,
  Vec3,
} from './types'
import { ASPECTS } from './constants'
import { lookAtRotation } from './math'
import { createSceneObject, normalizeObjects } from './objects'
import { normalizeFreePreviewGrid } from './preview'
import { normalizeCameraCuts } from './timeline'

export const uid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function createCamera(name: string, position: Vec3, focal = 50): CameraConfig {
  return {
    id: uid(),
    name,
    position,
    rotation: lookAtRotation(position, { x: 0, y: 1.05, z: 0 }),
    focal,
    sensor: 'ff',
    aperture: 2.8,
    focusDistance: 5.5,
    dof: false,
    targetLock: null,
    lensTemplateId: null,
  }
}

const cameraNameKey = (name: string) => name.trim().toLocaleLowerCase()

/** 生成不重复的“镜头 N”名称：取已有最大编号 +1，避免删除后出现重复 */
export function uniqueCameraName(cameras: { name: string }[], base = '镜头'): string {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped}\\s*(\\d+)`)
  let max = 0
  for (const camera of cameras) {
    const match = camera.name?.trim().match(pattern)
    if (match) max = Math.max(max, Number(match[1]))
  }
  const used = new Set(cameras.map((camera) => cameraNameKey(camera.name ?? '')))
  let number = max + 1
  let candidate = `${base} ${number}`
  while (used.has(cameraNameKey(candidate))) {
    number += 1
    candidate = `${base} ${number}`
  }
  return candidate
}

/** 修复历史工程 / 导入工程里的重复或空名称 */
export function dedupeCameraNames<T extends { name: string }>(cameras: T[]): T[] {
  const used = new Set<string>()
  return cameras.map((camera, index) => {
    const base = camera.name?.trim() || `镜头 ${index + 1}`
    let candidate = base
    let suffix = 2
    while (used.has(cameraNameKey(candidate))) {
      candidate = `${base} (${suffix})`
      suffix += 1
    }
    used.add(cameraNameKey(candidate))
    return candidate === camera.name ? camera : { ...camera, name: candidate }
  })
}

/** 解析锁定目标的世界坐标；摄像机目标会取镜头高度附近 */
export function resolveTargetPosition(
  project: Pick<Project, 'cameras' | 'objects'>,
  lock: CameraTargetLock,
  ignoreCameraId?: string,
): Vec3 | null {
  if (lock.kind === 'origin') return { x: 0, y: 0.92, z: 0 }
  if (lock.kind === 'point') return { ...lock.position }
  if (lock.kind === 'object') {
    const object = project.objects.find((item) => item.id === lock.id)
    if (!object) return null
    return {
      x: object.position.x,
      y:
        object.position.y +
        object.bodyOffset.y * Math.max(0.05, object.scale.y) +
        Math.max(0.05, object.aimHeight || object.height) * Math.max(0.05, object.scale.y),
      z: object.position.z,
    }
  }
  if (lock.id === ignoreCameraId) return null
  const target = project.cameras.find((c) => c.id === lock.id)
  if (!target) return null
  return { x: target.position.x, y: target.position.y + 0.12, z: target.position.z }
}

export function targetLabel(
  project: Pick<Project, 'cameras' | 'objects'>,
  lock: CameraTargetLock,
): string {
  if (lock.kind === 'origin') return '舞台中心'
  if (lock.kind === 'point') {
    return `坐标点 (${lock.position.x.toFixed(1)}, ${lock.position.z.toFixed(1)})`
  }
  if (lock.kind === 'object') {
    const object = project.objects.find((item) => item.id === lock.id)
    return object ? object.name : '已删除的对象'
  }
  const camera = project.cameras.find((c) => c.id === lock.id)
  return camera ? camera.name : '已删除的机位'
}

export function normalizeEnvironment(input?: Partial<EnvironmentConfig>): EnvironmentConfig {
  const kind: EnvironmentConfig['kind'] =
    input?.kind === 'glb' || input?.kind === 'ply' || input?.kind === 'splat'
      ? input.kind
      : 'none'
  const scale = Number(input?.scale)
  const rotation = Number(input?.rotation)
  const opacity = Number(input?.opacity)
  const groundSize = Number(input?.ground?.size)
  const groundOpacity = Number(input?.ground?.opacity)
  return {
    kind,
    assetId: kind !== 'none' && typeof input?.assetId === 'string' && input.assetId ? input.assetId : null,
    name: typeof input?.name === 'string' && input.name.trim() ? input.name : '3D 环境',
    scale: Number.isFinite(scale) ? Math.min(1000, Math.max(0.01, scale)) : 1,
    rotation: Number.isFinite(rotation) ? rotation : 0,
    position: {
      x: Number(input?.position?.x) || 0,
      y: Number(input?.position?.y) || 0,
      z: Number(input?.position?.z) || 0,
    },
    visible: input?.visible !== false,
    showInOutput: input?.showInOutput !== false,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.05, opacity)) : 1,
    contactShadows: input?.contactShadows !== false,
    ground: {
      enabled: input?.ground?.enabled !== false,
      size: Number.isFinite(groundSize) ? Math.min(500, Math.max(2, groundSize)) : 40,
      color:
        typeof input?.ground?.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.ground.color)
          ? input.ground.color
          : '#30343a',
      opacity: Number.isFinite(groundOpacity)
        ? Math.min(1, Math.max(0, groundOpacity))
        : 0.72,
    },
  }
}

export function environmentAssetId(project: Pick<Project, 'environment'>): string | null {
  const env = project.environment
  return env.kind !== 'none' && env.assetId ? env.assetId : null
}

export function createProject(name: string, aspect: AspectId = '16:9'): Project {
  const a = ASPECTS[aspect]
  const cam = createCamera('镜头 1', { x: 4.2, y: 2.25, z: 5.8 })
  return {
    schemaVersion: 1,
    id: uid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    background: { kind: 'solid', color: '#eef0f2', preset: 'white' },
    stage: { grid: true, gridWidth: 3, whiteFloor: false, shadows: true, fog: true },
    environment: normalizeEnvironment(),
    output: { aspect, width: a.width, height: a.height, fps: 24 },
    cameras: [cam],
    objects: [],
    timeline: {
      keyframes: [],
      durationFrames: 240,
      cameraCuts: [{ id: `cut-0-${cam.id}`, frame: 0, cameraId: cam.id }],
    },
    ui: {
      preview: {
        visible: true,
        x: 0,
        y: 0,
        w: 480,
        h: 306,
        cameraId: cam.id,
        layout: 'single',
        cameraIds: [cam.id],
        free: {
          cols: 2,
          rows: 2,
          colSizes: [0.5, 0.5],
          rowSizes: [0.5, 0.5],
        },
      },
      tool: 'translate',
      backgroundInEditor: true,
    },
  }
}

export function createDemoProject(): Project {
  const p = createProject('示例舞台')
  p.id = 'demo-project-m1c'
  p.cameras = [
    createCamera('镜头 1 · 中景', { x: 4.2, y: 2.25, z: 5.8 }),
    createCamera('镜头 2 · 长焦', { x: -5.4, y: 1.95, z: -4.4 }, 85),
  ]
  const man = createSceneObject('man-adult', [])
  man.position = { x: -0.55, y: 0, z: 0.1 }
  const dog = createSceneObject('dog', [man])
  dog.position = { x: 1.15, y: 0, z: 0.35 }
  dog.rotation = { x: 0, y: -0.55, z: 0 }
  p.objects = [man, dog]
  p.ui.preview.cameraId = p.cameras[0].id
  p.timeline.cameraCuts = [
    { id: `cut-0-${p.cameras[0].id}`, frame: 0, cameraId: p.cameras[0].id },
    { id: `cut-120-${p.cameras[1].id}`, frame: 120, cameraId: p.cameras[1].id },
  ]
  return p
}

/** 兼容旧版本 / 缺字段的工程文件 */
export function normalizeBackground(background: BackgroundConfig | undefined): BackgroundConfig {
  if (!background) return { kind: 'solid', color: '#eef0f2', preset: 'white' }
  if (background.kind === 'solid') return background
  if (background.kind === 'image') {
    return {
      ...background,
      mode: background.mode === 'plane' ? 'plane' : 'screen',
      offsetX: Number.isFinite(background.offsetX) ? background.offsetX : 0,
      offsetY: Number.isFinite(background.offsetY) ? background.offsetY : 0,
      scale: Number.isFinite(background.scale) && background.scale > 0 ? background.scale : 1,
      rotation: Number.isFinite(background.rotation) ? background.rotation : 0,
      plane: {
        x: background.plane?.x ?? 0,
        y: background.plane?.y ?? 3,
        z: background.plane?.z ?? -8,
        width: background.plane?.width ?? 12,
      },
      fallbackColor: background.fallbackColor ?? '#0e1013',
    }
  }
  if (background.kind === 'board') {
    const items = Array.isArray(background.items)
      ? background.items
          .filter((item) => item && typeof item.assetId === 'string' && item.assetId)
          .map((item, index) => ({
            id: typeof item.id === 'string' && item.id ? item.id : `board-${index + 1}`,
            assetId: item.assetId,
            name: item.name,
            width: Number(item.width) || undefined,
            height: Number(item.height) || undefined,
            preview: item.preview,
            plane: {
              x: Number(item.plane?.x) || 0,
              y: Number(item.plane?.y) || 0,
              z: Number(item.plane?.z) || 0,
              width: Math.max(0.5, Number(item.plane?.width) || 4),
            },
            rotation: Number(item.rotation) || 0,
            yaw: Number(item.yaw) || 0,
          }))
      : []
    return {
      kind: 'board',
      items,
      activeId: items.some((item) => item.id === background.activeId)
        ? background.activeId
        : items[0]?.id ?? null,
      fallbackColor: background.fallbackColor ?? '#0e1013',
      curve: Math.max(0, Math.min(360, Number(background.curve) || 0)),
      feather: Math.max(0, Math.min(0.4, Number(background.feather) || 0)),
      locked: background.locked === true,
    }
  }
  return {
    ...background,
    projection: background.projection === '180' ? '180' : '360',
    yaw: Number.isFinite(background.yaw) ? background.yaw : 0,
    pitch: Number.isFinite(background.pitch) ? background.pitch : 0,
    roll: Number.isFinite(background.roll) ? background.roll : 0,
    source: background.source === 'littleplanet' ? 'littleplanet' : 'equirect',
  }
}

export function backgroundAssetIds(background: BackgroundConfig | null | undefined): string[] {
  if (!background || background.kind === 'solid') return []
  if (background.kind === 'board') return background.items.map((item) => item.assetId)
  return [background.assetId]
}

/** 兼容旧版本 / 缺字段的工程文件 */
export function normalizeProject(input: Partial<Project> & { name?: string }): Project {
  const base = createProject(input.name?.trim() || '未命名项目')
  const rawCameras =
    Array.isArray(input.cameras) && input.cameras.length > 0 ? input.cameras : base.cameras
  const objects = normalizeObjects(input.objects)
  const cameras = dedupeCameraNames(
    rawCameras.map((camera) => {
      const lock = camera.targetLock
      const valid =
        lock &&
        (lock.kind !== 'camera' ||
          (lock.id !== camera.id && rawCameras.some((c) => c.id === lock.id))) &&
        (lock.kind !== 'object' || objects.some((object) => object.id === lock.id))
      return {
        ...camera,
        targetLock: valid ? lock : null,
        lensTemplateId: camera.lensTemplateId ?? null,
      }
    }),
  )
  const preview = {
    ...base.ui.preview,
    ...(input.ui?.preview ?? {}),
  }
  if (!cameras.some((c) => c.id === preview.cameraId)) preview.cameraId = cameras[0]?.id ?? null
  const previewLayout =
    preview.layout === 'dual' ||
    preview.layout === 'quad' ||
    preview.layout === 'five' ||
    preview.layout === 'free'
      ? preview.layout
      : 'single'
  const cameraIds = Array.isArray(preview.cameraIds)
    ? preview.cameraIds.filter((id) => cameras.some((camera) => camera.id === id))
    : []
  if (cameraIds.length === 0 && preview.cameraId) cameraIds.push(preview.cameraId)
  preview.layout = previewLayout
  preview.cameraIds = cameraIds.slice(0, 5)
  preview.free = normalizeFreePreviewGrid(preview.free)
  if (previewLayout === 'single') {
    preview.cameraIds = preview.cameraIds.slice(0, 1)
    preview.cameraId = preview.cameraIds[0] ?? preview.cameraId
  }
  const stage = { ...base.stage, ...(input.stage ?? {}) }
  stage.gridWidth = Math.min(8, Math.max(1, Number(stage.gridWidth) || base.stage.gridWidth))
  const durationFrames = Math.max(
    12,
    Math.min(3600, Math.round(Number(input.timeline?.durationFrames) || base.timeline.durationFrames)),
  )
  const cameraCuts = normalizeCameraCuts(
    input.timeline?.cameraCuts,
    cameras.map((camera) => camera.id),
    durationFrames,
    preview.cameraId,
  )

  return {
    ...base,
    ...input,
    schemaVersion: 1,
    id: input.id || base.id,
    createdAt: input.createdAt || base.createdAt,
    updatedAt: input.updatedAt || base.updatedAt,
    background: normalizeBackground(input.background),
    environment: normalizeEnvironment(input.environment),
    stage,
    output: { ...base.output, ...(input.output ?? {}) },
    cameras,
    objects,
    timeline: {
      keyframes: input.timeline?.keyframes ?? [],
      durationFrames,
      cameraCuts,
    },
    ui: {
      preview,
      tool: input.ui?.tool ?? base.ui.tool,
      backgroundInEditor: input.ui?.backgroundInEditor ?? base.ui.backgroundInEditor,
    },
  }
}
