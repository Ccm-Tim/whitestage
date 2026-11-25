import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { SceneObject, Vec3, WeaponConfig, WeaponType } from '../core/types'
import {
  JOINT_IDS,
  JOINT_LABELS,
  QUICK_POSES,
  type JointId,
  mirrorJoints,
  normalizeJoints,
} from '../core/pose'
import { createCharacterFromObject } from '../core/characters'
import { WEAPON_OPTIONS, createWeapon } from '../core/weapons'
import { buildObjectModel, disposeObject3D } from '../engine/models'
import { useStore } from '../store/useStore'
import { Field, SliderField, Toggle } from './fields'

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

interface Props {
  object: SceneObject
  onClose: () => void
}

export function CharacterEditor({ object, onClose }: Props) {
  const saveCustomCharacter = useStore((s) => s.saveCustomCharacter)
  const applyCustomToObject = useStore((s) => s.applyCustomToObject)
  const toast = useStore((s) => s.toast)
  const [name, setName] = useState(object.name)
  const [joints, setJoints] = useState<Record<string, Vec3>>(() => normalizeJoints(object.joints))
  const [activeJoint, setActiveJoint] = useState<JointId>('rightShoulder')
  const [height, setHeight] = useState(object.height)
  const [color, setColor] = useState(object.color)
  const [skinColor, setSkinColor] = useState(object.skinColor)
  const [shoeColor, setShoeColor] = useState(object.shoeColor)
  const [faceDetail, setFaceDetail] = useState(object.faceDetail)
  const [bodyOffset, setBodyOffset] = useState<Vec3>({ ...object.bodyOffset })
  const [bodyRotation, setBodyRotation] = useState<Vec3>({ ...object.bodyRotation })
  const [weapon, setWeapon] = useState<WeaponConfig | null>(() =>
    object.weapon ? JSON.parse(JSON.stringify(object.weapon)) : null,
  )
  const [showJoints, setShowJoints] = useState(true)
  const [showAxes, setShowAxes] = useState(true)
  const [saving, setSaving] = useState(false)

  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const transformRef = useRef<TransformControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const jointGroupsRef = useRef(new Map<string, THREE.Object3D>())
  const selectionMarkerRef = useRef<THREE.Mesh | null>(null)
  const activeJointRef = useRef<JointId>('rightShoulder')
  const showJointsRef = useRef(true)
  const showAxesRef = useRef(true)
  const handlesRef = useRef<THREE.Mesh[]>([])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0d1015')
    const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 50)
    camera.position.set(1.7, 1.35, 2.6)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.95, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.8
    controls.maxDistance = 6
    controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    } as unknown as OrbitControls['mouseButtons']
    controls.update()

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setMode('rotate')
    transform.setSpace('local')
    transform.setSize(0.82)
    const transformHelper = transform.getHelper()
    scene.add(transformHelper)
    transform.addEventListener('dragging-changed', (event) => {
      controls.enabled = !(event as unknown as { value: boolean }).value
    })
    transform.addEventListener('objectChange', () => {
      const id = activeJointRef.current
      const group = jointGroupsRef.current.get(id)
      if (!group) return
      const euler = new THREE.Euler().setFromQuaternion(group.quaternion, 'XYZ')
      setJoints((current) => ({
        ...current,
        [id]: {
          x: THREE.MathUtils.radToDeg(euler.x),
          y: THREE.MathUtils.radToDeg(euler.y),
          z: THREE.MathUtils.radToDeg(euler.z),
        },
      }))
    })

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x6aa6ff,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      }),
    )
    marker.renderOrder = 30
    marker.visible = false
    scene.add(marker)
    selectionMarkerRef.current = marker

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down = { x: 0, y: 0 }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      down = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
      if (transform.dragging || transform.axis) return
      const model = modelRef.current
      if (!model) return
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObject(model, true)
      if (hits.length === 0) return
      let current: THREE.Object3D | null = hits[0].object
      while (current) {
        if (typeof current.userData.joint === 'string') {
          setActiveJoint(current.userData.joint as JointId)
          return
        }
        current = current.parent
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const hemi = new THREE.HemisphereLight(0xffffff, 0xc8ccd2, 1.15)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(3, 5, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-4, 3, -3)
    scene.add(fill)

    const grid = new THREE.GridHelper(6, 12, 0x3a4350, 0x252c35)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.55
    scene.add(grid)
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 48),
      new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.95 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.002
    floor.receiveShadow = true
    scene.add(floor)

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const heightValue = Math.max(1, mount.clientHeight)
      renderer.setSize(width, heightValue, false)
      camera.aspect = width / heightValue
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    renderer.setAnimationLoop(() => {
      controls.update()
      const active = jointGroupsRef.current.get(activeJointRef.current)
      if (active) {
        active.getWorldPosition(marker.position)
        marker.visible = showJointsRef.current
      } else {
        marker.visible = false
      }
      renderer.render(scene, camera)
    })

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    transformRef.current = transform
    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      transform.detach()
      transform.dispose()
      controls.dispose()
      if (modelRef.current) {
        scene.remove(modelRef.current)
        disposeObject3D(modelRef.current)
        modelRef.current = null
      }
      scene.remove(marker)
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
      selectionMarkerRef.current = null
      renderer.dispose()
      renderer.domElement.remove()
      scene.clear()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      transformRef.current = null
    }
  }, [])

  useEffect(() => {
    activeJointRef.current = activeJoint
  }, [activeJoint])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (modelRef.current) {
      scene.remove(modelRef.current)
      disposeObject3D(modelRef.current)
    }
    const preview: SceneObject = {
      ...object,
      pose: 'stand',
      joints: {},
      bodyOffset,
      bodyRotation,
      weapon,
      height,
      color,
      skinColor,
      shoeColor,
      faceDetail,
    }
    const model = buildObjectModel(preview)
    scene.add(model)
    modelRef.current = model

    const groups = new Map<string, THREE.Object3D>()
    model.traverse((child) => {
      if (typeof child.userData.joint === 'string') {
        groups.set(child.userData.joint, child)
      }
    })
    jointGroupsRef.current = groups

    const handleMaterial = new THREE.MeshBasicMaterial({
      color: 0x6aa6ff,
      depthTest: false,
      transparent: true,
      opacity: 0.72,
      toneMapped: false,
    })
    handlesRef.current = []
    for (const [id, group] of groups) {
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), handleMaterial)
      handle.userData.joint = id
      handle.renderOrder = 20
      handle.visible = showJointsRef.current
      handlesRef.current.push(handle)
      group.add(handle)
    }

    for (const [id, group] of groups) {
      const value = joints[id] ?? ZERO
      group.rotation.set(
        THREE.MathUtils.degToRad(value.x),
        THREE.MathUtils.degToRad(value.y),
        THREE.MathUtils.degToRad(value.z),
      )
    }

    const transform = transformRef.current
    const active = groups.get(activeJointRef.current)
    if (transform) {
      if (active) transform.attach(active)
      else transform.detach()
      transform.enabled = showAxesRef.current
      transform.getHelper().visible = showAxesRef.current
    }
  }, [object, height, color, skinColor, shoeColor, faceDetail, bodyOffset, bodyRotation, weapon])

  useEffect(() => {
    showJointsRef.current = showJoints
    for (const handle of handlesRef.current) handle.visible = showJoints
  }, [showJoints])

  useEffect(() => {
    showAxesRef.current = showAxes
    const transform = transformRef.current
    if (transform) {
      transform.enabled = showAxes
      transform.getHelper().visible = showAxes
    }
  }, [showAxes])

  useEffect(() => {
    const groups = jointGroupsRef.current
    for (const [id, group] of groups) {
      const value = joints[id] ?? ZERO
      group.rotation.set(
        THREE.MathUtils.degToRad(value.x),
        THREE.MathUtils.degToRad(value.y),
        THREE.MathUtils.degToRad(value.z),
      )
    }
    const transform = transformRef.current
    const active = groups.get(activeJoint)
    if (transform) {
      if (active) transform.attach(active)
      else transform.detach()
    }
  }, [joints, activeJoint])

  const activeRotation = joints[activeJoint] ?? ZERO
  const setAxis = (axis: 'x' | 'y' | 'z', value: number) => {
    setJoints((current) => ({
      ...current,
      [activeJoint]: { ...(current[activeJoint] ?? ZERO), [axis]: value },
    }))
  }
  const resetJoint = () => {
    setJoints((current) => {
      const next = { ...current }
      delete next[activeJoint]
      return next
    })
  }

  const applyQuickPose = (pose: (typeof QUICK_POSES)[number]) => {
    setJoints(normalizeJoints(pose.joints))
    setBodyOffset({ ...pose.bodyOffset })
    setBodyRotation({ ...pose.bodyRotation })
  }

  const save = async () => {
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) {
      toast('请给角色起一个名字', 'error')
      return
    }
    setSaving(true)
    try {
      const character = createCharacterFromObject(
        {
          ...object,
          joints,
          bodyOffset,
          bodyRotation,
          weapon,
          height,
          color,
          skinColor,
          shoeColor,
          faceDetail,
        },
        trimmed,
      )
      const saved = await saveCustomCharacter(character)
      applyCustomToObject(object.id, saved.id)
      onClose()
    } catch (err) {
      toast('保存角色失败：' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="char-editor-overlay">
      <div className="char-editor">
        <header className="char-editor-header">
          <div>
            <b>编辑角色</b>
            <span>逐关节调姿 · 保存到「我的角色」</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            ×
          </button>
        </header>

        <div className="char-editor-body">
          <div className="char-stage" ref={mountRef} />

          <div className="char-controls">
            <div className="char-controls-scroll">
              <Field label="角色名">
                <input
                  className="text-input"
                  value={name}
                  maxLength={24}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <SliderField
                label="身高"
                min={0.6}
                max={2.4}
                step={0.01}
                value={height}
                unit="m"
                onChange={setHeight}
              />

              <div className="char-colors">
                <label>
                  训练服
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  />
                </label>
                <label>
                  头/手
                  <input
                    type="color"
                    value={skinColor}
                    onChange={(event) => setSkinColor(event.target.value)}
                  />
                </label>
                <label>
                  鞋
                  <input
                    type="color"
                    value={shoeColor}
                    onChange={(event) => setShoeColor(event.target.value)}
                  />
                </label>
              </div>

              <Toggle
                label="面部五官"
                checked={faceDetail}
                onChange={() => setFaceDetail((value) => !value)}
              />
              <Toggle
                label="显示关节节点"
                hint="蓝色圆点"
                checked={showJoints}
                onChange={() => setShowJoints((value) => !value)}
              />
              <Toggle
                label="显示旋转轴"
                hint="关闭后仍可用滑杆调关节"
                checked={showAxes}
                onChange={() => setShowAxes((value) => !value)}
              />

              <div className="char-section-title">快速姿势</div>
              <div className="char-quick">
                {QUICK_POSES.map((pose) => (
                  <button
                    key={pose.id}
                    className="chip"
                    onClick={() => applyQuickPose(pose)}
                  >
                    {pose.label}
                  </button>
                ))}
              </div>

              <div className="char-section-title">整体 / 落地</div>
              <SliderField
                label="高度 Y"
                min={-0.85}
                max={0.4}
                step={0.01}
                value={bodyOffset.y}
                unit="m"
                onChange={(value) => setBodyOffset({ ...bodyOffset, y: value })}
              />
              <SliderField
                label="前后 Z"
                min={-0.5}
                max={0.5}
                step={0.01}
                value={bodyOffset.z}
                unit="m"
                onChange={(value) => setBodyOffset({ ...bodyOffset, z: value })}
              />
              <SliderField
                label="俯仰 X"
                min={-90}
                max={90}
                step={1}
                value={bodyRotation.x}
                unit="°"
                onChange={(value) => setBodyRotation({ ...bodyRotation, x: value })}
              />
              <SliderField
                label="朝向 Y"
                min={-180}
                max={180}
                step={1}
                value={bodyRotation.y}
                unit="°"
                onChange={(value) => setBodyRotation({ ...bodyRotation, y: value })}
              />
              <SliderField
                label="侧翻 Z"
                min={-45}
                max={45}
                step={1}
                value={bodyRotation.z}
                unit="°"
                onChange={(value) => setBodyRotation({ ...bodyRotation, z: value })}
              />

              <div className="char-section-title">武器</div>
              <Field label="类型">
                <select
                  className="text-input select"
                  value={weapon?.type ?? ''}
                  onChange={(event) => {
                    const type = event.target.value as WeaponType | ''
                    if (!type) {
                      setWeapon(null)
                    } else {
                      setWeapon((current) =>
                        current
                          ? { ...current, type }
                          : createWeapon(type, 'right'),
                      )
                    }
                  }}
                >
                  <option value="">无</option>
                  {WEAPON_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              {weapon ? (
                <>
                  <Field label="手持">
                    <select
                      className="text-input select"
                      value={weapon.hand}
                      onChange={(event) =>
                        setWeapon({
                          ...weapon,
                          hand: event.target.value === 'left' ? 'left' : 'right',
                        })
                      }
                    >
                      <option value="right">右手</option>
                      <option value="left">左手</option>
                    </select>
                  </Field>
                  <SliderField
                    label="武器缩放"
                    min={0.1}
                    max={5}
                    step={0.01}
                    value={weapon.scale}
                    unit="×"
                    onChange={(value) => setWeapon({ ...weapon, scale: value })}
                  />
                  <SliderField
                    label="握持 X"
                    min={-180}
                    max={180}
                    step={1}
                    value={weapon.rotation.x}
                    unit="°"
                    onChange={(value) =>
                      setWeapon({
                        ...weapon,
                        rotation: { ...weapon.rotation, x: value },
                      })
                    }
                  />
                  <SliderField
                    label="握持 Y"
                    min={-180}
                    max={180}
                    step={1}
                    value={weapon.rotation.y}
                    unit="°"
                    onChange={(value) =>
                      setWeapon({
                        ...weapon,
                        rotation: { ...weapon.rotation, y: value },
                      })
                    }
                  />
                  <SliderField
                    label="握持 Z"
                    min={-180}
                    max={180}
                    step={1}
                    value={weapon.rotation.z}
                    unit="°"
                    onChange={(value) =>
                      setWeapon({
                        ...weapon,
                        rotation: { ...weapon.rotation, z: value },
                      })
                    }
                  />
                  <p className="note">
                    武器挂在手部，随关节姿势转动；用握持 X/Y/Z 调整剑刃 / 枪口方向。保存自定义角色时会一并保存。
                  </p>
                </>
              ) : null}

              <div className="char-section-title">关节</div>
              <div className="char-joints">
                {JOINT_IDS.map((id) => (
                  <button
                    key={id}
                    className={`chip ${activeJoint === id ? 'active' : ''}`}
                    onClick={() => setActiveJoint(id)}
                  >
                    {JOINT_LABELS[id]}
                  </button>
                ))}
              </div>

              <div className="char-joint-values">
                <b>{JOINT_LABELS[activeJoint]}</b>
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <SliderField
                    key={axis}
                    label={axis.toUpperCase()}
                    min={-180}
                    max={180}
                    step={1}
                    value={activeRotation[axis]}
                    unit="°"
                    onChange={(value) => setAxis(axis, value)}
                  />
                ))}
              </div>

              <div className="btn-row">
                <button className="btn btn-ghost sm" onClick={() => setJoints(mirrorJoints(joints))}>
                  左右镜像
                </button>
                <button className="btn btn-ghost sm" onClick={resetJoint}>
                  重置当前关节
                </button>
                <button className="btn btn-ghost sm" onClick={() => setJoints({})}>
                  重置全部
                </button>
              </div>

              <p className="note">
                也可以直接在左侧点击身体部位选中关节，拖动旋转手柄；右侧滑杆用于精确微调。
                关节角度是绝对旋转；保存后会出现在「对象 → 我的角色」里，可以继续添加到场景。
                系统自带角色不可删除，自定义角色可以删除、导出和导入。
              </p>
            </div>
          </div>
        </div>

        <footer className="char-editor-footer">
          <span>点击身体部位选关节 · 拖动旋转手柄 · 右键旋转视角 · 滚轮缩放</span>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存到我的角色'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
