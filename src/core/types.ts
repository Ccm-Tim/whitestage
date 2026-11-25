export type Vec3 = { x: number; y: number; z: number }

export type AspectId = '16:9' | '9:16' | '4:3' | '3:4' | '21:9'

export type SensorId = 'ff' | 's35' | 'mft' | 'inch1'

export type ToolId = 'select' | 'translate' | 'rotate' | 'scale'

export type BgPreset = 'white' | 'green' | 'blue' | 'custom'

export type BackgroundUploadKind =
  | 'image-screen'
  | 'image-plane'
  | 'pano-360'
  | 'pano-180'
  | 'planet-360'

export interface ImageBackground {
  kind: 'image'
  assetId: string
  mode: 'screen' | 'plane'
  offsetX: number
  offsetY: number
  scale: number
  rotation: number
  /** 背景板模式下的世界坐标与宽度（米） */
  plane: { x: number; y: number; z: number; width: number }
  /** 边缘填充色（旋转/缩放露出时使用） */
  fallbackColor: string
  name?: string
  width?: number
  height?: number
  preview?: string
}

export interface PanoBackground {
  kind: 'pano'
  assetId: string
  projection: '360' | '180'
  yaw: number
  /** 俯仰，用于把照片地平线对齐舞台地面 */
  pitch: number
  /** 翻滚，用于校准倾斜的全景照片 */
  roll: number
  source?: 'equirect' | 'littleplanet'
  name?: string
  width?: number
  height?: number
  preview?: string
}

export interface BoardItem {
  id: string
  assetId: string
  name?: string
  width?: number
  height?: number
  preview?: string
  /** 世界坐标；y 为板中心高度 */
  plane: { x: number; y: number; z: number; width: number }
  /** 绕 Z 轴旋转（度） */
  rotation: number
  /** 曲面摆放时朝向中心的偏航角（度） */
  yaw: number
}

export interface BoardBackground {
  kind: 'board'
  items: BoardItem[]
  activeId: string | null
  fallbackColor: string
  /** 曲面拼接角度；0 为平面，180 / 360 为环绕 */
  curve: number
  /** 接缝羽化强度（0–0.4） */
  feather: number
  /** 锁定后禁止改动板布局 / 参数 */
  locked: boolean
}

export type BackgroundConfig =
  | { kind: 'solid'; color: string; preset: BgPreset }
  | ImageBackground
  | PanoBackground
  | BoardBackground

export type CameraTargetLock =
  | { kind: 'origin' }
  | { kind: 'camera'; id: string }
  | { kind: 'object'; id: string }
  | { kind: 'point'; position: Vec3 }

export interface CameraConfig {
  id: string
  name: string
  position: Vec3
  /** 欧拉角（度），YXZ 顺序；x = 俯仰，y = 偏航，z = 翻滚 */
  rotation: Vec3
  /** 焦距（mm） */
  focal: number
  sensor: SensorId
  /** 光圈 f 值 */
  aperture: number
  /** 对焦距离（米） */
  focusDistance: number
  dof: boolean
  /** 目标锁定：锁定后镜头始终对准目标 */
  targetLock: CameraTargetLock | null
  /** 当前套用的镜头模板 id（手动改参数后清空） */
  lensTemplateId: string | null
}

export interface StageSettings {
  grid: boolean
  /** 网格线粗细（像素，1–8） */
  gridWidth: number
  /** 在舞台中心垫一块白色地面，便于在全景/图片背景上看清网格 */
  whiteFloor: boolean
  shadows: boolean
  fog: boolean
}

export interface OutputSettings {
  aspect: AspectId
  width: number
  height: number
  fps: number
}

export interface FreePreviewGrid {
  cols: number
  rows: number
  colSizes: number[]
  rowSizes: number[]
}

export interface PreviewState {
  visible: boolean
  x: number
  y: number
  w: number
  h: number
  cameraId: string | null
  /** 分屏布局；cameraIds 按格子顺序排列 */
  layout: 'single' | 'dual' | 'quad' | 'five' | 'free'
  cameraIds: string[]
  free: FreePreviewGrid
}

export type ObjectCategory = 'mannequin' | 'animal' | 'plant' | 'insect' | 'building' | 'vehicle'

export type WeaponType = 'sword' | 'staff' | 'knife' | 'handblade' | 'pistol' | 'rifle'

export interface WeaponConfig {
  type: WeaponType
  hand: 'left' | 'right'
  /** 相对手部的偏移（米） */
  offset: Vec3
  /** 相对手部的旋转（度） */
  rotation: Vec3
  scale: number
}

export interface SceneObject {
  id: string
  kind: 'mannequin' | 'prop'
  /** 对象库预设 id，例如 man-adult / dog / tree */
  variant: string
  category: ObjectCategory
  name: string
  position: Vec3
  /** 对象初始生成位置，用于一键恢复默认位置 */
  homePosition: Vec3
  /** 欧拉角（度），YXZ */
  rotation: Vec3
  scale: Vec3
  /** 是否允许 Y 低于地面（穿地） */
  allowUnderground: boolean
  /** 人偶训练服颜色 / 道具主色 */
  color: string
  /** 人偶头、手、脖子的颜色；道具忽略 */
  skinColor: string
  /** 人偶鞋子颜色；道具忽略 */
  shoeColor: string
  /** 人偶是否显示五官 */
  faceDetail: boolean
  pose: string
  /** 自定义角色：绝对关节旋转（度）；null 时使用预设姿势 */
  joints: Record<string, Vec3> | null
  /** 整体根节点偏移（米）：用于下蹲 / 坐地 / 趴下 / 英雄落地 */
  bodyOffset: Vec3
  /** 整体根节点旋转（度）：用于趴下 / 翻滚 */
  bodyRotation: Vec3
  /** 来源自定义角色 id */
  customId: string | null
  /** 手部武器 */
  weapon: WeaponConfig | null
  /** 人偶身高（米）；道具为预设高度 */
  height: number
  /** 目标锁定瞄准高度（未乘 scale.y） */
  aimHeight: number
  visible: boolean
}

export interface Keyframe {
  frame: number
  snapshot: Record<string, unknown>
}

export interface LensTemplate {
  id: string
  name: string
  /** 系统自带模板为 true，不可删除 / 改名 */
  builtin?: boolean
  focal: number
  sensor: SensorId
  aperture: number
  focusDistance: number
  dof: boolean
}

export interface CustomCharacter {
  id: string
  name: string
  baseVariant: string
  height: number
  color: string
  skinColor: string
  shoeColor: string
  faceDetail: boolean
  joints: Record<string, Vec3>
  bodyOffset: Vec3
  bodyRotation: Vec3
  weapon: WeaponConfig | null
  createdAt: number
}

export interface ProjectUi {
  preview: PreviewState
  tool: ToolId
  /** 编辑器工作台是否显示真实背景；false 时工作台保持白膜，仅预览显示背景 */
  backgroundInEditor: boolean
}

export interface Project {
  schemaVersion: 1
  id: string
  name: string
  createdAt: number
  updatedAt: number
  background: BackgroundConfig
  stage: StageSettings
  output: OutputSettings
  cameras: CameraConfig[]
  objects: SceneObject[]
  timeline: { keyframes: Keyframe[]; durationFrames: number }
  ui: ProjectUi
}
