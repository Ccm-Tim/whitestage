import * as THREE from 'three'
import type { Vec3 } from './types'

export const deg = (r: number) => (r * 180) / Math.PI
export const rad = (d: number) => (d * Math.PI) / 180

/** 由焦距与传感器高度（mm）求垂直视场角（度） */
export function fovFromFocal(focal: number, sensorHeight: number): number {
  const f = Math.max(0.1, focal)
  return (2 * Math.atan(sensorHeight / (2 * f)) * 180) / Math.PI
}

/** 由垂直视场角（度）反求焦距（mm） */
export function focalFromFov(fov: number, sensorHeight: number): number {
  return sensorHeight / (2 * Math.tan(rad(fov) / 2))
}

const tmpCamera = new THREE.PerspectiveCamera()

/** 计算从 position 看向 target 时的 YXZ 欧拉角（度），符合相机 -Z 朝向 */
export function lookAtRotation(position: Vec3, target: Vec3): Vec3 {
  tmpCamera.position.set(position.x, position.y, position.z)
  tmpCamera.lookAt(target.x, target.y, target.z)
  const e = new THREE.Euler().setFromQuaternion(tmpCamera.quaternion, 'YXZ')
  return { x: deg(e.x), y: deg(e.y), z: deg(e.z) }
}

/** 将 YXZ 欧拉角（度）应用到 Object3D */
export function applyRotation(obj: THREE.Object3D, rotation: Vec3) {
  obj.rotation.order = 'YXZ'
  obj.rotation.set(rad(rotation.x), rad(rotation.y), rad(rotation.z))
}

/** 让对象的 -Z 轴（镜头朝向）对准目标；普通 Object3D 的 lookAt 是 +Z 朝向，这里补 180° */
export function aimAt(obj: THREE.Object3D, target: Vec3) {
  obj.lookAt(target.x, target.y, target.z)
  obj.rotateY(Math.PI)
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export function round(v: number, digits = 2) {
  const p = Math.pow(10, digits)
  return Math.round(v * p) / p
}
