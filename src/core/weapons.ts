import type { Vec3, WeaponConfig, WeaponType } from './types'

export const WEAPON_OPTIONS: { id: WeaponType; label: string }[] = [
  { id: 'sword', label: '剑' },
  { id: 'staff', label: '棍' },
  { id: 'knife', label: '刀' },
  { id: 'handblade', label: '手刀' },
  { id: 'pistol', label: '手枪' },
  { id: 'rifle', label: '步枪' },
]

const WEAPON_IDS = new Set<WeaponType>(WEAPON_OPTIONS.map((item) => item.id))

export function weaponLabel(type: WeaponType | null | undefined): string {
  return WEAPON_OPTIONS.find((item) => item.id === type)?.label ?? '武器'
}

const DEFAULT_ROTATION: Record<WeaponType, Vec3> = {
  sword: { x: -75, y: 0, z: 0 },
  staff: { x: -90, y: 0, z: 0 },
  knife: { x: -55, y: 0, z: 0 },
  handblade: { x: 0, y: 0, z: 0 },
  pistol: { x: 0, y: 0, z: 0 },
  rifle: { x: 0, y: 0, z: 0 },
}

export function createWeapon(type: WeaponType, hand: 'left' | 'right' = 'right'): WeaponConfig {
  return {
    type,
    hand,
    offset: { x: 0, y: 0, z: 0.03 },
    rotation: { ...DEFAULT_ROTATION[type] },
    scale: 1,
  }
}

export function normalizeWeapon(input: unknown): WeaponConfig | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<WeaponConfig>
  if (!raw.type || !WEAPON_IDS.has(raw.type)) return null
  const hand = raw.hand === 'left' ? 'left' : 'right'
  const num = (value: unknown, fallback = 0) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return {
    type: raw.type,
    hand,
    offset: {
      x: num(raw.offset?.x),
      y: num(raw.offset?.y),
      z: num(raw.offset?.z, 0.03),
    },
    rotation: {
      x: num(raw.rotation?.x),
      y: num(raw.rotation?.y),
      z: num(raw.rotation?.z),
    },
    scale: Math.min(10, Math.max(0.1, num(raw.scale, 1))),
  }
}
