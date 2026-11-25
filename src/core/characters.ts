import type { CustomCharacter, SceneObject } from './types'
import { createSceneObject, getObjectPreset, objectAimHeight, uniqueObjectName } from './objects'
import { normalizeJoints } from './pose'
import { normalizeWeapon } from './weapons'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const COLOR = /^#[0-9a-f]{6}$/i
const color = (value: unknown, fallback: string): string =>
  typeof value === 'string' && COLOR.test(value) ? value : fallback

export function uniqueCharacterName(
  characters: { name: string }[],
  base: string,
): string {
  const used = new Set(characters.map((item) => item.name.trim().toLocaleLowerCase()))
  let index = 1
  let candidate = base
  while (used.has(candidate.trim().toLocaleLowerCase())) {
    index += 1
    candidate = `${base} ${index}`
  }
  return candidate
}

export function normalizeCustomCharacter(input: unknown): CustomCharacter | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<CustomCharacter>
  const preset = getObjectPreset(raw.baseVariant)
  if (preset.kind !== 'mannequin') return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const joints = normalizeJoints(raw.joints)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name,
    baseVariant: preset.id,
    height: Math.min(2.4, Math.max(0.6, Number(raw.height) || preset.height)),
    color: color(raw.color, preset.color),
    skinColor: color(raw.skinColor, '#eceae4'),
    shoeColor: color(raw.shoeColor, '#c9ced5'),
    faceDetail: raw.faceDetail !== false,
    joints,
    bodyOffset: {
      x: Number(raw.bodyOffset?.x) || 0,
      y: Number(raw.bodyOffset?.y) || 0,
      z: Number(raw.bodyOffset?.z) || 0,
    },
    bodyRotation: {
      x: Number(raw.bodyRotation?.x) || 0,
      y: Number(raw.bodyRotation?.y) || 0,
      z: Number(raw.bodyRotation?.z) || 0,
    },
    weapon: normalizeWeapon(raw.weapon),
    createdAt: Number(raw.createdAt) || Date.now(),
  }
}

export function parseCharacterFile(text: string): CustomCharacter[] {
  const data = JSON.parse(text) as
    | { format?: string; characters?: unknown[] }
    | unknown[]
    | unknown
  const rawList = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && 'characters' in data
      ? ((data as { characters?: unknown[] }).characters ?? [])
      : [data]
  const characters = rawList
    .map((item) => normalizeCustomCharacter(item))
    .filter((item): item is CustomCharacter => !!item)
  if (characters.length === 0) throw new Error('没有可导入的角色')
  return characters
}

export function characterJson(character: CustomCharacter): string {
  return JSON.stringify(
    {
      format: 'whitestage-character',
      version: 1,
      characters: [character],
    },
    null,
    2,
  )
}

export function createCharacterFromObject(
  object: SceneObject,
  name: string,
): CustomCharacter {
  const preset = getObjectPreset(object.variant)
  return {
    id: newId(),
    name: name.trim() || preset.label,
    baseVariant: preset.kind === 'mannequin' ? preset.id : 'man-adult',
    height: object.height,
    color: object.color,
    skinColor: object.skinColor,
    shoeColor: object.shoeColor,
    faceDetail: object.faceDetail,
    joints: normalizeJoints(object.joints ?? {}),
    bodyOffset: { ...object.bodyOffset },
    bodyRotation: { ...object.bodyRotation },
    weapon: object.weapon ? JSON.parse(JSON.stringify(object.weapon)) : null,
    createdAt: Date.now(),
  }
}

export function createObjectFromCharacter(
  character: CustomCharacter,
  existing: SceneObject[],
): SceneObject {
  const base = createSceneObject(character.baseVariant, existing)
  return {
    ...base,
    name: uniqueObjectName(existing, character.name),
    customId: character.id,
    height: character.height,
    color: character.color,
    skinColor: character.skinColor,
    shoeColor: character.shoeColor,
    faceDetail: character.faceDetail,
    joints: normalizeJoints(character.joints),
    bodyOffset: { ...character.bodyOffset },
    bodyRotation: { ...character.bodyRotation },
    weapon: character.weapon ? JSON.parse(JSON.stringify(character.weapon)) : null,
    pose: 'stand',
    aimHeight: objectAimHeight({
      kind: 'mannequin',
      variant: character.baseVariant,
      height: character.height,
    }),
  }
}
