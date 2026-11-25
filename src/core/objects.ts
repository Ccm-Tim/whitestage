import type { ObjectCategory, SceneObject, Vec3 } from './types'
import { normalizeJoints } from './pose'
import { normalizeWeapon } from './weapons'

export interface ObjectPoseOption {
  id: string
  label: string
}

export interface ObjectPreset {
  id: string
  kind: 'mannequin' | 'prop'
  category: ObjectCategory
  label: string
  /** 人偶身高 / 道具预设高度 */
  height: number
  /** 锁定瞄准高度（scale=1） */
  aimHeight: number
  color: string
  poses: ObjectPoseOption[]
  defaultPose: string
}

export const OBJECT_CATEGORIES: { id: ObjectCategory; label: string }[] = [
  { id: 'mannequin', label: '人偶' },
  { id: 'animal', label: '动物' },
  { id: 'plant', label: '植物' },
  { id: 'insect', label: '昆虫' },
  { id: 'building', label: '建筑' },
  { id: 'vehicle', label: '车辆' },
]

const MANNEQUIN_POSES: ObjectPoseOption[] = [
  { id: 'stand', label: '站立' },
  { id: 'walk', label: '行走' },
  { id: 'run', label: '奔跑' },
  { id: 'sit', label: '坐姿' },
  { id: 'wave', label: '挥手' },
  { id: 'tpose', label: 'T 型' },
]

const ANIMAL_POSES: ObjectPoseOption[] = [
  { id: 'stand', label: '站立' },
  { id: 'sit', label: '坐下' },
]

const WALK_POSES: ObjectPoseOption[] = [
  { id: 'stand', label: '站立' },
  { id: 'walk', label: '行走' },
]

const BIRD_POSES: ObjectPoseOption[] = [
  { id: 'stand', label: '站立' },
  { id: 'fly', label: '飞行' },
]

const BUTTERFLY_POSES: ObjectPoseOption[] = [
  { id: 'open', label: '展翅' },
  { id: 'closed', label: '收翅' },
]

const SINGLE_POSE: ObjectPoseOption[] = [{ id: 'default', label: '默认' }]

export const OBJECT_PRESETS: ObjectPreset[] = [
  {
    id: 'man-adult',
    kind: 'mannequin',
    category: 'mannequin',
    label: '成人男',
    height: 1.78,
    aimHeight: 1.53,
    color: '#8fa8c0',
    poses: MANNEQUIN_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'woman-adult',
    kind: 'mannequin',
    category: 'mannequin',
    label: '成人女',
    height: 1.68,
    aimHeight: 1.44,
    color: '#b58a96',
    poses: MANNEQUIN_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'boy-child',
    kind: 'mannequin',
    category: 'mannequin',
    label: '男孩',
    height: 1.28,
    aimHeight: 1.04,
    color: '#87ad91',
    poses: MANNEQUIN_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'girl-child',
    kind: 'mannequin',
    category: 'mannequin',
    label: '女孩',
    height: 1.2,
    aimHeight: 0.98,
    color: '#c7a06f',
    poses: MANNEQUIN_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'dog',
    kind: 'prop',
    category: 'animal',
    label: '狗',
    height: 0.62,
    aimHeight: 0.44,
    color: '#e7e9ec',
    poses: ANIMAL_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'cat',
    kind: 'prop',
    category: 'animal',
    label: '猫',
    height: 0.38,
    aimHeight: 0.28,
    color: '#eceef0',
    poses: ANIMAL_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'bird',
    kind: 'prop',
    category: 'animal',
    label: '鸟',
    height: 0.26,
    aimHeight: 0.2,
    color: '#e4e7ea',
    poses: BIRD_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'horse',
    kind: 'prop',
    category: 'animal',
    label: '马',
    height: 1.55,
    aimHeight: 1.1,
    color: '#e8e6e2',
    poses: WALK_POSES,
    defaultPose: 'stand',
  },
  {
    id: 'tree',
    kind: 'prop',
    category: 'plant',
    label: '树',
    height: 3.2,
    aimHeight: 1.9,
    color: '#dfe5dd',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
  {
    id: 'bush',
    kind: 'prop',
    category: 'plant',
    label: '灌木',
    height: 0.9,
    aimHeight: 0.55,
    color: '#dfe5dd',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
  {
    id: 'flower',
    kind: 'prop',
    category: 'plant',
    label: '花',
    height: 0.72,
    aimHeight: 0.5,
    color: '#e9e2d8',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
  {
    id: 'butterfly',
    kind: 'prop',
    category: 'insect',
    label: '蝴蝶',
    height: 0.3,
    aimHeight: 0.28,
    color: '#dfe3e8',
    poses: BUTTERFLY_POSES,
    defaultPose: 'open',
  },
  {
    id: 'house',
    kind: 'prop',
    category: 'building',
    label: '房屋',
    height: 2.8,
    aimHeight: 1.4,
    color: '#e6e8ea',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
  {
    id: 'tower',
    kind: 'prop',
    category: 'building',
    label: '塔',
    height: 5,
    aimHeight: 2.5,
    color: '#e3e6e9',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
  {
    id: 'car',
    kind: 'prop',
    category: 'vehicle',
    label: '汽车',
    height: 1.3,
    aimHeight: 0.7,
    color: '#e4e7ea',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
  {
    id: 'bus',
    kind: 'prop',
    category: 'vehicle',
    label: '巴士',
    height: 2.6,
    aimHeight: 1.35,
    color: '#e7eaec',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
  {
    id: 'bike',
    kind: 'prop',
    category: 'vehicle',
    label: '自行车',
    height: 1.1,
    aimHeight: 0.65,
    color: '#e2e5e8',
    poses: SINGLE_POSE,
    defaultPose: 'default',
  },
]

const PRESET_MAP = new Map(OBJECT_PRESETS.map((preset) => [preset.id, preset]))

export function getObjectPreset(id: string | undefined): ObjectPreset {
  return PRESET_MAP.get(id ?? '') ?? OBJECT_PRESETS[0]
}

export function presetsForCategory(category: ObjectCategory): ObjectPreset[] {
  return OBJECT_PRESETS.filter((preset) => preset.category === category)
}

export function objectAimHeight(object: Pick<SceneObject, 'kind' | 'variant' | 'height'>): number {
  const preset = getObjectPreset(object.variant)
  if (object.kind === 'mannequin') {
    return preset.aimHeight * (Math.max(0.3, object.height) / preset.height)
  }
  return preset.aimHeight
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase()

export function uniqueObjectName(objects: { name: string }[], base: string): string {
  const used = new Set(objects.map((object) => nameKey(object.name)))
  let index = 1
  let candidate = `${base} ${index}`
  while (used.has(nameKey(candidate))) {
    index += 1
    candidate = `${base} ${index}`
  }
  return candidate
}

function normalizeColor(color: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : fallback
}

export function createSceneObject(presetId: string, existing: SceneObject[]): SceneObject {
  const preset = getObjectPreset(presetId)
  const index = existing.length
  const angle = index * 1.7
  const radius = index === 0 ? 0 : 1.25 + (index % 3) * 0.55
  const position: Vec3 = {
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius,
  }
  const height = preset.height
  return {
    id: newId(),
    kind: preset.kind,
    variant: preset.id,
    category: preset.category,
    name: uniqueObjectName(existing, preset.label),
    position,
    homePosition: { ...position },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    allowUnderground: false,
    color: preset.color,
    skinColor: '#eceae4',
    shoeColor: '#c9ced5',
    faceDetail: true,
    pose: preset.defaultPose,
    joints: null,
    bodyOffset: { x: 0, y: 0, z: 0 },
    bodyRotation: { x: 0, y: 0, z: 0 },
    customId: null,
    weapon: null,
    height,
    aimHeight: objectAimHeight({ kind: preset.kind, variant: preset.id, height }),
    visible: true,
  }
}

/** 兼容旧工程：补齐对象字段、过滤异常数据、修复重名 */
export function normalizeObjects(input: SceneObject[] | undefined): SceneObject[] {
  if (!Array.isArray(input)) return []
  const usedNames = new Set<string>()
  const usedIds = new Set<string>()
  const objects: SceneObject[] = []
  for (const raw of input) {
    if (!raw || typeof raw.id !== 'string') continue
    const preset = getObjectPreset(raw.variant)
    const kind = raw.kind === 'prop' ? 'prop' : preset.kind
    const height = Math.max(0.2, Number(raw.height) || preset.height)
    let name = raw.name?.trim() || preset.label
    let suffix = 2
    while (usedNames.has(nameKey(name))) {
      name = `${raw.name?.trim() || preset.label} (${suffix})`
      suffix += 1
    }
    usedNames.add(nameKey(name))
    let id = raw.id
    while (usedIds.has(id)) id = newId()
    usedIds.add(id)
    const pose = preset.poses.some((option) => option.id === raw.pose)
      ? raw.pose
      : preset.defaultPose
    const joints = raw.joints ? normalizeJoints(raw.joints) : null
    const allowUnderground = raw.allowUnderground === true
    const object: SceneObject = {
      id,
      kind,
      variant: preset.id,
      category: preset.category,
      name,
      position: {
        x: Number(raw.position?.x) || 0,
        y: allowUnderground
          ? Number(raw.position?.y) || 0
          : Math.max(0, Number(raw.position?.y) || 0),
        z: Number(raw.position?.z) || 0,
      },
      homePosition: {
        x: Number(raw.homePosition?.x ?? raw.position?.x) || 0,
        y: Number(raw.homePosition?.y ?? raw.position?.y) || 0,
        z: Number(raw.homePosition?.z ?? raw.position?.z) || 0,
      },
      allowUnderground,
      rotation: {
        x: Number(raw.rotation?.x) || 0,
        y: Number(raw.rotation?.y) || 0,
        z: Number(raw.rotation?.z) || 0,
      },
      scale: {
        x: Math.min(1000, Math.max(0.01, Number(raw.scale?.x) || 1)),
        y: Math.min(1000, Math.max(0.01, Number(raw.scale?.y) || 1)),
        z: Math.min(1000, Math.max(0.01, Number(raw.scale?.z) || 1)),
      },
      color: normalizeColor(raw.color, preset.color),
      skinColor: normalizeColor(raw.skinColor, '#eceae4'),
      shoeColor: normalizeColor(raw.shoeColor, '#c9ced5'),
      faceDetail: raw.faceDetail !== false,
      pose,
      joints: joints && Object.keys(joints).length > 0 ? joints : null,
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
      customId: typeof raw.customId === 'string' ? raw.customId : null,
      weapon: normalizeWeapon(raw.weapon),
      height,
      aimHeight: objectAimHeight({ kind, variant: preset.id, height }),
      visible: raw.visible !== false,
    }
    objects.push(object)
  }
  return objects
}
