import * as THREE from 'three'
import type { SceneObject } from '../core/types'
import { getObjectPreset } from '../core/objects'
import { buildWeapon } from './weapons'

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.rotation.set(rotation[0], rotation[1], rotation[2])
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function limb(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  material: THREE.Material,
  part: string,
): THREE.Group {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, 12),
    material,
  )
  mesh.position.y = -length / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.part = part
  group.add(mesh)
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.02, 12, 8), material)
  joint.castShadow = true
  joint.userData.part = part
  group.add(joint)
  parent.add(group)
  return group
}

export function objectVisualSignature(object: SceneObject): string {
  return [
    object.variant,
    object.pose,
    object.color,
    object.height,
    object.skinColor,
    object.shoeColor,
    object.faceDetail ? 'face' : 'plain',
    JSON.stringify(object.joints ?? null),
    JSON.stringify(object.bodyOffset ?? null),
    JSON.stringify(object.bodyRotation ?? null),
    JSON.stringify(object.weapon ?? null),
  ].join('|')
}

export function disposeObject3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => materials.add(item))
    else if (material) materials.add(material)
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

interface MannequinParts {
  body: THREE.Group
  torso: THREE.Group
  neck: THREE.Group
  head: THREE.Group
  leftHip: THREE.Group
  rightHip: THREE.Group
  leftKnee: THREE.Group
  rightKnee: THREE.Group
  leftShoulder: THREE.Group
  rightShoulder: THREE.Group
  leftElbow: THREE.Group
  rightElbow: THREE.Group
  scale: number
}

function buildMannequin(object: SceneObject): THREE.Group {
  const preset = getObjectPreset(object.variant)
  const female = object.variant === 'woman-adult' || object.variant === 'girl-child'
  const child = object.variant === 'boy-child' || object.variant === 'girl-child'
  const k = Math.max(0.35, object.height) / preset.height
  const headBoost = child ? 1.2 : 1
  const shoulderScale = child ? 0.86 : 1
  const hipScale = child ? 0.9 : 1

  const suit = new THREE.MeshStandardMaterial({
    color: new THREE.Color(object.color),
    roughness: 0.86,
    metalness: 0.02,
  })
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color(object.skinColor || '#eceae4'),
    roughness: 0.72,
  })
  const shoe = new THREE.MeshStandardMaterial({
    color: new THREE.Color(object.shoeColor || '#c9ced5'),
    roughness: 0.82,
  })
  const face = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.6 })
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.72 })
  const sole = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.92 })

  const hipY = (female ? 0.88 : 0.93) * k
  const torsoLen = (female ? 0.45 : 0.48) * k * (child ? 0.94 : 1)
  const headR = (female ? 0.105 : 0.115) * k * headBoost
  const shoulderX = (female ? 0.18 : 0.21) * k * shoulderScale
  const hipX = (female ? 0.12 : 0.1) * k * hipScale
  const thigh = (female ? 0.42 : 0.44) * k * (child ? 0.88 : 1)
  const shin = (female ? 0.41 : 0.43) * k * (child ? 0.88 : 1)
  const upperArm = (female ? 0.27 : 0.29) * k * (child ? 0.86 : 1)
  const lowerArm = (female ? 0.25 : 0.27) * k * (child ? 0.86 : 1)
  const torsoR = (female ? 0.145 : 0.16) * k * (child ? 0.96 : 1)
  const shoulderLocal = torsoLen * 0.92

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const pelvis = new THREE.Group()
  pelvis.position.y = hipY
  body.add(pelvis)

  const pelvisMesh = addMesh(
    pelvis,
    new THREE.CapsuleGeometry(hipX * 1.15, 0.12 * k, 5, 14),
    suit,
    [0, -0.015, 0],
  )
  pelvisMesh.userData.part = 'pelvis'

  const torso = new THREE.Group()
  torso.position.y = 0.02
  pelvis.add(torso)
  const torsoMesh = addMesh(
    torso,
    new THREE.CapsuleGeometry(torsoR, Math.max(0.02, torsoLen * 0.62), 5, 16),
    suit,
    [0, torsoLen * 0.5, 0],
  )
  torsoMesh.userData.part = 'torso'
  // 训练服拉链
  const zipper = addMesh(
    torso,
    new THREE.BoxGeometry(0.012 * k, torsoLen * 0.78, 0.008 * k),
    white,
    [0, torsoLen * 0.5, torsoR * 0.98],
  )
  zipper.userData.part = 'torso'
  // 领口
  const collar = addMesh(
    torso,
    new THREE.CylinderGeometry(0.055 * k, 0.06 * k, 0.03 * k, 18),
    white,
    [0, torsoLen * 0.98, 0],
  )
  collar.userData.part = 'torso'

  // 脖子和头
  const neckGroup = new THREE.Group()
  neckGroup.position.set(0, torsoLen + 0.02 * k, 0)
  torso.add(neckGroup)
  const neck = addMesh(
    neckGroup,
    new THREE.CylinderGeometry(0.042 * k, 0.05 * k, 0.09 * k, 16),
    skin,
    [0, 0.045 * k, 0],
  )
  neck.userData.part = 'neck'
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 0.09 * k + headR * 0.9, 0)
  neckGroup.add(headGroup)
  const head = addMesh(headGroup, new THREE.SphereGeometry(headR, 24, 18), skin, [0, 0, 0])
  head.name = 'head'
  head.userData.part = 'head'
  head.scale.set(1, 1.06, 0.96)
  if (object.faceDetail) addFace(head, headR, skin, face)

  const parts: MannequinParts = {
    body,
    torso,
    neck: neckGroup,
    head: headGroup,
    leftHip: new THREE.Group(),
    rightHip: new THREE.Group(),
    leftKnee: new THREE.Group(),
    rightKnee: new THREE.Group(),
    leftShoulder: new THREE.Group(),
    rightShoulder: new THREE.Group(),
    leftElbow: new THREE.Group(),
    rightElbow: new THREE.Group(),
    scale: k,
  }

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group()
    hip.position.set(side * hipX, -0.02, 0)
    pelvis.add(hip)
    const thighGroup = limb(
      hip,
      0.072 * k,
      thigh,
      suit,
      side < 0 ? 'leftThigh' : 'rightThigh',
    )
    const knee = new THREE.Group()
    knee.position.y = -thigh
    thighGroup.add(knee)
    const shinGroup = limb(knee, 0.058 * k, shin, suit, side < 0 ? 'leftShin' : 'rightShin')
    const foot = addMesh(
      shinGroup,
      new THREE.BoxGeometry(0.16 * k, 0.065 * k, 0.27 * k),
      shoe,
      [0, -shin - 0.018 * k, 0.055 * k],
    )
    foot.name = side < 0 ? 'leftFoot' : 'rightFoot'
    foot.userData.part = side < 0 ? 'leftFoot' : 'rightFoot'
    const soleMesh = addMesh(
      shinGroup,
      new THREE.BoxGeometry(0.165 * k, 0.018 * k, 0.275 * k),
      sole,
      [0, -shin - 0.05 * k, 0.055 * k],
    )
    soleMesh.userData.part = side < 0 ? 'leftFoot' : 'rightFoot'
    soleMesh.castShadow = true
    foot.castShadow = true
    return { hip, knee }
  }
  const left = buildLeg(-1)
  const right = buildLeg(1)
  parts.leftHip = left.hip
  parts.rightHip = right.hip
  parts.leftKnee = left.knee
  parts.rightKnee = right.knee

  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * shoulderX, shoulderLocal, 0)
    torso.add(shoulder)
    const upper = limb(
      shoulder,
      0.052 * k,
      upperArm,
      suit,
      side < 0 ? 'leftUpperArm' : 'rightUpperArm',
    )
    const elbow = new THREE.Group()
    elbow.position.y = -upperArm
    upper.add(elbow)
    const fore = limb(
      elbow,
      0.043 * k,
      lowerArm,
      suit,
      side < 0 ? 'leftForearm' : 'rightForearm',
    )
    const handGroup = new THREE.Group()
    handGroup.position.y = -lowerArm
    handGroup.userData.hand = side < 0 ? 'left' : 'right'
    fore.add(handGroup)
    const hand = addMesh(handGroup, new THREE.SphereGeometry(0.058 * k, 14, 10), skin, [
      0,
      0,
      0,
    ])
    hand.name = side < 0 ? 'leftHand' : 'rightHand'
    hand.userData.part = side < 0 ? 'leftHand' : 'rightHand'
    return { shoulder, elbow, hand: handGroup }
  }
  const leftArm = buildArm(-1)
  const rightArm = buildArm(1)
  parts.leftShoulder = leftArm.shoulder
  parts.rightShoulder = rightArm.shoulder
  parts.leftElbow = leftArm.elbow
  parts.rightElbow = rightArm.elbow

  if (object.weapon) {
    const handGroup = object.weapon.hand === 'left' ? leftArm.hand : rightArm.hand
    const weapon = buildWeapon(object.weapon)
    weapon.position.set(
      object.weapon.offset.x,
      object.weapon.offset.y,
      object.weapon.offset.z,
    )
    weapon.rotation.set(
      THREE.MathUtils.degToRad(object.weapon.rotation.x),
      THREE.MathUtils.degToRad(object.weapon.rotation.y),
      THREE.MathUtils.degToRad(object.weapon.rotation.z),
    )
    weapon.scale.setScalar(object.weapon.scale)
    handGroup.add(weapon)
  }

  if (object.joints && Object.keys(object.joints).length > 0) {
    applyMannequinPose(parts, 'stand')
    applyJoints(parts, object.joints)
  } else {
    applyMannequinPose(parts, object.pose)
  }

  parts.torso.userData.joint = 'spine'
  parts.neck.userData.joint = 'neck'
  parts.head.userData.joint = 'head'
  parts.leftShoulder.userData.joint = 'leftShoulder'
  parts.rightShoulder.userData.joint = 'rightShoulder'
  parts.leftElbow.userData.joint = 'leftElbow'
  parts.rightElbow.userData.joint = 'rightElbow'
  parts.leftHip.userData.joint = 'leftHip'
  parts.rightHip.userData.joint = 'rightHip'
  parts.leftKnee.userData.joint = 'leftKnee'
  parts.rightKnee.userData.joint = 'rightKnee'

  root.position.set(
    object.bodyOffset?.x ?? 0,
    object.bodyOffset?.y ?? 0,
    object.bodyOffset?.z ?? 0,
  )
  root.rotation.order = 'YXZ'
  root.rotation.set(
    THREE.MathUtils.degToRad(object.bodyRotation?.x ?? 0),
    THREE.MathUtils.degToRad(object.bodyRotation?.y ?? 0),
    THREE.MathUtils.degToRad(object.bodyRotation?.z ?? 0),
  )

  const rootGroup = new THREE.Group()
  rootGroup.add(root)
  rootGroup.userData.objectId = object.id
  return rootGroup
}
function addFace(
  head: THREE.Object3D,
  headR: number,
  skin: THREE.Material,
  face: THREE.Material,
) {
  const eyeGeo = new THREE.SphereGeometry(headR * 0.11, 12, 10)
  for (const side of [-1, 1] as const) {
    addMesh(head, eyeGeo, face, [side * headR * 0.34, headR * 0.08, headR * 0.88])
    addMesh(
      head,
      new THREE.BoxGeometry(headR * 0.3, headR * 0.04, headR * 0.026),
      face,
      [side * headR * 0.34, headR * 0.25, headR * 0.86],
      [0, 0, side * 0.08],
    )
    addMesh(head, new THREE.SphereGeometry(headR * 0.18, 12, 10), skin, [
      side * headR * 0.96,
      0,
      0,
    ])
  }
  addMesh(
    head,
    new THREE.ConeGeometry(headR * 0.085, headR * 0.18, 8),
    skin,
    [0, -headR * 0.02, headR * 0.94],
    [Math.PI / 2, 0, 0],
  )
  addMesh(
    head,
    new THREE.BoxGeometry(headR * 0.38, headR * 0.035, headR * 0.02),
    face,
    [0, -headR * 0.38, headR * 0.9],
  )
  head.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) child.userData.part = 'head'
  })
}

function applyMannequinPose(parts: MannequinParts, pose: string) {
  const r = THREE.MathUtils.degToRad
  const {
    body,
    torso,
    neck,
    head,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftShoulder,
    rightShoulder,
  } = parts
  body.position.set(0, 0, 0)
  torso.rotation.set(0, 0, 0)
  neck.rotation.set(0, 0, 0)
  head.rotation.set(0, 0, 0)
  leftHip.rotation.set(0, 0, 0)
  rightHip.rotation.set(0, 0, 0)
  leftKnee.rotation.set(0, 0, 0)
  rightKnee.rotation.set(0, 0, 0)
  leftShoulder.rotation.set(0, 0, r(-7))
  rightShoulder.rotation.set(0, 0, r(7))
  parts.leftElbow.rotation.set(0, 0, 0)
  parts.rightElbow.rotation.set(0, 0, 0)

  if (pose === 'walk') {
    leftHip.rotation.x = r(24)
    rightHip.rotation.x = r(-24)
    leftKnee.rotation.x = r(12)
    rightKnee.rotation.x = r(26)
    leftShoulder.rotation.x = r(-20)
    rightShoulder.rotation.x = r(20)
    body.position.y = 0.012
  } else if (pose === 'run') {
    leftHip.rotation.x = r(42)
    rightHip.rotation.x = r(-36)
    leftKnee.rotation.x = r(58)
    rightKnee.rotation.x = r(20)
    leftShoulder.rotation.x = r(-34)
    rightShoulder.rotation.x = r(34)
    torso.rotation.x = r(7)
    body.position.y = 0.035
  } else if (pose === 'sit') {
    body.position.y = -0.47 * parts.scale
    leftHip.rotation.x = r(-82)
    rightHip.rotation.x = r(-82)
    leftKnee.rotation.x = r(82)
    rightKnee.rotation.x = r(82)
    torso.rotation.x = r(-5)
    leftShoulder.rotation.x = r(-12)
    rightShoulder.rotation.x = r(-12)
    leftShoulder.rotation.z = r(-10)
    rightShoulder.rotation.z = r(10)
  } else if (pose === 'wave') {
    rightShoulder.rotation.z = r(138)
    rightShoulder.rotation.x = r(-8)
    parts.rightElbow.rotation.z = r(24)
    leftShoulder.rotation.z = r(-8)
  } else if (pose === 'tpose') {
    leftShoulder.rotation.z = r(-88)
    rightShoulder.rotation.z = r(88)
    leftShoulder.rotation.x = 0
    rightShoulder.rotation.x = 0
  }
}

function applyJoints(parts: MannequinParts, joints: Record<string, { x: number; y: number; z: number }>) {
  const r = THREE.MathUtils.degToRad
  const set = (object: THREE.Object3D, id: string) => {
    const value = joints[id] ?? { x: 0, y: 0, z: 0 }
    object.rotation.set(r(value.x), r(value.y), r(value.z))
  }
  parts.body.position.set(0, 0, 0)
  set(parts.torso, 'spine')
  set(parts.neck, 'neck')
  set(parts.head, 'head')
  set(parts.leftShoulder, 'leftShoulder')
  set(parts.leftElbow, 'leftElbow')
  set(parts.rightShoulder, 'rightShoulder')
  set(parts.rightElbow, 'rightElbow')
  set(parts.leftHip, 'leftHip')
  set(parts.leftKnee, 'leftKnee')
  set(parts.rightHip, 'rightHip')
  set(parts.rightKnee, 'rightKnee')
}

// ---- 道具 ----

function buildProp(object: SceneObject): THREE.Group {
  const main = new THREE.MeshStandardMaterial({
    color: new THREE.Color(object.color),
    roughness: 0.8,
    metalness: 0.03,
  })
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f2f4, roughness: 0.72 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x30353c, roughness: 0.68 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x6d7f8d, roughness: 0.3, metalness: 0.15 })
  const green = new THREE.MeshStandardMaterial({ color: 0x466b4a, roughness: 0.9 })
  const root = new THREE.Group()
  root.userData.objectId = object.id

  const box = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    p: [number, number, number],
    r: [number, number, number] = [0, 0, 0],
  ) => addMesh(parent, new THREE.BoxGeometry(w, h, d), mat, p, r)
  const sphere = (
    parent: THREE.Object3D,
    radius: number,
    mat: THREE.Material,
    p: [number, number, number],
    s: [number, number, number] = [1, 1, 1],
  ) => {
    const mesh = addMesh(parent, new THREE.SphereGeometry(radius, 18, 14), mat, p)
    mesh.scale.set(s[0], s[1], s[2])
    return mesh
  }
  const cylinder = (
    parent: THREE.Object3D,
    rTop: number,
    rBottom: number,
    h: number,
    mat: THREE.Material,
    p: [number, number, number],
    r: [number, number, number] = [0, 0, 0],
    segments = 16,
  ) => addMesh(parent, new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat, p, r)

  if (object.variant === 'dog' || object.variant === 'cat') {
    const isCat = object.variant === 'cat'
    const body = new THREE.Group()
    body.position.y = isCat ? 0.24 : 0.4
    root.add(body)
    if (object.pose === 'sit') {
      body.rotation.x = -0.28
    }
    const bodyMesh = addMesh(
      body,
      new THREE.CapsuleGeometry(isCat ? 0.11 : 0.16, isCat ? 0.3 : 0.48, 5, 14),
      main,
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    )
    bodyMesh.scale.z = 1
    const head = sphere(body, isCat ? 0.105 : 0.145, main, [0, isCat ? 0.13 : 0.15, isCat ? 0.25 : 0.35])
    const snout = box(
      body,
      isCat ? 0.1 : 0.15,
      isCat ? 0.07 : 0.1,
      isCat ? 0.1 : 0.14,
      white,
      [0, isCat ? 0.09 : 0.1, isCat ? 0.34 : 0.47],
    )
    snout.castShadow = true
    const earGeo = new THREE.ConeGeometry(isCat ? 0.045 : 0.055, isCat ? 0.11 : 0.13, 4)
    addMesh(body, earGeo, main, [-0.065, isCat ? 0.22 : 0.26, isCat ? 0.24 : 0.33])
    addMesh(body, earGeo, main, [0.065, isCat ? 0.22 : 0.26, isCat ? 0.24 : 0.33])
    const eyeGeo = new THREE.SphereGeometry(0.016, 8, 6)
    addMesh(body, eyeGeo, dark, [-0.04, isCat ? 0.15 : 0.18, isCat ? 0.32 : 0.44])
    addMesh(body, eyeGeo, dark, [0.04, isCat ? 0.15 : 0.18, isCat ? 0.32 : 0.44])
    const legPositions = isCat
      ? [
          [-0.085, 0.16, 0.15],
          [0.085, 0.16, 0.15],
          [-0.085, 0.16, -0.16],
          [0.085, 0.16, -0.16],
        ]
      : [
          [-0.11, 0.2, 0.2],
          [0.11, 0.2, 0.2],
          [-0.11, 0.2, -0.2],
          [0.11, 0.2, -0.2],
        ]
    for (const [x, , z] of legPositions) {
      cylinder(
        body,
        isCat ? 0.026 : 0.035,
        isCat ? 0.03 : 0.04,
        isCat ? 0.18 : 0.28,
        main,
        [x, isCat ? -0.15 : -0.26, z],
      )
    }
    if (isCat) {
      const tail = new THREE.Group()
      tail.position.set(0, 0.05, -0.22)
      body.add(tail)
      let current: THREE.Object3D = tail
      for (let i = 0; i < 4; i++) {
        const segment = new THREE.Group()
        segment.position.y = 0.09
        segment.rotation.x = i % 2 === 0 ? 0.35 : -0.2
        current.add(segment)
        cylinder(segment, 0.024 - i * 0.003, 0.028 - i * 0.003, 0.1, main, [0, 0.05, 0])
        current = segment
      }
    } else {
      cylinder(body, 0.032, 0.045, 0.26, main, [0, 0.04, -0.32], [-0.7, 0, 0])
    }
    head.castShadow = true
    return root
  }

  if (object.variant === 'bird') {
    const body = new THREE.Group()
    body.position.y = object.pose === 'fly' ? 0.42 : 0.2
    root.add(body)
    const bodyMesh = addMesh(
      body,
      new THREE.SphereGeometry(0.12, 18, 14),
      main,
      [0, 0, 0],
    )
    bodyMesh.scale.set(0.85, 0.9, 1.3)
    sphere(body, 0.075, main, [0, 0.12, 0.13])
    addMesh(
      body,
      new THREE.ConeGeometry(0.035, 0.11, 12),
      white,
      [0, 0.11, 0.24],
      [Math.PI / 2, 0, 0],
    )
    const wingGeo = new THREE.SphereGeometry(0.1, 14, 10)
    const leftWing = addMesh(body, wingGeo, main, [-0.1, 0.02, -0.02])
    const rightWing = addMesh(body, wingGeo, main, [0.1, 0.02, -0.02])
    leftWing.scale.set(0.35, 0.08, 0.8)
    rightWing.scale.set(0.35, 0.08, 0.8)
    const wingAngle = object.pose === 'fly' ? 1.1 : 0.08
    leftWing.rotation.z = wingAngle
    rightWing.rotation.z = -wingAngle
    const legH = object.pose === 'fly' ? 0.06 : 0.15
    const legY = object.pose === 'fly' ? 0.02 : -0.16
    cylinder(body, 0.012, 0.012, legH, dark, [-0.04, legY, 0.02])
    cylinder(body, 0.012, 0.012, legH, dark, [0.04, legY, 0.02])
    if (object.pose === 'fly') body.rotation.x = 0.15
    return root
  }

  if (object.variant === 'horse') {
    const body = new THREE.Group()
    body.position.y = 1.02
    root.add(body)
    const torso = addMesh(
      body,
      new THREE.CapsuleGeometry(0.24, 0.75, 5, 16),
      main,
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    )
    torso.scale.set(1, 1, 1)
    cylinder(body, 0.13, 0.19, 0.55, main, [0, 0.26, 0.5], [0.65, 0, 0])
    sphere(body, 0.14, main, [0, 0.55, 0.78], [1.2, 1, 1.25])
    box(body, 0.12, 0.13, 0.28, main, [0, 0.51, 0.95])
    const earGeo = new THREE.ConeGeometry(0.035, 0.1, 4)
    addMesh(body, earGeo, main, [-0.07, 0.67, 0.76])
    addMesh(body, earGeo, main, [0.07, 0.67, 0.76])
    cylinder(body, 0.02, 0.03, 0.16, dark, [0, 0.56, -0.48], [0.7, 0, 0])
    box(body, 0.28, 0.36, 0.06, dark, [0, 0.42, 0.5])
    const legPositions = [
      [-0.15, 0.22],
      [0.15, 0.22],
      [-0.15, -0.28],
      [0.15, -0.28],
    ]
    for (const [x, z] of legPositions) {
      cylinder(body, 0.05, 0.06, 0.85, main, [x, -0.46, z])
      box(body, 0.1, 0.06, 0.16, dark, [x, -0.9, z])
    }
    if (object.pose === 'walk') {
      body.position.y = 1.04
      body.rotation.x = 0.04
    }
    return root
  }

  if (object.variant === 'tree') {
    cylinder(root, 0.11, 0.16, 1.2, dark, [0, 0.6, 0])
    sphere(root, 0.55, main, [0, 1.5, 0], [1.1, 0.9, 1.1])
    sphere(root, 0.42, main, [0.38, 1.35, 0.16], [1, 0.9, 1])
    sphere(root, 0.4, main, [-0.36, 1.32, -0.12], [1, 0.85, 1])
    sphere(root, 0.32, main, [0.02, 1.95, -0.18], [1, 1, 1])
    return root
  }

  if (object.variant === 'bush') {
    sphere(root, 0.42, main, [0, 0.35, 0], [1.2, 0.85, 1])
    sphere(root, 0.3, main, [0.32, 0.28, 0.08], [1, 0.9, 1])
    sphere(root, 0.28, main, [-0.28, 0.26, -0.08], [1, 0.9, 1])
    return root
  }

  if (object.variant === 'flower') {
    cylinder(root, 0.018, 0.024, 0.48, green, [0, 0.24, 0], [0, 0, 0], 8)
    sphere(root, 0.11, green, [0.08, 0.3, 0], [1.8, 0.25, 0.8])
    const petalGeo = new THREE.SphereGeometry(0.1, 14, 10)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const petal = addMesh(root, petalGeo, main, [Math.cos(a) * 0.1, 0.56, Math.sin(a) * 0.1])
      petal.scale.set(1, 0.28, 0.55)
      petal.rotation.y = -a
    }
    sphere(root, 0.055, white, [0, 0.57, 0])
    return root
  }

  if (object.variant === 'butterfly') {
    const body = new THREE.Group()
    body.position.y = 0.24
    root.add(body)
    addMesh(body, new THREE.CapsuleGeometry(0.018, 0.16, 4, 8), dark, [0, 0, 0], [Math.PI / 2, 0, 0])
    sphere(body, 0.03, dark, [0, 0.02, 0.1])
    const wingGeo = new THREE.SphereGeometry(0.12, 16, 10)
    const makeWing = (side: -1 | 1, front: boolean) => {
      const wing = addMesh(body, wingGeo, main, [
        side * 0.12,
        0,
        front ? 0.06 : -0.06,
      ])
      wing.scale.set(1.25, 0.06, 0.85)
      wing.rotation.z = side * (object.pose === 'closed' ? 0.2 : 1.05)
      return wing
    }
    makeWing(-1, true)
    makeWing(1, true)
    makeWing(-1, false)
    makeWing(1, false)
    cylinder(body, 0.004, 0.004, 0.12, dark, [-0.03, 0.08, 0.12], [0.4, 0, 0], 6)
    cylinder(body, 0.004, 0.004, 0.12, dark, [0.03, 0.08, 0.12], [0.4, 0, 0], 6)
    return root
  }

  if (object.variant === 'house') {
    box(root, 1.9, 1.5, 1.6, main, [0, 0.75, 0])
    const roof = addMesh(
      root,
      new THREE.ConeGeometry(1.48, 0.85, 4),
      dark,
      [0, 1.9, 0],
      [0, Math.PI / 4, 0],
    )
    roof.scale.z = 0.95
    box(root, 0.48, 0.95, 0.06, dark, [0, 0.48, 0.82])
    box(root, 0.5, 0.42, 0.05, glass, [-0.58, 1.05, 0.82])
    box(root, 0.5, 0.42, 0.05, glass, [0.58, 1.05, 0.82])
    box(root, 0.06, 0.42, 0.5, glass, [-0.96, 1.05, 0])
    box(root, 0.06, 0.42, 0.5, glass, [0.96, 1.05, 0])
    return root
  }

  if (object.variant === 'tower') {
    cylinder(root, 0.85, 0.95, 1.3, main, [0, 0.65, 0], [0, 0, 0], 8)
    cylinder(root, 0.66, 0.75, 1.1, main, [0, 1.75, 0], [0, 0, 0], 8)
    cylinder(root, 0.5, 0.58, 0.9, main, [0, 2.7, 0], [0, 0, 0], 8)
    const roof = addMesh(
      root,
      new THREE.ConeGeometry(0.65, 0.8, 8),
      dark,
      [0, 3.55, 0],
      [0, Math.PI / 8, 0],
    )
    roof.castShadow = true
    box(root, 0.22, 0.5, 0.05, glass, [0, 0.7, 0.88])
    box(root, 0.2, 0.4, 0.05, glass, [0, 1.8, 0.69])
    box(root, 0.18, 0.32, 0.05, glass, [0, 2.75, 0.53])
    return root
  }

  if (object.variant === 'car') {
    box(root, 1.85, 0.45, 0.82, main, [0, 0.48, 0])
    box(root, 1.12, 0.42, 0.7, main, [0, 0.85, -0.02])
    box(root, 0.82, 0.28, 0.5, glass, [0, 0.91, 0.15])
    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 18)
    for (const [x, z] of [
      [-0.62, 0.4],
      [0.62, 0.4],
      [-0.62, -0.4],
      [0.62, -0.4],
    ]) {
      addMesh(root, wheelGeo, dark, [x, 0.23, z], [0, 0, Math.PI / 2])
    }
    box(root, 0.06, 0.12, 0.18, white, [-0.92, 0.58, 0.3])
    box(root, 0.06, 0.12, 0.18, white, [-0.92, 0.58, -0.3])
    return root
  }

  if (object.variant === 'bus') {
    box(root, 3.6, 1.05, 0.95, main, [0, 0.9, 0])
    box(root, 3.2, 0.38, 0.82, glass, [0, 1.05, 0.05])
    box(root, 3.5, 0.2, 0.85, main, [0, 0.38, 0])
    const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 18)
    for (const [x, z] of [
      [-1.15, 0.46],
      [1.15, 0.46],
      [-1.15, -0.46],
      [1.15, -0.46],
    ]) {
      addMesh(root, wheelGeo, dark, [x, 0.27, z], [0, 0, Math.PI / 2])
    }
    box(root, 0.12, 0.2, 0.96, white, [-1.82, 0.55, 0])
    box(root, 0.12, 0.2, 0.96, white, [1.82, 0.55, 0])
    return root
  }

  if (object.variant === 'bike') {
    const wheelGeo = new THREE.TorusGeometry(0.3, 0.035, 10, 28)
    const w1 = addMesh(root, wheelGeo, dark, [-0.55, 0.33, 0], [0, Math.PI / 2, 0])
    const w2 = addMesh(root, wheelGeo, dark, [0.55, 0.33, 0], [0, Math.PI / 2, 0])
    w1.castShadow = true
    w2.castShadow = true
    const frameMat = main
    cylinder(root, 0.025, 0.025, 0.72, frameMat, [0, 0.55, 0], [0, 0, 0.9])
    cylinder(root, 0.025, 0.025, 0.65, frameMat, [0.3, 0.55, 0], [0, 0, -0.55])
    cylinder(root, 0.025, 0.025, 0.58, frameMat, [-0.28, 0.55, 0], [0, 0, 0.5])
    cylinder(root, 0.022, 0.022, 0.55, frameMat, [0.55, 0.33, 0], [0, 0, 0.05])
    box(root, 0.24, 0.05, 0.14, dark, [-0.18, 0.78, 0])
    cylinder(root, 0.018, 0.018, 0.5, dark, [-0.55, 0.33, 0], [Math.PI / 2, 0, 0])
    box(root, 0.36, 0.035, 0.04, dark, [0.55, 0.83, 0])
    return root
  }

  // 兜底
  box(root, 0.6, 0.6, 0.6, main, [0, 0.3, 0])
  return root
}

export function buildObjectModel(object: SceneObject): THREE.Group {
  return object.kind === 'mannequin' ? buildMannequin(object) : buildProp(object)
}
