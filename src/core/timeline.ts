import type { CameraConfig, CameraCut, Keyframe, Project, SceneObject, Vec3 } from './types'
import { objectAimHeight } from './objects'

export interface CameraTrack {
  id: string
  position: Vec3
  rotation: Vec3
  focal: number
  aperture: number
  focusDistance: number
  dof: boolean
}

export interface ObjectTrack {
  id: string
  position: Vec3
  rotation: Vec3
  scale: Vec3
  height: number
  visible: boolean
}

export interface TimelineSnapshot {
  cameras: CameraTrack[]
  objects: ObjectTrack[]
}

export const DEFAULT_TIMELINE_FRAMES = 240

export function sortCameraCuts(cuts: CameraCut[]): CameraCut[] {
  return cuts.slice().sort((a, b) => a.frame - b.frame)
}

/**
 * 清洗切镜表：移除无效机位、限制在时间线内、同一帧只保留最后一个，
 * 并保证 0 帧有一个基准机位；没有切镜时用预览机位 / 第一个机位兜底。
 */
export function normalizeCameraCuts(
  raw: CameraCut[] | undefined,
  cameraIds: string[],
  durationFrames: number,
  fallbackCameraId?: string | null,
): CameraCut[] {
  const valid = new Set(cameraIds)
  const duration = Math.max(1, Math.round(durationFrames))
  const byFrame = new Map<number, CameraCut>()
  for (const cut of raw ?? []) {
    if (!cut || !valid.has(cut.cameraId)) continue
    const frame = Math.max(0, Math.min(duration, Math.round(Number(cut.frame) || 0)))
    byFrame.set(frame, {
      id: cut.id || `cut-${frame}-${cut.cameraId}`,
      frame,
      cameraId: cut.cameraId,
    })
  }
  const cuts = [...byFrame.values()].sort((a, b) => a.frame - b.frame)
  const fallback =
    (fallbackCameraId && valid.has(fallbackCameraId) ? fallbackCameraId : null) ??
    cameraIds[0] ??
    null
  if (fallback && (cuts.length === 0 || cuts[0].frame > 0)) {
    cuts.unshift({
      id: `cut-0-${fallback}`,
      frame: 0,
      cameraId: fallback,
    })
  }
  return cuts
}

export function cameraCutAt(cuts: CameraCut[], frame: number): CameraCut | undefined {
  return sortCameraCuts(cuts).find((cut) => cut.frame === Math.round(frame))
}

/** 当前帧的节目机位：最后一个 frame <= 当前帧的切镜；没有切镜则用预览机位。 */
export function activeCameraIdAt(
  project: Pick<Project, 'cameras' | 'timeline' | 'ui'>,
  frame: number,
): string | null {
  const cameraIds = new Set(project.cameras.map((camera) => camera.id))
  const target = Math.max(0, Math.round(frame))
  let active: string | null = null
  for (const cut of sortCameraCuts(project.timeline.cameraCuts ?? [])) {
    if (cut.frame > target) break
    if (cameraIds.has(cut.cameraId)) active = cut.cameraId
  }
  if (active) return active
  const preview = project.ui.preview
  if (preview.cameraId && cameraIds.has(preview.cameraId)) return preview.cameraId
  const slot = preview.cameraIds.find((id) => cameraIds.has(id))
  if (slot) return slot
  return project.cameras[0]?.id ?? null
}

function copyVec(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z }
}

function cameraTrack(camera: CameraConfig): CameraTrack {
  return {
    id: camera.id,
    position: copyVec(camera.position),
    rotation: copyVec(camera.rotation),
    focal: camera.focal,
    aperture: camera.aperture,
    focusDistance: camera.focusDistance,
    dof: camera.dof,
  }
}

function objectTrack(object: SceneObject): ObjectTrack {
  return {
    id: object.id,
    position: copyVec(object.position),
    rotation: copyVec(object.rotation),
    scale: copyVec(object.scale),
    height: object.height,
    visible: object.visible,
  }
}

export function captureTimelineSnapshot(project: Project): TimelineSnapshot {
  return {
    cameras: project.cameras.map(cameraTrack),
    objects: project.objects.map(objectTrack),
  }
}

export function snapshotOf(keyframe: Keyframe): TimelineSnapshot | null {
  const raw = keyframe.snapshot as Partial<TimelineSnapshot>
  if (!raw || !Array.isArray(raw.cameras) || !Array.isArray(raw.objects)) return null
  return {
    cameras: raw.cameras
      .filter((camera) => camera && typeof camera.id === 'string')
      .map((camera) => ({
        id: camera.id,
        position: { x: Number(camera.position?.x) || 0, y: Number(camera.position?.y) || 0, z: Number(camera.position?.z) || 0 },
        rotation: { x: Number(camera.rotation?.x) || 0, y: Number(camera.rotation?.y) || 0, z: Number(camera.rotation?.z) || 0 },
        focal: Number(camera.focal) || 50,
        aperture: Number(camera.aperture) || 2.8,
        focusDistance: Number(camera.focusDistance) || 5.5,
        dof: camera.dof === true,
      })),
    objects: raw.objects
      .filter((object) => object && typeof object.id === 'string')
      .map((object) => ({
        id: object.id,
        position: { x: Number(object.position?.x) || 0, y: Number(object.position?.y) || 0, z: Number(object.position?.z) || 0 },
        rotation: { x: Number(object.rotation?.x) || 0, y: Number(object.rotation?.y) || 0, z: Number(object.rotation?.z) || 0 },
        scale: { x: Number(object.scale?.x) || 1, y: Number(object.scale?.y) || 1, z: Number(object.scale?.z) || 1 },
        height: Number(object.height) || 1.7,
        visible: object.visible !== false,
      })),
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }
}

function sampleCamera(a: CameraTrack, b: CameraTrack, t: number): CameraTrack {
  return {
    id: a.id,
    position: lerpVec(a.position, b.position, t),
    rotation: lerpVec(a.rotation, b.rotation, t),
    focal: lerp(a.focal, b.focal, t),
    aperture: lerp(a.aperture, b.aperture, t),
    focusDistance: lerp(a.focusDistance, b.focusDistance, t),
    dof: t < 0.5 ? a.dof : b.dof,
  }
}

function sampleObject(a: ObjectTrack, b: ObjectTrack, t: number): ObjectTrack {
  return {
    id: a.id,
    position: lerpVec(a.position, b.position, t),
    rotation: lerpVec(a.rotation, b.rotation, t),
    scale: lerpVec(a.scale, b.scale, t),
    height: lerp(a.height, b.height, t),
    visible: t < 0.5 ? a.visible : b.visible,
  }
}

export function sampleTimeline(keyframes: Keyframe[], frame: number): TimelineSnapshot | null {
  const sorted = keyframes
    .filter((keyframe) => Number.isFinite(keyframe.frame))
    .slice()
    .sort((a, b) => a.frame - b.frame)
  if (sorted.length === 0) return null
  const target = Math.max(0, frame)
  if (target <= sorted[0].frame) return snapshotOf(sorted[0])
  if (target >= sorted[sorted.length - 1].frame) return snapshotOf(sorted[sorted.length - 1])

  let left = sorted[0]
  let right = sorted[sorted.length - 1]
  for (let index = 0; index < sorted.length - 1; index += 1) {
    if (target >= sorted[index].frame && target <= sorted[index + 1].frame) {
      left = sorted[index]
      right = sorted[index + 1]
      break
    }
  }
  const a = snapshotOf(left)
  const b = snapshotOf(right)
  if (!a) return b
  if (!b) return a
  const span = Math.max(1, right.frame - left.frame)
  const t = Math.min(1, Math.max(0, (target - left.frame) / span))

  const cameras: CameraTrack[] = []
  for (const camera of a.cameras) {
    const other = b.cameras.find((item) => item.id === camera.id)
    cameras.push(other ? sampleCamera(camera, other, t) : camera)
  }
  for (const camera of b.cameras) {
    if (!cameras.some((item) => item.id === camera.id)) cameras.push(camera)
  }

  const objects: ObjectTrack[] = []
  for (const object of a.objects) {
    const other = b.objects.find((item) => item.id === object.id)
    objects.push(other ? sampleObject(object, other, t) : object)
  }
  for (const object of b.objects) {
    if (!objects.some((item) => item.id === object.id)) objects.push(object)
  }
  return { cameras, objects }
}

export function applyTimelineSnapshot(project: Project, snapshot: TimelineSnapshot): void {
  for (const track of snapshot.cameras) {
    const camera = project.cameras.find((item) => item.id === track.id)
    if (!camera) continue
    camera.position = copyVec(track.position)
    camera.rotation = copyVec(track.rotation)
    camera.focal = track.focal
    camera.aperture = track.aperture
    camera.focusDistance = track.focusDistance
    camera.dof = track.dof
  }
  for (const track of snapshot.objects) {
    const object = project.objects.find((item) => item.id === track.id)
    if (!object) continue
    object.position = copyVec(track.position)
    object.rotation = copyVec(track.rotation)
    object.scale = copyVec(track.scale)
    object.height = track.height
    object.aimHeight = objectAimHeight(object)
    object.visible = track.visible
  }
}

export function frameOf(keyframes: Keyframe[], frame: number): Keyframe | undefined {
  return keyframes.find((keyframe) => keyframe.frame === frame)
}

export function nearestKeyframeFrame(keyframes: Keyframe[], frame: number, threshold = 4): number {
  let best = frame
  let bestDistance = threshold + 1
  for (const keyframe of keyframes) {
    const distance = Math.abs(keyframe.frame - frame)
    if (distance < bestDistance) {
      bestDistance = distance
      best = keyframe.frame
    }
  }
  return bestDistance <= threshold ? best : frame
}

export function timecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, fps || 24)
  const totalSeconds = Math.floor(frame / safeFps)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const restFrames = Math.abs(frame) % safeFps
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(restFrames).padStart(2, '0')}`
}
