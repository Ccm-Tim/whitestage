import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { strToU8, zipSync } from 'fflate'
import type {
  BackgroundConfig,
  BoardBackground,
  CameraConfig,
  CameraTargetLock,
  EnvironmentConfig,
  ImageBackground,
  PanoBackground,
  Project,
  SceneObject,
  ToolId,
  Vec3,
} from '../core/types'
import { ASPECTS, CAMERA_FAR, CAMERA_NEAR, SENSORS } from '../core/constants'
import { aimAt, applyRotation, clamp, deg, fovFromFocal, rad, round } from '../core/math'
import { resolveTargetPosition } from '../core/defaults'
import {
  DEFAULT_FREE_GRID,
  normalizePreviewLayout,
  previewCells,
  type FreePreviewGrid,
  type PreviewLayout,
} from '../core/preview'
import { getAsset } from '../storage/db'
import { buildObjectModel, disposeObject3D, objectVisualSignature } from './models'

const HELPER_LAYER = 1

/** WebGLRenderTarget 的输出是线性色；写回 2D canvas / PNG / 视频前必须转成 sRGB。 */
const LINEAR_TO_SRGB = Uint8Array.from({ length: 256 }, (_, value) => {
  const c = value / 255
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
})

function linearBufferToSrgb(buffer: Uint8Array): void {
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = LINEAR_TO_SRGB[buffer[i]]
    buffer[i + 1] = LINEAR_TO_SRGB[buffer[i + 1]]
    buffer[i + 2] = LINEAR_TO_SRGB[buffer[i + 2]]
  }
}

/** .splat（Antimatter15 格式）每 32 字节：位置 3f、缩放 3f、颜色 4u8、旋转 4u8。 */
function downsampleSplatBytes(buffer: ArrayBuffer, budget: number): Uint8Array {
  const stride = 32
  const source = new Uint8Array(buffer)
  const count = Math.floor(source.byteLength / stride)
  if (count <= budget) return source
  const step = Math.max(1, Math.ceil(count / Math.max(1, budget)))
  const kept = Math.ceil(count / step)
  const result = new Uint8Array(kept * stride)
  for (let index = 0, sourceIndex = 0; sourceIndex < count; sourceIndex += step, index += 1) {
    result.set(source.subarray(sourceIndex * stride, sourceIndex * stride + stride), index * stride)
  }
  return result
}


const PART_ORDER = [
  'head',
  'neck',
  'torso',
  'pelvis',
  'leftUpperArm',
  'leftForearm',
  'leftHand',
  'rightUpperArm',
  'rightForearm',
  'rightHand',
  'weapon',
  'leftThigh',
  'leftShin',
  'leftFoot',
  'rightThigh',
  'rightShin',
  'rightFoot',
  'body',
]

const PART_LABELS: Record<string, string> = {
  head: '头部',
  neck: '脖子',
  torso: '躯干',
  pelvis: '骨盆',
  leftUpperArm: '左上臂',
  leftForearm: '左前臂',
  leftHand: '左手',
  rightUpperArm: '右上臂',
  rightForearm: '右前臂',
  rightHand: '右手',
  weapon: '武器',
  leftThigh: '左大腿',
  leftShin: '左小腿',
  leftFoot: '左脚',
  rightThigh: '右大腿',
  rightShin: '右小腿',
  rightFoot: '右脚',
  body: '身体',
}

function partColor(index: number): THREE.Color {
  const color = new THREE.Color()
  color.setHSL((index * 0.61803398875) % 1, 0.82, 0.55)
  return color
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface EngineCallbacks {
  onSelectCamera: (id: string | null) => void
  onSelectObject: (id: string | null) => void
  onCameraChange: (id: string, patch: { position?: Vec3; rotation?: Vec3 }) => void
  onObjectChange: (
    id: string,
    patch: { position?: Vec3; rotation?: Vec3; scale?: Vec3 },
  ) => void
  onPickTarget: (target: CameraTargetLock | null) => void
  onEnvironmentError?: (message: string) => void
}

interface Rig {
  id: string
  root: THREE.Object3D
  camera: THREE.PerspectiveCamera
  body: THREE.Group
  frustum: THREE.LineSegments
  ring: THREE.BoxHelper
  marker: THREE.Sprite
  lockTarget: THREE.Vector3 | null
  dof: boolean
  aperture: number
  focusDistance: number
}

interface ObjectRig {
  id: string
  kind: 'mannequin' | 'prop'
  name: string
  allowUnderground: boolean
  root: THREE.Group
  body: THREE.Group | null
  signature: string
  ring: THREE.BoxHelper | null
}

function findCameraId(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object
  while (current) {
    if (typeof current.userData.cameraId === 'string') return current.userData.cameraId as string
    current = current.parent
  }
  return null
}

function findObjectId(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object
  while (current) {
    if (typeof current.userData.objectId === 'string') return current.userData.objectId as string
    current = current.parent
  }
  return null
}

function buildFrustumGeometry(fovDeg: number, aspect: number): THREE.BufferGeometry {
  const near = 0.32
  const far = 3.4
  const half = Math.tan((Math.max(1, fovDeg) * Math.PI) / 360)
  const nearH = half * near
  const nearW = nearH * aspect
  const farH = half * far
  const farW = farH * aspect
  const n: [number, number, number][] = [
    [-nearW, -nearH, -near],
    [nearW, -nearH, -near],
    [nearW, nearH, -near],
    [-nearW, nearH, -near],
  ]
  const f: [number, number, number][] = [
    [-farW, -farH, -far],
    [farW, -farH, -far],
    [farW, farH, -far],
    [-farW, farH, -far],
  ]
  const points: number[] = []
  const edge = (a: [number, number, number], b: [number, number, number]) => {
    points.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
  for (let i = 0; i < 4; i++) {
    edge(n[i], n[(i + 1) % 4])
    edge(f[i], f[(i + 1) % 4])
    edge(n[i], f[i])
  }
  // 镜头朝向轴
  edge([0, 0, 0], [0, 0, -far])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geometry
}

function flipUvY(geometry: THREE.BufferGeometry) {
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
  uv.needsUpdate = true
}

/** 径向淡出的地面网格：只覆盖舞台附近，避免在全景照片上铺满整张网格 */
function createGridTexture(lineWidth = 3): THREE.CanvasTexture {
  const size = 2048
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const ctx = canvas.getContext('2d')
  if (!ctx) return texture
  ctx.clearRect(0, 0, size, size)
  const divisions = 32
  const cell = size / divisions
  ctx.lineWidth = Math.max(0.5, lineWidth)
  for (let i = 0; i <= divisions; i++) {
    const p = i * cell
    const major = i % 5 === 0
    ctx.strokeStyle = major ? 'rgba(66, 86, 114, 0.78)' : 'rgba(82, 102, 130, 0.42)'
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, p)
    ctx.lineTo(size, p)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'destination-in'
  const fade = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.5,
  )
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(0.55, 'rgba(0,0,0,0.88)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, size, size)
  texture.needsUpdate = true
  return texture
}

function createLockTexture(): THREE.CanvasTexture {  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const ctx = canvas.getContext('2d')
  if (!ctx) return texture
  ctx.clearRect(0, 0, 128, 128)
  ctx.strokeStyle = '#7fb6ff'
  ctx.fillStyle = '#7fb6ff'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(64, 64, 37, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(64, 64, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(64, 5)
  ctx.lineTo(64, 21)
  ctx.moveTo(64, 107)
  ctx.lineTo(64, 123)
  ctx.moveTo(5, 64)
  ctx.lineTo(21, 64)
  ctx.moveTo(107, 64)
  ctx.lineTo(123, 64)
  ctx.stroke()
  texture.needsUpdate = true
  return texture
}

function buildCameraBody(id: string): THREE.Group {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.5, metalness: 0.18 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: 0.65, metalness: 0.25 })
  const accentMat = new THREE.MeshBasicMaterial({ color: 0x5b9dff })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.24), bodyMat)
  body.position.z = 0.05

  const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.118, 0.2, 28), darkMat)
  lensBarrel.rotation.x = Math.PI / 2
  lensBarrel.position.z = -0.17

  const lensRim = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.014, 10, 28), bodyMat)
  lensRim.position.z = -0.275

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.012, 28), accentMat)
  glass.rotation.x = Math.PI / 2
  glass.position.z = -0.278

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.13), darkMat)
  top.position.set(-0.1, 0.16, 0.04)

  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.09), accentMat)
  shoe.position.set(0.11, 0.15, 0.02)

  group.add(body, lensBarrel, lensRim, glass, top, shoe)
  group.traverse((o) => {
    o.layers.set(HELPER_LAYER)
    o.userData.cameraId = id
  })
  group.userData.cameraId = id
  return group
}

export class Engine {
  private container: HTMLElement
  private callbacks: EngineCallbacks
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private editorCamera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private transform: TransformControls
  private transformHelper: THREE.Object3D
  private grid: THREE.Mesh
  private gridTexture: THREE.CanvasTexture
  private gridWidth = 3
  private whiteFloorMesh: THREE.Mesh
  private originHelper: THREE.Group
  private ground: THREE.Mesh
  private groundMat: THREE.MeshBasicMaterial
  private shadowCatcher: THREE.Mesh
  private bgScene: THREE.Scene
  private bgCamera: THREE.OrthographicCamera
  private bgPlane: THREE.Mesh
  private bgTextureCache = new Map<string, THREE.Texture>()
  private bg2d: ImageBackground | null = null
  private bg2dActive = false
  private bgFallback = new THREE.Color('#0e1013')
  private bgMode: 'solid' | 'image-screen' | 'image-plane' | 'pano' | 'board' = 'solid'
  private boardMeshes = new Map<string, THREE.Mesh>()
  private boardAlphaCache = new Map<number, THREE.CanvasTexture>()
  private dofScene: THREE.Scene | null = null
  private dofCamera: THREE.OrthographicCamera | null = null
  private dofMaterial: THREE.ShaderMaterial | null = null
  private dofTarget: THREE.WebGLRenderTarget | null = null
  private dofDepthTarget: THREE.WebGLRenderTarget | null = null
  private dofDepthMaterial: THREE.MeshDepthMaterial | null = null
  private dofTargetW = 0
  private dofTargetH = 0
  private dofDebug = false
  private bgSignature = ''
  private bgLoadToken = 0
  private planeMesh: THREE.Mesh | null = null
  private backgroundInEditor = true
  private stageFog = true
  private stageShadows = true
  private environmentGroup = new THREE.Group()
  private environmentKey = ''
  private environmentLoadToken = 0
  private environmentContactShadows = true
  private groundProxy: THREE.Mesh
  private spark: SparkRenderer
  private environmentSplat: SplatMesh | null = null
  private outputWidth = 1920
  private outputHeight = 1080
  private hemi: THREE.HemisphereLight
  private keyLight: THREE.DirectionalLight
  private fillLight: THREE.DirectionalLight
  private fog: THREE.Fog
  private rigs = new Map<string, Rig>()
  private objectRigs = new Map<string, ObjectRig>()
  private selectedId: string | null = null
  private selectedObjectId: string | null = null
  private draggingId: string | null = null
  private draggingObjectId: string | null = null
  private lastGizmoDrop = 0
  private tool: ToolId = 'translate'
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private downPos = { x: 0, y: 0 }
  private resizeObserver: ResizeObserver

  private preview: {
    canvas: HTMLCanvasElement
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
  } | null = null
  private previewCameraId: string | null = null
  private previewCameraIds: string[] = []
  private previewLayout: PreviewLayout = 'single'
  private previewFree: FreePreviewGrid = DEFAULT_FREE_GRID
  private pickMode = false
  private lockTexture: THREE.CanvasTexture
  private lockMaterial: THREE.SpriteMaterial

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container
    this.callbacks = callbacks

    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.setClearColor(0x0e1013, 1)
    const canvas = this.renderer.domElement
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none'
    container.appendChild(canvas)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#eef0f2')
    this.fog = new THREE.Fog('#eef0f2', 45, 170)
    this.scene.fog = this.fog

    this.spark = new SparkRenderer({
      renderer: this.renderer,
      enableLod: true,
      lodSplatCount: 1_000_000,
      depthTest: true,
      transparent: true,
    })
    this.spark.name = 'WhiteStageSpark'
    this.scene.add(this.spark)

    this.bgScene = new THREE.Scene()
    this.bgCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 10)
    this.bgCamera.position.z = 1
    this.bgPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    // ImageBitmap 纹理在部分浏览器里无法通过 flipY 控制，直接翻转 UV 保证图片正立
    flipUvY(this.bgPlane.geometry)
    this.bgScene.add(this.bgPlane)

    this.editorCamera = new THREE.PerspectiveCamera(48, width / height, 0.05, 900)
    this.editorCamera.position.set(-9.5, 6.4, 12.5)
    this.editorCamera.layers.enable(HELPER_LAYER)

    this.controls = new OrbitControls(this.editorCamera, canvas)
    this.controls.target.set(0, 1.05, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.6
    this.controls.maxDistance = 90
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    } as unknown as OrbitControls['mouseButtons']
    this.controls.update()

    this.groundMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#eef0f2'),
    })
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(320, 96), this.groundMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = false
    this.scene.add(this.ground)

    this.environmentGroup.name = 'WhiteStageEnvironment'
    this.scene.add(this.environmentGroup)

    this.groundProxy = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96),
      new THREE.MeshStandardMaterial({
        color: '#30343a',
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.72,
        depthWrite: true,
      }),
    )
    this.groundProxy.rotation.x = -Math.PI / 2
    this.groundProxy.position.y = 0.006
    this.groundProxy.receiveShadow = true
    this.groundProxy.visible = false
    this.scene.add(this.groundProxy)

    this.shadowCatcher = new THREE.Mesh(
      new THREE.CircleGeometry(12, 72),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
    )
    this.shadowCatcher.rotation.x = -Math.PI / 2
    this.shadowCatcher.position.y = 0.002
    this.shadowCatcher.receiveShadow = true
    this.scene.add(this.shadowCatcher)

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xdfe3e8, 0.95)
    this.scene.add(this.hemi)

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.45)
    this.keyLight.position.set(6, 11, 7)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(2048, 2048)
    const shadowCam = this.keyLight.shadow.camera as THREE.OrthographicCamera
    shadowCam.left = -18
    shadowCam.right = 18
    shadowCam.top = 18
    shadowCam.bottom = -18
    shadowCam.near = 0.5
    shadowCam.far = 48
    this.keyLight.shadow.bias = -0.0004
    this.keyLight.shadow.normalBias = 0.02
    this.keyLight.shadow.radius = 3
    this.keyLight.target.position.set(0, 0.9, 0)
    this.scene.add(this.keyLight)
    this.scene.add(this.keyLight.target)

    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.45)
    this.fillLight.position.set(-7, 5, -6)
    this.scene.add(this.fillLight)

    this.gridTexture = createGridTexture(this.gridWidth)
    this.grid = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.MeshBasicMaterial({
        map: this.gridTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.grid.rotation.x = -Math.PI / 2
    this.grid.position.y = 0.004
    this.grid.layers.set(HELPER_LAYER)
    this.grid.visible = true
    this.scene.add(this.grid)

    this.whiteFloorMesh = new THREE.Mesh(
      new THREE.CircleGeometry(16, 64),
      new THREE.MeshStandardMaterial({ color: 0xf5f6f8, roughness: 0.96, metalness: 0 }),
    )
    this.whiteFloorMesh.rotation.x = -Math.PI / 2
    this.whiteFloorMesh.position.y = 0.003
    this.whiteFloorMesh.receiveShadow = true
    this.whiteFloorMesh.layers.set(HELPER_LAYER)
    this.whiteFloorMesh.visible = false
    this.scene.add(this.whiteFloorMesh)

    this.originHelper = new THREE.Group()
    const originRing = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.31, 40),
      new THREE.MeshBasicMaterial({
        color: 0x7d8b9e,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    originRing.rotation.x = -Math.PI / 2
    const originCross = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.72, 0, 0),
        new THREE.Vector3(0.72, 0, 0),
        new THREE.Vector3(0, 0, -0.72),
        new THREE.Vector3(0, 0, 0.72),
      ]),
      new THREE.LineBasicMaterial({
        color: 0x7d8b9e,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    )
    this.originHelper.add(originRing, originCross)
    this.originHelper.traverse((o) => o.layers.set(HELPER_LAYER))
    this.originHelper.position.y = 0.008
    this.scene.add(this.originHelper)

    this.transform = new TransformControls(this.editorCamera, canvas)
    this.transform.setSize(0.92)
    this.transform.setSpace('world')
    this.transformHelper = this.transform.getHelper()
    this.scene.add(this.transformHelper)

    this.transform.addEventListener('dragging-changed', (event) => {
      const active = (event as unknown as { value: boolean }).value
      this.controls.enabled = !active
      if (active) {
        this.draggingId = this.selectedId
        this.draggingObjectId = this.selectedObjectId
      } else {
        this.draggingId = null
        this.draggingObjectId = null
        this.lastGizmoDrop = performance.now()
      }
    })
    this.transform.addEventListener('objectChange', () => this.emitTransform())
    this.transform.addEventListener('mouseUp', () => {
      this.draggingId = null
      this.draggingObjectId = null
      this.emitTransform()
      this.lastGizmoDrop = performance.now()
    })

    this.raycaster.layers.enable(HELPER_LAYER)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)

    this.lockTexture = createLockTexture()
    this.lockMaterial = new THREE.SpriteMaterial({
      map: this.lockTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)
    this.handleResize()

    this.renderer.setAnimationLoop(() => this.renderFrame())
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    this.downPos = { x: event.clientX, y: event.clientY }
  }

  private onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (performance.now() - this.lastGizmoDrop < 220) return
    if (this.transform.dragging || this.transform.axis) return
    const dx = event.clientX - this.downPos.x
    const dy = event.clientY - this.downPos.y
    if (Math.hypot(dx, dy) > 5) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.editorCamera)
    const bodies = [
      ...Array.from(this.rigs.values()).map((rig) => rig.body),
      ...Array.from(this.objectRigs.values())
        .filter((rig) => rig.root.visible)
        .map((rig) => rig.body)
        .filter((body): body is THREE.Group => !!body),
    ]
    const hits = this.raycaster.intersectObjects(bodies, true)
    const firstCameraId = hits.length > 0 ? findCameraId(hits[0].object) : null
    const firstObjectId = hits.length > 0 ? findObjectId(hits[0].object) : null

    if (this.pickMode) {
      if (firstObjectId) {
        this.callbacks.onPickTarget({ kind: 'object', id: firstObjectId })
        return
      }
      if (firstCameraId) {
        this.callbacks.onPickTarget({ kind: 'camera', id: firstCameraId })
        return
      }
      const groundHits = this.raycaster.intersectObject(this.ground, false)
      if (groundHits.length > 0) {
        const point = groundHits[0].point
        this.callbacks.onPickTarget({
          kind: 'point',
          position: { x: round(point.x, 2), y: 0, z: round(point.z, 2) },
        })
      } else {
        this.callbacks.onPickTarget(null)
      }
      return
    }

    if (firstObjectId) {
      this.callbacks.onSelectObject(firstObjectId)
      this.callbacks.onSelectCamera(null)
    } else if (firstCameraId) {
      this.callbacks.onSelectCamera(firstCameraId)
      this.callbacks.onSelectObject(null)
    } else {
      this.callbacks.onSelectCamera(null)
      this.callbacks.onSelectObject(null)
    }
  }

  private handleResize() {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(width, height, false)
    this.editorCamera.aspect = width / height
    this.editorCamera.updateProjectionMatrix()
  }

  private renderFrame() {
    this.controls.update()
    if (this.selectedId) this.rigs.get(this.selectedId)?.ring.update()
    if (this.selectedObjectId) {
      const rig = this.objectRigs.get(this.selectedObjectId)
      if (rig?.ring && rig.body) rig.ring.setFromObject(rig.body)
    }
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight)
    if (this.backgroundInEditor) {
      this.renderWithBackground(this.renderer, this.editorCamera, aspect)
    } else {
      this.renderWhiteStage(this.renderer, this.editorCamera)
    }
    this.renderPreview()
  }

  private ensureDofResources(): {
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    material: THREE.ShaderMaterial
  } {
    if (this.dofScene && this.dofCamera && this.dofMaterial) {
      return { scene: this.dofScene, camera: this.dofCamera, material: this.dofMaterial }
    }
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        near: { value: CAMERA_NEAR },
        far: { value: CAMERA_FAR },
        focus: { value: 5.5 },
        aperture: { value: 2.8 },
        resolution: { value: new THREE.Vector2(1, 1) },
        debugDepth: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform float near;
        uniform float far;
        uniform float focus;
        uniform float aperture;
        uniform vec2 resolution;
        uniform float debugDepth;
        varying vec2 vUv;

        float linearDepth(float depth) {
          float z = depth * 2.0 - 1.0;
          return (2.0 * near * far) / (far + near - z * (far - near));
        }

        float unpackRGBAToDepth(vec4 rgba) {
          return dot(rgba, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
        }

        void main() {
          float rawDepth = unpackRGBAToDepth(texture2D(tDepth, vUv));
          if (debugDepth > 0.5) {
            gl_FragColor = vec4(vec3(clamp(linearDepth(rawDepth) / 30.0, 0.0, 1.0)), 1.0);
            return;
          }
          vec4 base = texture2D(tColor, vUv);
          float z = linearDepth(rawDepth);
          float coc = clamp(abs(z - focus) / max(0.25, focus), 0.0, 1.0);
          float radius = coc * 9.0 * (2.8 / max(0.7, aperture));
          if (radius < 0.35) {
            gl_FragColor = base;
            return;
          }
          vec2 px = vec2(radius) / max(resolution, vec2(1.0));
          vec4 sum = base * 1.5;
          float total = 1.5;
          for (int i = 0; i < 16; i++) {
            float angle = float(i) * 2.39996323;
            float r = sqrt(float(i) + 0.5) / 4.0;
            vec2 offset = vec2(cos(angle), sin(angle)) * r * px;
            sum += texture2D(tColor, vUv + offset);
            total += 1.0;
          }
          gl_FragColor = sum / total;
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
    this.dofScene = scene
    this.dofCamera = camera
    this.dofMaterial = material
    return { scene, camera, material }
  }

  private renderDofCell(
    renderer: THREE.WebGLRenderer,
    rig: Rig,
    vx: number,
    vy: number,
    vw: number,
    vh: number,
    cssWidth: number,
    cssHeight: number,
  ) {
    const dpr = renderer.getPixelRatio()
    const targetW = Math.max(2, Math.round(vw * dpr))
    const targetH = Math.max(2, Math.round(vh * dpr))
    if (!this.dofTarget || this.dofTargetW !== targetW || this.dofTargetH !== targetH) {
      this.dofTarget?.dispose()
      this.dofDepthTarget?.dispose()
      this.dofTarget = new THREE.WebGLRenderTarget(targetW, targetH)
      this.dofTarget.texture.colorSpace = THREE.SRGBColorSpace
      this.dofDepthTarget = new THREE.WebGLRenderTarget(targetW, targetH)
      this.dofTargetW = targetW
      this.dofTargetH = targetH
    }
    if (!this.dofDepthMaterial) {
      this.dofDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        side: THREE.DoubleSide,
      })
    }
    const depthTarget = this.dofDepthTarget
    if (!depthTarget) return

    const target = this.dofTarget
    const { scene, camera, material } = this.ensureDofResources()
    const cameraRig = rig.camera
    const targetCamera = this.preview?.camera
    if (!targetCamera) return
    const aspect = cssWidth / Math.max(1, cssHeight)
    targetCamera.position.copy(rig.root.position)
    targetCamera.quaternion.copy(rig.root.quaternion)
    targetCamera.fov = cameraRig.fov
    targetCamera.aspect = aspect
    targetCamera.updateProjectionMatrix()

    renderer.setRenderTarget(target)
    renderer.setScissorTest(false)
    renderer.clear(true, true, true)
    this.renderWithBackground(renderer, targetCamera, aspect)

    const previousBackground = this.scene.background
    const previousOverride = this.scene.overrideMaterial
    const previousFog = this.scene.fog
    const previousClearColor = renderer.getClearColor(new THREE.Color())
    const previousClearAlpha = renderer.getClearAlpha()
    this.scene.background = null
    this.scene.overrideMaterial = this.dofDepthMaterial
    this.scene.fog = null
    renderer.setRenderTarget(depthTarget)
    renderer.setClearColor(0xffffff, 1)
    renderer.clear(true, true, true)
    renderer.render(this.scene, targetCamera)
    renderer.setRenderTarget(null)
    renderer.setClearColor(previousClearColor, previousClearAlpha)
    this.scene.background = previousBackground
    this.scene.overrideMaterial = previousOverride
    this.scene.fog = previousFog

    renderer.setScissorTest(true)
    renderer.setViewport(vx, vy, vw, vh)
    renderer.setScissor(vx, vy, vw, vh)
    material.uniforms.tColor.value = target.texture
    material.uniforms.tDepth.value = depthTarget.texture
    material.uniforms.near.value = CAMERA_NEAR
    material.uniforms.far.value = CAMERA_FAR
    material.uniforms.focus.value = Math.max(0.2, rig.focusDistance)
    material.uniforms.aperture.value = Math.max(0.7, rig.aperture)
    material.uniforms.resolution.value.set(targetW, targetH)
    material.uniforms.debugDepth.value = this.dofDebug ? 1 : 0
    const previousAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.render(scene, camera)
    renderer.autoClear = previousAutoClear
  }


  private renderPreview() {
    const preview = this.preview
    if (!preview) return
    if (!preview.canvas.isConnected) return
    const width = preview.canvas.clientWidth
    const height = preview.canvas.clientHeight
    if (width < 2 || height < 2) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const targetW = Math.round(width * dpr)
    const targetH = Math.round(height * dpr)
    if (preview.canvas.width !== targetW || preview.canvas.height !== targetH) {
      preview.renderer.setSize(width, height, false)
    }

    const ids = this.previewCameraIds.length
      ? this.previewCameraIds
      : this.previewCameraId
        ? [this.previewCameraId]
        : []
    if (ids.length === 0) return

    const gizmoVisible = this.transformHelper.visible
    this.transformHelper.visible = false
    preview.renderer.setScissorTest(false)
    preview.renderer.clear(true, true, true)
    preview.renderer.setScissorTest(true)

    const cells = previewCells(this.previewLayout, this.previewFree)
    ids.slice(0, cells.length).forEach((id, index) => {
      const rig = this.rigs.get(id)
      if (!rig) return
      const cell = cells[index]
      const vx = cell.x * width
      const vy = (1 - cell.y - cell.h) * height
      const vw = cell.w * width
      const vh = cell.h * height
      if (rig.dof) {
        this.renderDofCell(preview.renderer, rig, vx, vy, vw, vh, vw, vh)
        return
      }
      preview.renderer.setViewport(vx, vy, vw, vh)
      preview.renderer.setScissor(vx, vy, vw, vh)
      preview.camera.position.copy(rig.root.position)
      preview.camera.quaternion.copy(rig.root.quaternion)
      preview.camera.fov = rig.camera.fov
      preview.camera.aspect = vw / Math.max(1, vh)
      preview.camera.updateProjectionMatrix()
      this.renderWithBackground(preview.renderer, preview.camera, vw / Math.max(1, vh))
    })

    preview.renderer.setScissorTest(false)
    preview.renderer.setViewport(0, 0, width, height)
    this.transformHelper.visible = gizmoVisible
  }

  private emitTransform() {
    if (this.selectedObjectId) {
      const rig = this.objectRigs.get(this.selectedObjectId)
      if (!rig) return
      if (!rig.allowUnderground) rig.root.position.y = Math.max(0, rig.root.position.y)
      const euler = new THREE.Euler().setFromQuaternion(rig.root.quaternion, 'YXZ')
      this.callbacks.onObjectChange(rig.id, {
        position: {
          x: rig.root.position.x,
          y: rig.root.position.y,
          z: rig.root.position.z,
        },
        rotation: { x: deg(euler.x), y: deg(euler.y), z: deg(euler.z) },
        scale: { x: rig.root.scale.x, y: rig.root.scale.y, z: rig.root.scale.z },
      })
      return
    }
    const id = this.selectedId
    if (!id) return
    const rig = this.rigs.get(id)
    if (!rig) return
    rig.root.position.y = Math.max(0.02, rig.root.position.y)
    if (rig.lockTarget) aimAt(rig.root, rig.lockTarget)
    const euler = new THREE.Euler().setFromQuaternion(rig.root.quaternion, 'YXZ')
    this.callbacks.onCameraChange(id, {
      position: {
        x: rig.root.position.x,
        y: rig.root.position.y,
        z: rig.root.position.z,
      },
      rotation: { x: deg(euler.x), y: deg(euler.y), z: deg(euler.z) },
    })
  }

  private applySelection() {
    for (const rig of this.rigs.values()) {
      const on = rig.id === this.selectedId
      rig.frustum.visible = on
      rig.ring.visible = on
    }
    for (const rig of this.objectRigs.values()) {
      if (rig.ring) {
        rig.ring.visible = !this.pickMode && rig.id === this.selectedObjectId && rig.root.visible
      }
    }
    if (this.pickMode) {
      this.transform.detach()
      return
    }
    if (this.selectedObjectId && this.tool !== 'select') {
      const rig = this.objectRigs.get(this.selectedObjectId)
      if (rig) {
        if (this.transform.object !== rig.root) this.transform.attach(rig.root)
        const mode = this.tool === 'rotate' ? 'rotate' : this.tool === 'scale' ? 'scale' : 'translate'
        this.transform.setMode(mode)
      }
      return
    }
    if (this.selectedId && this.tool !== 'select') {
      const rig = this.rigs.get(this.selectedId)
      if (rig) {
        if (this.transform.object !== rig.root) this.transform.attach(rig.root)
        const mode = this.tool === 'rotate' ? 'rotate' : 'translate'
        this.transform.setMode(rig.lockTarget ? 'translate' : mode)
      }
    } else {
      this.transform.detach()
    }
  }

  private ensureRig(config: CameraConfig): Rig {
    let rig = this.rigs.get(config.id)
    if (rig) return rig

    const root = new THREE.Object3D()
    root.rotation.order = 'YXZ'
    root.userData.cameraId = config.id
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, CAMERA_NEAR, CAMERA_FAR)
    root.add(camera)

    const body = buildCameraBody(config.id)
    root.add(body)

    const frustum = new THREE.LineSegments(
      buildFrustumGeometry(40, 16 / 9),
      new THREE.LineBasicMaterial({
        color: 0x5b9dff,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    )
    frustum.layers.set(HELPER_LAYER)
    frustum.visible = false
    frustum.userData.fov = 40
    frustum.userData.aspect = 16 / 9
    root.add(frustum)

    const ring = new THREE.BoxHelper(body, 0x5b9dff)
    ring.layers.set(HELPER_LAYER)
    ring.visible = false
    this.scene.add(ring)

    const marker = new THREE.Sprite(this.lockMaterial)
    marker.scale.set(0.58, 0.58, 1)
    marker.layers.set(HELPER_LAYER)
    marker.visible = false
    marker.renderOrder = 30
    this.scene.add(marker)

    this.scene.add(root)
    rig = {
      id: config.id,
      root,
      camera,
      body,
      frustum,
      ring,
      marker,
      lockTarget: null,
      dof: false,
      aperture: 2.8,
      focusDistance: 5.5,
    }
    this.rigs.set(config.id, rig)
    return rig
  }

  private removeRig(id: string) {
    const rig = this.rigs.get(id)
    if (!rig) return
    if (this.transform.object === rig.root) this.transform.detach()
    this.scene.remove(rig.root)
    this.scene.remove(rig.ring)
    this.scene.remove(rig.marker)
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
    ;(rig.frustum.material as THREE.Material).dispose()
    rig.ring.geometry.dispose()
    this.rigs.delete(id)
  }

  private ensureObjectRig(object: SceneObject): ObjectRig {
    const root = new THREE.Group()
    root.rotation.order = 'YXZ'
    root.userData.objectId = object.id
    const body = buildObjectModel(object)
    root.add(body)
    this.scene.add(root)
    const ring = new THREE.BoxHelper(body, 0x5b9dff)
    ring.layers.set(HELPER_LAYER)
    ring.visible = false
    this.scene.add(ring)
    const rig: ObjectRig = {
      id: object.id,
      kind: object.kind,
      name: object.name,
      allowUnderground: object.allowUnderground,
      root,
      body,
      signature: objectVisualSignature(object),
      ring,
    }
    this.objectRigs.set(object.id, rig)
    return rig
  }

  private rebuildObjectBody(rig: ObjectRig, object: SceneObject) {
    if (rig.body) {
      rig.root.remove(rig.body)
      disposeObject3D(rig.body)
    }
    if (rig.ring) {
      this.scene.remove(rig.ring)
      rig.ring.geometry.dispose()
      ;(rig.ring.material as THREE.Material).dispose()
      rig.ring = null
    }
    const body = buildObjectModel(object)
    rig.root.add(body)
    rig.body = body
    rig.signature = objectVisualSignature(object)
    const ring = new THREE.BoxHelper(body, 0x5b9dff)
    ring.layers.set(HELPER_LAYER)
    ring.visible = false
    this.scene.add(ring)
    rig.ring = ring
  }

  private syncObjects(project: Project) {
    for (const object of project.objects) {
      let rig = this.objectRigs.get(object.id)
      if (!rig) rig = this.ensureObjectRig(object)
      rig.kind = object.kind
      rig.name = object.name
      rig.allowUnderground = object.allowUnderground
      const signature = objectVisualSignature(object)
      if (signature !== rig.signature || !rig.body) this.rebuildObjectBody(rig, object)
      if (object.id !== this.draggingObjectId) {
        rig.root.position.set(object.position.x, object.position.y, object.position.z)
        applyRotation(rig.root, object.rotation)
        rig.root.scale.set(object.scale.x, object.scale.y, object.scale.z)
      }
      rig.root.visible = object.visible
      if (rig.ring && rig.body) {
        rig.root.updateMatrixWorld(true)
        rig.ring.setFromObject(rig.body)
        rig.ring.visible = object.id === this.selectedObjectId && !this.pickMode && object.visible
      }
    }
    for (const id of Array.from(this.objectRigs.keys())) {
      if (!project.objects.some((object) => object.id === id)) this.removeObjectRig(id)
    }
  }

  private removeObjectRig(id: string) {
    const rig = this.objectRigs.get(id)
    if (!rig) return
    if (this.transform.object === rig.root) this.transform.detach()
    this.scene.remove(rig.root)
    if (rig.body) {
      rig.root.remove(rig.body)
      disposeObject3D(rig.body)
    }
    if (rig.ring) {
      this.scene.remove(rig.ring)
      rig.ring.geometry.dispose()
      ;(rig.ring.material as THREE.Material).dispose()
    }
    this.objectRigs.delete(id)
  }

  private applySolid(color: string) {
    this.bgMode = 'solid'
    this.bg2d = null
    this.bg2dActive = false
    const c = new THREE.Color(color)
    this.scene.background = c
    this.ground.visible = true
    this.groundMat.color.copy(c)
    this.fog.color.copy(c)
    this.hemi.groundColor.copy(c)
    this.setBgTexture(null)
    this.removePlaneMesh()
    this.clearBoardMeshes()
  }

  private clearBoardMeshes() {
    for (const mesh of this.boardMeshes.values()) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.boardMeshes.clear()
  }

  private setBgTexture(texture: THREE.Texture | null) {
    const material = this.bgPlane.material as THREE.MeshBasicMaterial
    material.map = texture
    material.needsUpdate = true
    this.bg2dActive = !!texture && this.bgMode === 'image-screen'
  }

  private removePlaneMesh() {
    if (!this.planeMesh) return
    this.scene.remove(this.planeMesh)
    this.planeMesh.geometry.dispose()
    ;(this.planeMesh.material as THREE.Material).dispose()
    this.planeMesh = null
  }

  private applyPlaneBackground(
    texture: THREE.Texture,
    bg: ImageBackground,
    imageAspect: number,
  ) {
    if (!this.planeMesh) {
      const geometry = new THREE.PlaneGeometry(1, 1)
      flipUvY(geometry)
      this.planeMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }),
      )
      this.scene.add(this.planeMesh)
    }
    const material = this.planeMesh.material as THREE.MeshBasicMaterial
    material.map = texture
    material.needsUpdate = true
    const plane = bg.plane
    this.planeMesh.position.set(plane.x, plane.y, plane.z)
    this.planeMesh.scale.set(plane.width, plane.width / Math.max(0.1, imageAspect), 1)
  }

  private async getBackgroundTexture(assetId: string): Promise<THREE.Texture | null> {
    const cached = this.bgTextureCache.get(assetId)
    if (cached) return cached
    const asset = await getAsset(assetId)
    if (!asset) return null
    const bitmap = await createImageBitmap(asset.blob)
    const texture = new THREE.Texture(bitmap)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    texture.needsUpdate = true
    this.bgTextureCache.set(assetId, texture)
    return texture
  }

  /** 全景用：ImageBitmap 在部分浏览器里忽略 flipY，这里直接把图像上下翻转后作为纹理 */
  private async getPanoTexture(assetId: string): Promise<THREE.Texture | null> {
    const key = `${assetId}:pano`
    const cached = this.bgTextureCache.get(key)
    if (cached) return cached
    const asset = await getAsset(assetId)
    if (!asset) return null
    const bitmap = await createImageBitmap(asset.blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.translate(0, bitmap.height)
    ctx.scale(1, -1)
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    texture.needsUpdate = true
    this.bgTextureCache.set(key, texture)
    return texture
  }

  private getBoardAlphaMap(feather: number): THREE.CanvasTexture | null {
    const value = Math.round(Math.max(0, Math.min(0.4, feather)) * 100) / 100
    if (value <= 0) return null
    const cached = this.boardAlphaCache.get(value)
    if (cached) return cached
    const width = 256
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const image = ctx.createImageData(width, 1)
    const edge = Math.max(1, Math.round((value / 2) * width))
    for (let x = 0; x < width; x += 1) {
      const distance = Math.min(x, width - 1 - x)
      const alpha = distance >= edge ? 1 : distance / edge
      const offset = x * 4
      image.data[offset] = 255
      image.data[offset + 1] = Math.round(alpha * 255)
      image.data[offset + 2] = 255
      image.data[offset + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.NoColorSpace
    texture.needsUpdate = true
    this.boardAlphaCache.set(value, texture)
    return texture
  }

  private async applyBoardBackground(bg: BoardBackground, token: number) {
    try {      this.bgMode = 'board'
      this.bg2d = null
      this.bg2dActive = false
      this.scene.background = new THREE.Color(bg.fallbackColor || '#0e1013')
      this.ground.visible = false
      this.groundMat.color.set(bg.fallbackColor || '#0e1013')
      this.fog.color.set(bg.fallbackColor || '#0e1013')
      this.hemi.groundColor.set(bg.fallbackColor || '#0e1013')
      this.setBgTexture(null)
      this.removePlaneMesh()

      const seen = new Set<string>()
      for (const item of bg.items) {
        const texture = await this.getBackgroundTexture(item.assetId)
        if (token !== this.bgLoadToken) return
        seen.add(item.id)
        let mesh = this.boardMeshes.get(item.id)
        if (!mesh) {
          const geometry = new THREE.PlaneGeometry(1, 1)
          flipUvY(geometry)
          mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              toneMapped: false,
              side: THREE.DoubleSide,
              fog: false,
            }),
          )
          this.scene.add(mesh)
          this.boardMeshes.set(item.id, mesh)
        }
        const material = mesh.material as THREE.MeshBasicMaterial
        material.map = texture
        const alphaMap = this.getBoardAlphaMap(bg.feather || 0)
        material.alphaMap = alphaMap
        material.transparent = !!alphaMap
        material.depthWrite = !alphaMap
        material.needsUpdate = true
        mesh.renderOrder = alphaMap ? -1 : 0
        mesh.visible = !!texture
        const image = texture?.image as { width?: number; height?: number } | undefined
        const aspect =
          (item.width || image?.width || 16) /
          Math.max(1, item.height || image?.height || 9)
        const overlap = 1 + (bg.feather || 0)
        mesh.position.set(item.plane.x, item.plane.y, item.plane.z)
        mesh.scale.set(item.plane.width * overlap, (item.plane.width * overlap) / Math.max(0.1, aspect), 1)
        mesh.rotation.y = rad(item.yaw || 0)
        mesh.rotation.z = rad(item.rotation || 0)
      }

      for (const [id, mesh] of Array.from(this.boardMeshes.entries())) {
        if (seen.has(id)) continue
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        this.boardMeshes.delete(id)
      }
    } catch (err) {
      console.warn('背景板加载失败', err)
      if (token === this.bgLoadToken) {
        this.bgSignature = ''
        this.applySolid('#eef0f2')
      }
    }
  }

  private async applyAssetBackground(
    bg: ImageBackground | PanoBackground,
    token: number,
  ) {
    try {
      this.clearBoardMeshes()
      const texture =
        bg.kind === 'image'
          ? await this.getBackgroundTexture(bg.assetId)
          : await this.getPanoTexture(bg.assetId)
      if (token !== this.bgLoadToken) return
      if (!texture) {
        this.bgSignature = ''
        this.applySolid('#eef0f2')
        return
      }
      const image = texture.image as { width?: number; height?: number } | undefined
      if (bg.kind === 'image') {
        const width = bg.width || image?.width || 16
        const height = bg.height || image?.height || 9
        const imageAspect = width / Math.max(1, height)
        this.bg2d = bg
        this.bgFallback.set(bg.fallbackColor || '#0e1013')
        texture.mapping = THREE.UVMapping
        texture.needsUpdate = true
        if (bg.mode === 'plane') {
          this.bgMode = 'image-plane'
          this.bg2dActive = false
          this.scene.background = new THREE.Color(bg.fallbackColor || '#0e1013')
          this.ground.visible = true
          this.groundMat.color.set(bg.fallbackColor || '#0e1013')
          this.fog.color.set(bg.fallbackColor || '#0e1013')
          this.setBgTexture(null)
          this.applyPlaneBackground(texture, bg, imageAspect)
        } else {
          this.bgMode = 'image-screen'
          this.scene.background = null
          this.ground.visible = false
          this.removePlaneMesh()
          this.setBgTexture(texture)
        }
        return
      }

      this.bgMode = 'pano'
      this.bg2d = null
      this.bg2dActive = false
      texture.mapping = THREE.EquirectangularReflectionMapping
      texture.needsUpdate = true
      this.scene.background = texture
      this.scene.backgroundRotation.set(rad(bg.pitch || 0), rad(bg.yaw || 0), rad(bg.roll || 0))
      this.ground.visible = false
      this.setBgTexture(null)
      this.removePlaneMesh()
    } catch (err) {
      console.warn('背景加载失败', err)
      if (token === this.bgLoadToken) {
        this.bgSignature = ''
        this.applySolid('#eef0f2')
      }
    }
  }

  private syncBackground(project: Project) {
    const bg = project.background
    const signature = JSON.stringify(
      bg.kind === 'solid' ? bg : { ...bg, preview: undefined, name: undefined },
    )
    if (signature === this.bgSignature) return
    this.bgSignature = signature
    if (bg.kind === 'solid') {
      this.applySolid(bg.color)
      return
    }
    const token = ++this.bgLoadToken
    if (bg.kind === 'board') {
      void this.applyBoardBackground(bg, token)
      return
    }
    void this.applyAssetBackground(bg, token)
  }

  private layoutBgPlane(aspect: number) {
    const bg = this.bg2d
    if (!bg) return
    const imageAspect = (bg.width || 16) / Math.max(1, bg.height || 9)
    const cover = Math.max(aspect / Math.max(0.1, imageAspect), 1)
    const zoom = bg.scale || 1
    this.bgPlane.scale.set(imageAspect * cover * zoom, cover * zoom, 1)
    this.bgPlane.position.set((bg.offsetX || 0) * aspect * 0.5, (bg.offsetY || 0) * 0.5, 0)
    this.bgPlane.rotation.z = rad(bg.rotation || 0)
  }

  private rebuildGridTexture() {
    const previous = this.gridTexture
    this.gridTexture = createGridTexture(this.gridWidth)
    const material = this.grid.material as THREE.MeshBasicMaterial
    material.map = this.gridTexture
    material.needsUpdate = true
    previous.dispose()
  }

  /** 仅预览显示背景时，工作台临时切回白膜舞台 */
  private renderWhiteStage(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    const previousBackground = this.scene.background
    const previousFog = this.scene.fog
    const previousFogColor = this.fog.color.clone()
    const previousHemiGround = this.hemi.groundColor.clone()
    const previousGroundVisible = this.ground.visible
    const previousGroundColor = this.groundMat.color.clone()
    const previousMode = this.bgMode
    const previous2dActive = this.bg2dActive
    const previous2d = this.bg2d
    const previousPlaneVisible = this.planeMesh?.visible ?? false
    const previousBoardVisibility = new Map(
      Array.from(this.boardMeshes.entries()).map(([id, mesh]) => [id, mesh.visible]),
    )
    const white = new THREE.Color('#eef0f2')

    this.scene.background = white
    this.bgMode = 'solid'
    this.bg2dActive = false
    this.bg2d = null
    this.ground.visible = true
    this.groundMat.color.copy(white)
    this.hemi.groundColor.copy(white)
    if (this.planeMesh) this.planeMesh.visible = false
    for (const mesh of this.boardMeshes.values()) mesh.visible = false
    if (this.stageFog) {
      this.fog.color.copy(white)
      this.scene.fog = this.fog
    } else {
      this.scene.fog = null
    }

    renderer.autoClear = true
    renderer.render(this.scene, camera)

    this.scene.background = previousBackground
    this.scene.fog = previousFog
    this.fog.color.copy(previousFogColor)
    this.hemi.groundColor.copy(previousHemiGround)
    this.ground.visible = previousGroundVisible
    this.groundMat.color.copy(previousGroundColor)
    this.bgMode = previousMode
    this.bg2dActive = previous2dActive
    this.bg2d = previous2d
    if (this.planeMesh) this.planeMesh.visible = previousPlaneVisible
    for (const [id, mesh] of this.boardMeshes) {
      mesh.visible = previousBoardVisibility.get(id) ?? true
    }
  }

  private renderWithBackground(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    aspect: number,
  ) {
    if (this.bgMode === 'image-screen' && this.bg2dActive && this.bg2d) {
      renderer.autoClear = false
      renderer.setClearColor(this.bgFallback, 1)
      renderer.clear(true, true, true)
      this.bgCamera.left = -aspect / 2
      this.bgCamera.right = aspect / 2
      this.bgCamera.top = 0.5
      this.bgCamera.bottom = -0.5
      this.bgCamera.updateProjectionMatrix()
      this.layoutBgPlane(aspect)
      renderer.render(this.bgScene, this.bgCamera)
      renderer.clearDepth()
      renderer.render(this.scene, camera)
      renderer.autoClear = true
    } else {
      renderer.autoClear = true
      renderer.render(this.scene, camera)
    }
  }

  private applyEnvironmentTransform(env: EnvironmentConfig) {
    const group = this.environmentGroup
    group.visible = env.visible
    group.position.set(env.position.x, env.position.y, env.position.z)
    group.rotation.y = deg(env.rotation)
    group.scale.setScalar(env.scale)
    group.traverse((child) => {
      if (child instanceof THREE.Points) {
        const material = child.material as THREE.PointsMaterial
        material.opacity = env.opacity
        material.transparent = env.opacity < 1
        material.depthWrite = env.opacity >= 1
      } else if (child instanceof THREE.Mesh) {
        child.receiveShadow = env.contactShadows
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          material.transparent = env.opacity < 1
          material.opacity = env.opacity
          material.depthWrite = true
        }
      }
    })
    this.environmentContactShadows = env.contactShadows
    this.spark.enableLod = env.gaussian.lod
    this.spark.lodSplatCount = Math.max(50_000, env.gaussian.budget)
    if (this.environmentSplat) {
      this.environmentSplat.opacity = env.opacity
      this.environmentSplat.visible = env.visible
    }
    const groundActive = env.kind !== 'none' && env.visible && env.ground.enabled
    this.groundProxy.visible = groundActive
    this.groundProxy.scale.setScalar(env.ground.size)
    const groundMaterial = this.groundProxy.material as THREE.MeshStandardMaterial
    groundMaterial.color.set(env.ground.color)
    groundMaterial.opacity = env.ground.opacity
    groundMaterial.transparent = env.ground.opacity < 1
    this.groundProxy.receiveShadow = env.contactShadows
    this.shadowCatcher.visible = this.stageShadows && env.contactShadows && !groundActive
  }

  private clearEnvironment() {
    if (this.environmentSplat) {
      this.environmentSplat.dispose()
      this.environmentSplat = null
    }
    for (const child of [...this.environmentGroup.children]) {
      this.environmentGroup.remove(child)
      child.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) value.dispose()
            }
            material.dispose()
          }
        }
      })
    }
  }

  private async syncEnvironment(env: EnvironmentConfig) {
    const key = `${env.kind}:${env.assetId ?? ''}`
    if (key !== this.environmentKey) {
      this.environmentKey = key
      const token = ++this.environmentLoadToken
      this.clearEnvironment()
      if (env.kind !== 'none' && env.assetId) {
        await this.loadEnvironment(env, token)
      }
    }
    this.applyEnvironmentTransform(env)
  }

  private async loadEnvironment(env: EnvironmentConfig, token: number) {
    if (!env.assetId) return
    try {
      const asset = await getAsset(env.assetId)
      if (!asset || token !== this.environmentLoadToken) return
      const buffer = await asset.blob.arrayBuffer()
      if (token !== this.environmentLoadToken) return
      const group = new THREE.Group()
      group.name = `Environment:${env.kind}`
      if (env.kind === 'glb') {
        const gltf = await new GLTFLoader().parseAsync(buffer, '')
        if (token !== this.environmentLoadToken) return
        group.add(gltf.scene)
      } else if (env.kind === 'ply' || env.kind === 'splat' || env.kind === 'spz') {
        const fileBytes =
          env.kind === 'splat' && env.gaussian.lod
            ? downsampleSplatBytes(buffer, env.gaussian.budget)
            : new Uint8Array(buffer)
        const splat = new SplatMesh({
          fileBytes,
          fileName: env.name,
          lod: false,
          enableLod: false,
        })
        await splat.initialized
        if (token !== this.environmentLoadToken) {
          splat.dispose()
          return
        }
        group.add(splat)
      }
      if (token !== this.environmentLoadToken) return
      this.clearEnvironment()
      this.environmentGroup.add(group)
      this.environmentSplat = group.children.find((child) => child instanceof SplatMesh) ?? null
      this.applyEnvironmentTransform(env)
    } catch (err) {
      console.error('3D 环境加载失败', err)
      this.callbacks.onEnvironmentError?.(err instanceof Error ? err.message : String(err))
    }
  }

  syncProject(project: Project) {
    this.syncBackground(project)
    this.backgroundInEditor = project.ui.backgroundInEditor
    this.stageFog = project.stage.fog
    this.outputWidth = Math.max(2, project.output.width)
    this.outputHeight = Math.max(2, project.output.height)
    this.grid.visible = project.stage.grid
    if (this.gridWidth !== project.stage.gridWidth) {
      this.gridWidth = clamp(project.stage.gridWidth, 1, 8)
      this.rebuildGridTexture()
    }
    this.whiteFloorMesh.visible = project.stage.whiteFloor
    this.keyLight.castShadow = project.stage.shadows
    this.stageShadows = project.stage.shadows
    this.shadowCatcher.visible = project.stage.shadows && project.environment.contactShadows
    this.environmentContactShadows = project.environment.contactShadows
    void this.syncEnvironment(project.environment)
    const background = project.background
    const solidLike =
      background.kind === 'solid' ||
      (background.kind === 'image' && background.mode === 'plane')
    this.scene.fog = solidLike && project.stage.fog ? this.fog : null

    const ratio = ASPECTS[project.output.aspect].ratio
    for (const config of project.cameras) {
      const rig = this.ensureRig(config)
      if (config.id !== this.draggingId) {
        rig.root.position.set(config.position.x, config.position.y, config.position.z)
        applyRotation(rig.root, config.rotation)
      }

      rig.lockTarget = null
      if (config.targetLock) {
        const target = resolveTargetPosition(project, config.targetLock, config.id)
        if (target) {
          const vec = new THREE.Vector3(target.x, target.y, target.z)
          rig.lockTarget = vec
          if (config.id !== this.draggingId) aimAt(rig.root, vec)
          rig.marker.position.set(target.x, target.y + 0.36, target.z)
          rig.marker.visible = true
        } else {
          rig.marker.visible = false
        }
      } else {
        rig.marker.visible = false
      }

      rig.camera.fov = fovFromFocal(config.focal, SENSORS[config.sensor].height)
      rig.camera.aspect = ratio
      rig.camera.updateProjectionMatrix()
      rig.dof = config.dof
      rig.aperture = config.aperture
      rig.focusDistance = config.focusDistance

      if (rig.frustum.userData.fov !== rig.camera.fov || rig.frustum.userData.aspect !== ratio) {
        rig.frustum.geometry.dispose()
        rig.frustum.geometry = buildFrustumGeometry(rig.camera.fov, ratio)
        rig.frustum.userData.fov = rig.camera.fov
        rig.frustum.userData.aspect = ratio
      }
    }

    for (const id of Array.from(this.rigs.keys())) {
      if (!project.cameras.some((c) => c.id === id)) this.removeRig(id)
    }

    this.syncObjects(project)

    if (this.selectedId && !this.rigs.has(this.selectedId)) this.selectedId = null
    if (this.selectedObjectId && !this.objectRigs.has(this.selectedObjectId)) {
      this.selectedObjectId = null
    }
    this.applySelection()
  }

  setSelected(id: string | null) {
    this.selectedId = id
    if (id) this.selectedObjectId = null
    this.applySelection()
  }

  setSelectedObject(id: string | null) {
    this.selectedObjectId = id
    if (id) this.selectedId = null
    this.applySelection()
  }

  setTool(tool: ToolId) {
    this.tool = tool
    this.applySelection()
  }

  setPreviewCamera(id: string | null) {
    this.previewCameraId = id
    if (this.previewLayout === 'single' && id) this.previewCameraIds = [id]
  }

  setPreviewLayout(layout: PreviewLayout, ids: string[], free?: FreePreviewGrid) {
    this.previewLayout = normalizePreviewLayout(layout)
    this.previewFree = free ?? DEFAULT_FREE_GRID
    this.previewCameraIds = ids.filter(Boolean).slice(0, 5)
    this.previewCameraId = this.previewCameraIds[0] ?? this.previewCameraId
  }

  setDofDebug(value: boolean) {
    this.dofDebug = value
  }

  setPickMode(on: boolean) {
    if (this.pickMode === on) return
    this.pickMode = on
    this.container.classList.toggle('target-pick', on)
    if (on) this.transform.detach()
    else this.applySelection()
  }

  focusSelected() {
    if (this.selectedObjectId) {
      const rig = this.objectRigs.get(this.selectedObjectId)
      if (!rig) return
      const box = new THREE.Box3().setFromObject(rig.root)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      this.controls.target.copy(center)
      const distance = Math.max(2.4, Math.max(size.x, size.z) + 2.2)
      this.editorCamera.position.set(
        center.x + distance * 0.8,
        Math.max(1.4, center.y + Math.max(0.8, size.y * 0.6)),
        center.z + distance,
      )
      this.controls.update()
      return
    }
    if (!this.selectedId) return
    const rig = this.rigs.get(this.selectedId)
    if (!rig) return
    this.controls.target.copy(rig.root.position)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.quaternion)
    this.editorCamera.position.copy(rig.root.position).addScaledVector(forward, 3.2)
    this.editorCamera.position.y = Math.max(0.3, this.editorCamera.position.y)
    this.controls.update()
  }

  mountPreview(host: HTMLElement) {
    if (this.preview) this.unmountPreview()
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    host.appendChild(canvas)
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, CAMERA_NEAR, CAMERA_FAR)
    camera.layers.set(0)
    this.preview = { canvas, renderer, camera }
  }

  unmountPreview() {
    if (!this.preview) return
    this.preview.renderer.dispose()
    this.preview.canvas.remove()
    this.preview = null
  }

  /** 离线渲染指定机位的一帧，返回 2D 画布，用于视频导出 */
  renderCameraFrame(cameraId: string, width: number, height: number): HTMLCanvasElement | null {
    const rig = this.rigs.get(cameraId)
    if (!rig) return null
    const renderer = this.renderer
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 })
    const camera = new THREE.PerspectiveCamera(
      rig.camera.fov,
      width / Math.max(1, height),
      CAMERA_NEAR,
      CAMERA_FAR,
    )
    camera.position.copy(rig.root.position)
    camera.quaternion.copy(rig.root.quaternion)
    camera.layers.set(0)
    camera.updateProjectionMatrix()

    const previousTarget = renderer.getRenderTarget()
    const gizmoVisible = this.transformHelper.visible
    this.transformHelper.visible = false
    renderer.setRenderTarget(target)
    renderer.autoClear = true
    this.renderWithBackground(renderer, camera, width / Math.max(1, height))
    const buffer = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer)
    linearBufferToSrgb(buffer)
    renderer.setRenderTarget(previousTarget)
    this.transformHelper.visible = gizmoVisible
    target.dispose()

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const image = ctx.createImageData(width, height)
    for (let y = 0; y < height; y += 1) {
      const src = (height - 1 - y) * width * 4
      image.data.set(buffer.subarray(src, src + width * 4), y * width * 4)
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  }

  /** 带实时景深的离屏帧；导出分屏时逐格复用预览渲染器 */
  renderCameraFrameWithDof(
    cameraId: string,
    width: number,
    height: number,
  ): HTMLCanvasElement | null {
    const preview = this.preview
    const rig = this.rigs.get(cameraId)
    if (!preview || !rig || !rig.dof) return this.renderCameraFrame(cameraId, width, height)
    if (this.environmentSplat) return this.renderCameraFrame(cameraId, width, height)
    const oldWidth = preview.canvas.clientWidth || preview.renderer.domElement.width
    const oldHeight = preview.canvas.clientHeight || preview.renderer.domElement.height
    preview.renderer.setSize(width, height, false)
    this.renderDofCell(
      preview.renderer,
      rig,
      0,
      0,
      width,
      height,
      width,
      height,
    )
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      preview.renderer.setSize(oldWidth, oldHeight, false)
      return null
    }
    ctx.drawImage(preview.renderer.domElement, 0, 0, width, height)
    preview.renderer.setSize(oldWidth, oldHeight, false)
    preview.renderer.setScissorTest(false)
    preview.renderer.setViewport(0, 0, oldWidth, oldHeight)
    return canvas
  }

  /** 渲染一张缩略图（dataURL），用于历史记录 / 外部 Agent 截图 */
  captureThumb(ratio: number, widthParam = 320): string | null {
    const id = this.previewCameraId
    if (!id) return null
    const rig = this.rigs.get(id)
    if (!rig) return null
    const renderer = this.preview?.renderer ?? this.renderer
    const width = Math.min(2048, Math.max(64, Math.round(widthParam)))
    const height = Math.max(2, Math.round(width / Math.max(0.1, ratio)))
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 })
    const camera = new THREE.PerspectiveCamera(rig.camera.fov, width / height, CAMERA_NEAR, CAMERA_FAR)
    camera.position.copy(rig.root.position)
    camera.quaternion.copy(rig.root.quaternion)
    camera.updateProjectionMatrix()
    camera.layers.set(0)

    const gizmoVisible = this.transformHelper.visible
    this.transformHelper.visible = false
    renderer.setRenderTarget(target)
    this.renderWithBackground(renderer, camera, width / height)
    renderer.setRenderTarget(null)
    this.transformHelper.visible = gizmoVisible

    const buffer = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer)
    linearBufferToSrgb(buffer)
    target.dispose()

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const image = ctx.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * 4
      image.data.set(buffer.subarray(src, src + width * 4), y * width * 4)
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  }

  /** 导出当前预览机位内可见人偶的部件 ID 色图和逐部件 mask */
  exportPartMasks(): { blob: Blob; partCount: number; objectCount: number } | null {
    const previewId = this.previewCameraId ?? this.rigs.keys().next().value
    const rig = typeof previewId === 'string' ? this.rigs.get(previewId) : null
    if (!rig) return null

    const mannequins = Array.from(this.objectRigs.values()).filter(
      (object) => object.kind === 'mannequin' && object.root.visible && object.body,
    )
    if (mannequins.length === 0) return null

    interface PartGroup {
      objectId: string
      objectName: string
      part: string
      meshes: THREE.Mesh[]
    }
    const groups: PartGroup[] = []
    for (const object of mannequins) {
      const byPart = new Map<string, THREE.Mesh[]>()
      object.body!.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        const part = typeof mesh.userData.part === 'string' ? mesh.userData.part : 'body'
        const list = byPart.get(part) ?? []
        list.push(mesh)
        byPart.set(part, list)
      })
      const ordered = [
        ...PART_ORDER.filter((part) => byPart.has(part)),
        ...Array.from(byPart.keys()).filter((part) => !PART_ORDER.includes(part)),
      ]
      for (const part of ordered) {
        groups.push({
          objectId: object.id,
          objectName: object.name,
          part,
          meshes: byPart.get(part) ?? [],
        })
      }
    }
    if (groups.length === 0) return null

    const palette = groups.map((_, index) => {
      const color = partColor(index)
      const hex = `#${color.getHexString()}`
      return {
        hex,
        rgb: [
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
        ] as [number, number, number],
      }
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.min(2048, Math.max(2, Math.round(this.outputWidth)))
    canvas.height = Math.max(
      2,
      Math.round(canvas.width * (this.outputHeight / Math.max(1, this.outputWidth))),
    )
    const width = canvas.width
    const height = canvas.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const whiteMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    })
    const blackMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      toneMapped: false,
    })
    const savedMaterials: {
      mesh: THREE.Mesh
      material: THREE.Material | THREE.Material[]
    }[] = []
    for (const object of mannequins) {
      object.body!.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        savedMaterials.push({ mesh, material: mesh.material })
        mesh.material = blackMaterial
      })
    }

    const camera = new THREE.PerspectiveCamera(
      rig.camera.fov,
      width / height,
      CAMERA_NEAR,
      CAMERA_FAR,
    )
    camera.position.copy(rig.root.position)
    camera.quaternion.copy(rig.root.quaternion)
    camera.layers.set(0)
    camera.updateProjectionMatrix()

    const renderer = this.renderer
    const previousTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear
    const previousClearColor = renderer.getClearColor(new THREE.Color()).clone()
    const previousClearAlpha = renderer.getClearAlpha()
    const previousOutputColorSpace = renderer.outputColorSpace
    const previousBackground = this.scene.background
    const previousFog = this.scene.fog
    const previousGround = this.ground.visible
    const previousShadowCatcher = this.shadowCatcher.visible
    const previousEnvironment = this.environmentGroup.visible
    const previousGroundProxy = this.groundProxy.visible
    const previousSpark = this.spark.visible
    const previousTransformHelper = this.transformHelper.visible
    const cameraVisibility = Array.from(this.rigs.values()).map((item) => ({
      item,
      root: item.root.visible,
      ring: item.ring.visible,
      frustum: item.frustum.visible,
      marker: item.marker.visible,
    }))
    const objectVisibility = Array.from(this.objectRigs.values()).map((item) => ({
      item,
      root: item.root.visible,
      ring: item.ring?.visible ?? false,
    }))

    const target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      samples: 0,
    })
    const buffer = new Uint8Array(width * height * 4)
    const idData = new Uint8ClampedArray(width * height * 4)
    for (let index = 0; index < width * height; index++) idData[index * 4 + 3] = 255
    const maskPngs: Uint8Array[] = []

    try {
      this.scene.background = null
      this.scene.fog = null
      this.ground.visible = false
      this.shadowCatcher.visible = false
      this.environmentGroup.visible = false
      this.groundProxy.visible = false
      this.spark.visible = false
      this.transformHelper.visible = false
      for (const entry of cameraVisibility) {
        entry.item.root.visible = false
        entry.item.ring.visible = false
        entry.item.frustum.visible = false
        entry.item.marker.visible = false
      }
      for (const entry of objectVisibility) {
        entry.item.root.visible = entry.item.kind === 'mannequin' ? entry.root : false
        if (entry.item.ring) entry.item.ring.visible = false
      }

      renderer.setRenderTarget(target)
      renderer.autoClear = true
      renderer.setClearColor(0x000000, 1)
      renderer.outputColorSpace = THREE.SRGBColorSpace

      for (let partIndex = 0; partIndex < groups.length; partIndex++) {
        for (const mesh of groups[partIndex].meshes) mesh.material = whiteMaterial
        renderer.clear()
        renderer.render(this.scene, camera)
        renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer)

        const maskImage = ctx.createImageData(width, height)
        for (let pixel = 0; pixel < width * height; pixel++) {
          const x = pixel % width
          const y = Math.floor(pixel / width)
          const source = ((height - 1 - y) * width + x) * 4
          const on = buffer[source] > 128
          const targetIndex = pixel * 4
          maskImage.data[targetIndex] = on ? 255 : 0
          maskImage.data[targetIndex + 1] = on ? 255 : 0
          maskImage.data[targetIndex + 2] = on ? 255 : 0
          maskImage.data[targetIndex + 3] = 255
          if (on) {
            const rgb = palette[partIndex].rgb
            idData[targetIndex] = rgb[0]
            idData[targetIndex + 1] = rgb[1]
            idData[targetIndex + 2] = rgb[2]
          }
        }
        ctx.putImageData(maskImage, 0, 0)
        maskPngs[partIndex] = dataUrlToBytes(canvas.toDataURL('image/png'))
        for (const mesh of groups[partIndex].meshes) mesh.material = blackMaterial
      }
    } finally {
      renderer.setRenderTarget(previousTarget)
      renderer.autoClear = previousAutoClear
      renderer.setClearColor(previousClearColor, previousClearAlpha)
      renderer.outputColorSpace = previousOutputColorSpace
      this.scene.background = previousBackground
      this.scene.fog = previousFog
      this.ground.visible = previousGround
      this.shadowCatcher.visible = previousShadowCatcher
      this.environmentGroup.visible = previousEnvironment
      this.groundProxy.visible = previousGroundProxy
      this.spark.visible = previousSpark
      this.transformHelper.visible = previousTransformHelper
      for (const entry of cameraVisibility) {
        entry.item.root.visible = entry.root
        entry.item.ring.visible = entry.ring
        entry.item.frustum.visible = entry.frustum
        entry.item.marker.visible = entry.marker
      }
      for (const entry of objectVisibility) {
        entry.item.root.visible = entry.root
        if (entry.item.ring) entry.item.ring.visible = entry.ring
      }
      for (const saved of savedMaterials) saved.mesh.material = saved.material
      target.dispose()
      whiteMaterial.dispose()
      blackMaterial.dispose()
    }

    const idImage = ctx.createImageData(width, height)
    idImage.data.set(idData)
    ctx.putImageData(idImage, 0, 0)
    const files: Record<string, Uint8Array> = {
      'part-id.png': dataUrlToBytes(canvas.toDataURL('image/png')),
    }

    const parts = groups.map((group, index) => {
      const part = group.part
      const label = PART_LABELS[part] ?? part
      const maskFile = `masks/${String(index + 1).padStart(2, '0')}-${part.replace(/[^a-z0-9_-]/gi, '-')}.png`
      files[maskFile] = maskPngs[index]
      return {
        id: index + 1,
        object: group.objectName,
        objectId: group.objectId,
        part,
        label,
        color: palette[index].hex,
        mask: maskFile,
      }
    })

    const meta = {
      format: 'whitestage-part-id',
      version: 1,
      generatedAt: new Date().toISOString(),
      cameraId: rig.id,
      resolution: [width, height],
      background: 'black',
      note: 'part-id.png 每块部件唯一颜色；masks/*.png 为白前景黑背景；仅包含当前预览机位内可见的人偶。',
      parts,
    }
    const readme = [
      '白膜预演台 · 部件 ID / Mask 导出',
      '',
      'part-id.png   每块部件用唯一纯色表示，黑色为背景。',
      'masks/*.png   每个部件的 mask：白色为部件，黑色为其他区域。',
      'parts.json    调色板、对象名、部件名、颜色与 mask 文件对应关系。',
      '',
      '用途：用于 AI 分割、替换、合成或训练数据标注。',
      '说明：颜色只用于分割索引；AI 替换时请使用 mask 和 parts.json，不要只依赖外观颜色。',
      '范围：只包含当前预览机位内可见的人偶；被遮挡或画面外的部件 mask 为空。',
      '部件命名：head / leftHand / rightHand / leftFoot / rightFoot 等，和模型部件命名一致。',
      '',
    ].join('\n')
    files['parts.json'] = strToU8(JSON.stringify(meta, null, 2))
    files['README.txt'] = strToU8(readme)
    const zipped = zipSync(files, { level: 6 })
    return {
      blob: new Blob([zipped], { type: 'application/zip' }),
      partCount: groups.length,
      objectCount: mannequins.length,
    }
  }

  getCameraPosition(id: string): Vec3 | null {
    const rig = this.rigs.get(id)
    if (!rig) return null
    return { x: rig.root.position.x, y: rig.root.position.y, z: rig.root.position.z }
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    this.transform.detach()
    this.transform.dispose()
    this.controls.dispose()
    this.unmountPreview()
    for (const id of Array.from(this.rigs.keys())) this.removeRig(id)
    for (const id of Array.from(this.objectRigs.keys())) this.removeObjectRig(id)
    this.shadowCatcher.geometry.dispose()
    ;(this.shadowCatcher.material as THREE.Material).dispose()
    this.ground.geometry.dispose()
    this.groundMat.dispose()
    this.grid.geometry.dispose()
    ;(this.grid.material as THREE.Material).dispose()
    this.gridTexture.dispose()
    this.whiteFloorMesh.geometry.dispose()
    ;(this.whiteFloorMesh.material as THREE.Material).dispose()
    this.lockMaterial.dispose()
    this.lockTexture.dispose()
    for (const texture of this.bgTextureCache.values()) texture.dispose()
    this.bgTextureCache.clear()
    this.bgPlane.geometry.dispose()
    ;(this.bgPlane.material as THREE.Material).dispose()
    this.removePlaneMesh()
    this.clearEnvironment()
    this.spark.dispose()
    this.groundProxy.geometry.dispose()
    ;(this.groundProxy.material as THREE.Material).dispose()
    this.originHelper.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
    this.renderer.dispose()
    canvas.remove()
  }
}

export const clampCameraHeight = (v: number) => clamp(v, 0.02, 200)
