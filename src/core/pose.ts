import type { Vec3 } from './types'

export const JOINT_IDS = [
  'spine',
  'neck',
  'head',
  'leftShoulder',
  'leftElbow',
  'rightShoulder',
  'rightElbow',
  'leftHip',
  'leftKnee',
  'rightHip',
  'rightKnee',
] as const

export type JointId = (typeof JOINT_IDS)[number]
export type JointMap = Partial<Record<JointId, Vec3>>

export const JOINT_LABELS: Record<JointId, string> = {
  spine: '脊柱',
  neck: '脖子',
  head: '头部',
  leftShoulder: '左肩',
  leftElbow: '左肘',
  rightShoulder: '右肩',
  rightElbow: '右肘',
  leftHip: '左髋',
  leftKnee: '左膝',
  rightHip: '右髋',
  rightKnee: '右膝',
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(-180, Math.min(180, value)) : 0

export function normalizeJoints(input: unknown): JointMap {
  if (!input || typeof input !== 'object') return {}
  const source = input as Record<string, Partial<Vec3> | undefined>
  const result: JointMap = {}
  for (const id of JOINT_IDS) {
    const value = source[id]
    if (!value) continue
    result[id] = {
      x: num(value.x),
      y: num(value.y),
      z: num(value.z),
    }
  }
  return result
}

export function mirrorJoints(joints: JointMap): JointMap {
  const result: JointMap = {}
  for (const id of JOINT_IDS) {
    const value = joints[id] ?? ZERO
    const mirrored: JointId =
      id === 'leftShoulder'
        ? 'rightShoulder'
        : id === 'rightShoulder'
          ? 'leftShoulder'
          : id === 'leftElbow'
            ? 'rightElbow'
            : id === 'rightElbow'
              ? 'leftElbow'
              : id === 'leftHip'
                ? 'rightHip'
                : id === 'rightHip'
                  ? 'leftHip'
                  : id === 'leftKnee'
                    ? 'rightKnee'
                    : id === 'rightKnee'
                      ? 'leftKnee'
                      : id
    result[mirrored] = { x: value.x, y: -value.y, z: -value.z }
  }
  return result
}

export function jointRotation(joints: JointMap, id: JointId): Vec3 {
  return joints[id] ?? ZERO
}

export interface QuickPose {
  id: string
  label: string
  joints: JointMap
  bodyOffset: Vec3
  bodyRotation: Vec3
}

const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })

export const QUICK_POSES: QuickPose[] = [
  {
    id: 'stand',
    label: '站立',
    joints: {},
    bodyOffset: v(),
    bodyRotation: v(),
  },
  {
    id: 'crouch',
    label: '半蹲',
    joints: {
      spine: v(8, 0, 0),
      leftHip: v(-35, 0, 0),
      rightHip: v(-35, 0, 0),
      leftKnee: v(70, 0, 0),
      rightKnee: v(70, 0, 0),
      leftShoulder: v(-10, 0, -8),
      rightShoulder: v(-10, 0, 8),
    },
    bodyOffset: v(0, -0.24, 0),
    bodyRotation: v(),
  },
  {
    id: 'sit',
    label: '坐地',
    joints: {
      spine: v(-5, 0, 0),
      leftHip: v(-82, 0, 0),
      rightHip: v(-82, 0, 0),
      leftKnee: v(82, 0, 0),
      rightKnee: v(82, 0, 0),
      leftShoulder: v(-10, 0, -10),
      rightShoulder: v(-10, 0, 10),
    },
    bodyOffset: v(0, -0.47, 0),
    bodyRotation: v(),
  },
  {
    id: 'prone',
    label: '趴下',
    joints: {
      leftShoulder: v(0, 0, -20),
      rightShoulder: v(0, 0, 20),
      leftHip: v(8, 0, 0),
      rightHip: v(8, 0, 0),
    },
    bodyOffset: v(0, 0.16, 0),
    bodyRotation: v(90, 0, 0),
  },
  {
    id: 'hero',
    label: '英雄落地',
    joints: {
      spine: v(18, 0, 0),
      leftHip: v(-78, 0, 4),
      leftKnee: v(108, 0, 0),
      rightHip: v(22, 0, -6),
      rightKnee: v(92, 0, 0),
      leftShoulder: v(-28, 0, -18),
      rightShoulder: v(12, 0, 24),
      leftElbow: v(0, 0, 18),
      rightElbow: v(0, 0, 28),
    },
    bodyOffset: v(0, -0.34, 0),
    bodyRotation: v(12, 0, 0),
  },
]

