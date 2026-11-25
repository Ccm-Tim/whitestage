import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  AspectId,
  BackgroundConfig,
  BackgroundUploadKind,
  BoardBackground,
  BoardItem,
  CameraConfig,
  CameraTargetLock,
  CustomCharacter,
  ImageBackground,
  LensTemplate,
  PanoBackground,
  PreviewState,
  Project,
  SceneObject,
  ToolId,
} from '../core/types'
import { ASPECTS } from '../core/constants'
import {
  backgroundAssetIds,
  createCamera,
  createDemoProject,
  createProject,
  normalizeProject,
  resolveTargetPosition,
  uid,
  uniqueCameraName,
} from '../core/defaults'
import { clamp, lookAtRotation } from '../core/math'
import { BUILTIN_LENS_TEMPLATES, parseLensTemplateFile } from '../core/lens'
import { createSceneObject, getObjectPreset, objectAimHeight, uniqueObjectName } from '../core/objects'
import { DEFAULT_AI_CONFIG, type AiConfig } from '../ai/types'
import { normalizeCameraSlots, previewSlotCount } from '../core/preview'
import {
  applyTimelineSnapshot,
  captureTimelineSnapshot,
  sampleTimeline,
  DEFAULT_TIMELINE_FRAMES,
  activeCameraIdAt,
  cameraCutAt,
  normalizeCameraCuts,
  sortCameraCuts,
} from '../core/timeline'
import {
  characterJson,
  createObjectFromCharacter,
  normalizeCustomCharacter,
  parseCharacterFile,
  uniqueCharacterName,
} from '../core/characters'
import { pickProjectFile, writeBlobToHandle } from '../storage/savePicker'
import { build180Equirect, prepareImage, unwrapLittlePlanet } from '../core/background'
import {
  deleteAsset,
  deleteProjectRecord,
  getAsset,
  getProjectRecord,
  getSetting,
  listProjects,
  putAsset,
  putProject,
  setSetting,
  type ProjectRecord,
} from '../storage/db'
import {
  buildProjectZip,
  downloadBlob,
  readProjectZip,
  sanitizeFileName,
  type ProjectAssetFile,
} from '../storage/projectFile'

export interface Toast {
  id: string
  text: string
  tone: 'info' | 'success' | 'error'
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

async function persistLensTemplates(list: LensTemplate[]): Promise<void> {
  try {
    await setSetting('lensTemplates', JSON.parse(JSON.stringify(list)))
  } catch (err) {
    console.error(err)
  }
}

async function persistCustomCharacters(list: CustomCharacter[]): Promise<void> {
  try {
    await setSetting('customCharacters', JSON.parse(JSON.stringify(list)))
  } catch (err) {
    console.error(err)
  }
}

let nudgeSaveTimer: number | null = null

interface AppState {
  booted: boolean
  view: 'start' | 'editor'
  project: Project | null
  history: ProjectRecord[]
  selectedCameraId: string | null
  selectedObjectId: string | null
  dirty: boolean
  lastSavedAt: number | null
  lastThumb: string | null
  autosaveMinutes: number
  saving: boolean
  toasts: Toast[]
  pickTargetFor: string | null
  nudgeStep: number
  lensTemplates: LensTemplate[]
  customCharacters: CustomCharacter[]
  agentEnabled: boolean
  agentUrl: string
  agentToken: string
  agentStatus: 'idle' | 'connecting' | 'online' | 'offline'
  aiConfig: AiConfig
  playheadFrame: number
  playing: boolean
  autoKey: boolean
  undoStack: Project[]
  redoStack: Project[]
  historyKey: string
  historyAt: number

  boot: () => Promise<void>
  refreshHistory: () => Promise<void>
  createNewProject: (name: string) => Promise<void>
  openProject: (id: string) => Promise<void>
  importProject: (file: File) => Promise<void>
  closeProject: () => Promise<void>
  update: (fn: (p: Project) => void, opts?: { dirty?: boolean }) => void
  selectCamera: (id: string | null) => void
  selectObject: (id: string | null) => void
  setTool: (tool: ToolId) => void
  addCamera: () => void
  removeCamera: (id: string) => void
  renameCamera: (id: string, name: string) => { ok: boolean; error?: string }
  patchCamera: (id: string, patch: Partial<CameraConfig>) => void
  addObject: (presetId: string) => void
  removeObject: (id: string) => void
  duplicateObject: (id: string) => void
  patchObject: (id: string, patch: Partial<SceneObject>) => void
  startTargetPick: (cameraId: string) => void
  cancelTargetPick: () => void
  completeTargetPick: (target: CameraTargetLock | null) => void
  setCameraTarget: (cameraId: string, target: CameraTargetLock) => void
  unlockCamera: (cameraId: string) => void
  setNudgeStep: (value: number) => Promise<void>
  applyLensTemplate: (cameraId: string, template: LensTemplate) => void
  saveLensTemplate: (name: string) => Promise<void>
  renameLensTemplate: (id: string, name: string) => Promise<void>
  deleteLensTemplate: (id: string) => Promise<void>
  exportLensTemplate: (id: string) => void
  importLensTemplates: (file: File) => Promise<void>
  saveCustomCharacter: (character: CustomCharacter) => Promise<CustomCharacter>
  applyCustomToObject: (objectId: string, customId: string) => void
  addCustomCharacter: (customId: string) => void
  deleteCustomCharacter: (customId: string) => Promise<void>
  exportCustomCharacter: (customId: string) => void
  importCustomCharacters: (file: File) => Promise<void>
  setAgentEnabled: (value: boolean) => Promise<void>
  setAgentStatus: (status: 'idle' | 'connecting' | 'online' | 'offline') => void
  setAiConfig: (config: AiConfig) => Promise<void>
  setPlayhead: (frame: number) => void
  setProgramCamera: (cameraId: string, frame?: number) => void
  removeCameraCut: (frame?: number) => void
  setPlaying: (playing: boolean) => void
  togglePlay: () => void
  stepFrames: (delta: number) => void
  addKeyframe: () => void
  removeKeyframe: (frame?: number) => void
  removeKeyframes: (frames: number[]) => void
  clearKeyframes: () => void
  setDurationFrames: (frames: number) => void
  setAutoKey: (value: boolean) => void
  checkpoint: (key?: string) => void
  undo: () => void
  redo: () => void
  setBackground: (background: BackgroundConfig) => void
  applyBackgroundFile: (file: File, kind: BackgroundUploadKind) => Promise<void>
  applyBoardFiles: (files: File[]) => Promise<void>
  updateBoardBackground: (patch: Partial<Pick<BoardBackground, 'fallbackColor' | 'curve' | 'feather'>>) => void
  updateBoardItem: (id: string, patch: Partial<BoardItem>) => void
  removeBoardItem: (id: string) => void
  setActiveBoardItem: (id: string | null) => void
  alignBoard: () => void
  setBoardLocked: (locked: boolean) => void
  sortBoardByName: () => void
  updateImageBackground: (patch: Partial<ImageBackground>) => void
  updatePanoBackground: (patch: Partial<PanoBackground>) => void
  resetBackground: () => Promise<void>
  setOutputAspect: (aspect: AspectId) => void
  setPreview: (patch: Partial<PreviewState>, opts?: { dirty?: boolean }) => void
  toggleStage: (key: 'grid' | 'whiteFloor' | 'shadows' | 'fog') => void
  setGridWidth: (width: number) => void
  setBackgroundInEditor: (value: boolean) => void
  setAutosaveMinutes: (minutes: number) => Promise<void>
  save: (opts?: { silent?: boolean; thumb?: string | null }) => Promise<void>
  exportProject: (thumb?: string | null) => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

function timelineFrame(project: Project, frame: number): number {
  return Math.max(0, Math.min(project.timeline.durationFrames, Math.round(frame)))
}

function writeKeyframe(project: Project, frame: number): number {
  const target = timelineFrame(project, frame)
  const snapshot = captureTimelineSnapshot(project) as unknown as Record<string, unknown>
  const existing = project.timeline.keyframes.find((keyframe) => keyframe.frame === target)
  if (existing) {
    existing.snapshot = snapshot
  } else {
    project.timeline.keyframes.push({ frame: target, snapshot })
    project.timeline.keyframes.sort((a, b) => a.frame - b.frame)
  }
  return target
}

function applyTimelineAt(project: Project, frame: number): void {
  const snapshot = sampleTimeline(project.timeline.keyframes, timelineFrame(project, frame))
  if (snapshot) applyTimelineSnapshot(project, snapshot)
}

/** 单画面预览跟随节目切镜；分屏布局保留每格自己的机位。 */
function syncProgramPreview(project: Project, frame: number): void {
  if (project.ui.preview.layout !== 'single') return
  const cameraId = activeCameraIdAt(project, frame)
  if (!cameraId) return
  project.ui.preview.cameraId = cameraId
  project.ui.preview.cameraIds = [cameraId]
}

function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project
}

function layoutBoard(items: BoardItem[], curve = 0): void {
  if (items.length === 0) return
  const heights = items.map((item) => {
    const aspect = (item.width || 16) / Math.max(1, item.height || 9)
    return item.plane.width / Math.max(0.1, aspect)
  })
  const total = items.reduce((sum, item) => sum + item.plane.width, 0)
  const arc = (Math.max(0, Math.min(360, curve)) * Math.PI) / 180

  if (arc > 0.01) {
    const radius = Math.max(2, total / arc)
    let cursor = -arc / 2
    items.forEach((item, index) => {
      const span = item.plane.width / radius
      const angle = cursor + span / 2
      item.plane.x = radius * Math.sin(angle)
      item.plane.z = -radius * Math.cos(angle)
      item.plane.y = heights[index] / 2
      item.yaw = (-angle * 180) / Math.PI
      cursor += span
    })
    return
  }

  let cursor = -total / 2
  items.forEach((item, index) => {
    item.plane.x = cursor + item.plane.width / 2
    item.plane.y = heights[index] / 2
    item.plane.z = item.plane.z || -8
    item.yaw = 0
    cursor += item.plane.width
  })
}

export const useStore = create<AppState>()(
  immer((set, get) => ({
    booted: false,
    view: 'start',
    project: null,
    history: [],
    selectedCameraId: null,
    selectedObjectId: null,
    dirty: false,
    lastSavedAt: null,
    lastThumb: null,
    autosaveMinutes: 10,
    saving: false,
    toasts: [],
    pickTargetFor: null,
    nudgeStep: 0.1,
    lensTemplates: [],
    customCharacters: [],
    agentEnabled: true,
    agentUrl: 'http://127.0.0.1:8787',
    agentToken: 'whitestage-local',
    agentStatus: 'idle',
    aiConfig: { ...DEFAULT_AI_CONFIG },
    playheadFrame: 0,
    playing: false,
    autoKey: false,
    undoStack: [],
    redoStack: [],
    historyKey: '',
    historyAt: 0,

    boot: async () => {
      try {
        const [
          minutes,
          step,
          storedTemplates,
          storedCharacters,
          storedAgentEnabled,
          storedAgentUrl,
          storedAgentToken,
          storedAiConfig,
        ] = await Promise.all([
          getSetting('autosaveMinutes', 10),
          getSetting('nudgeStep', 0.1),
          getSetting<LensTemplate[]>('lensTemplates', []),
          getSetting<CustomCharacter[]>('customCharacters', []),
          getSetting<boolean>('agentEnabled', true),
          getSetting<string>('agentUrl', 'http://127.0.0.1:8787'),
          getSetting<string>('agentToken', 'whitestage-local'),
          getSetting<AiConfig>('aiConfig', DEFAULT_AI_CONFIG),
        ])
        set((s) => {
          s.autosaveMinutes = clamp(Number(minutes) || 10, 1, 120)
          s.nudgeStep = clamp(Number(step) || 0.1, 0.01, 2)
          s.lensTemplates = Array.isArray(storedTemplates)
            ? storedTemplates
                .filter(
                  (t) =>
                    t &&
                    typeof t.id === 'string' &&
                    typeof t.name === 'string' &&
                    Number.isFinite(t.focal),
                )
                .map((t) => ({ ...t, builtin: false }))
            : []
          const characters = Array.isArray(storedCharacters)
            ? storedCharacters
                .map((item) => normalizeCustomCharacter(item))
                .filter((item): item is CustomCharacter => !!item)
            : []
          const usedCharacterIds = new Set<string>()
          s.customCharacters = characters.map((character) => {
            let id = character.id
            while (usedCharacterIds.has(id)) id = uid()
            usedCharacterIds.add(id)
            return id === character.id ? character : { ...character, id }
          })
          s.agentEnabled = storedAgentEnabled !== false
          s.agentUrl =
            typeof storedAgentUrl === 'string' && storedAgentUrl.trim()
              ? storedAgentUrl.trim()
              : 'http://127.0.0.1:8787'
          s.agentToken =
            typeof storedAgentToken === 'string' && storedAgentToken.trim()
              ? storedAgentToken.trim()
              : 'whitestage-local'
          const ai = storedAiConfig && typeof storedAiConfig === 'object' ? storedAiConfig : DEFAULT_AI_CONFIG
          s.aiConfig = {
            provider: ai.provider === 'custom' ? 'custom' : 'openai-compatible',
            baseUrl: typeof ai.baseUrl === 'string' ? ai.baseUrl : '',
            apiKey: typeof ai.apiKey === 'string' ? ai.apiKey : '',
            model: typeof ai.model === 'string' ? ai.model : '',
          }
        })
        await get().refreshHistory()

        const params = new URLSearchParams(window.location.search)
        if (params.get('demo') === '1') {
          const existing = await getProjectRecord('demo-project-m1c')
          if (!existing) {
            const demo = createDemoProject()
            await putProject({
              id: demo.id,
              name: demo.name,
              createdAt: demo.createdAt,
              updatedAt: demo.updatedAt,
              json: demo,
            })
          }
          await get().openProject('demo-project-m1c')
        }
      } catch (err) {
        console.error(err)
        get().toast('本地存储不可用：' + errorMessage(err), 'error')
      } finally {
        set((s) => {
          s.booted = true
        })
      }
    },

    refreshHistory: async () => {
      try {
        const list = await listProjects()
        set((s) => {
          s.history = list
        })
      } catch (err) {
        console.error(err)
      }
    },

    createNewProject: async (name) => {
      const project = createProject(name.trim() || '未命名项目')
      try {
        await putProject({
          id: project.id,
          name: project.name,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          json: project,
        })
      } catch (err) {
        get().toast('创建工程失败：' + errorMessage(err), 'error')
        return
      }
      set((s) => {
        s.project = project
        s.view = 'editor'
        s.dirty = false
        s.lastSavedAt = project.createdAt
        s.lastThumb = null
        s.pickTargetFor = null
        s.selectedCameraId = project.ui.preview.cameraId ?? project.cameras[0]?.id ?? null
        s.selectedObjectId = null
        s.playheadFrame = 0
        s.playing = false
        s.undoStack = []
        s.redoStack = []
        s.historyKey = ''
      })
      await get().refreshHistory()
    },

    openProject: async (id) => {
      try {
        const record = await getProjectRecord(id)
        if (!record) {
          get().toast('工程不存在或已被删除', 'error')
          return
        }
        const project = normalizeProject(record.json)
        let missingBackgroundAsset = false
        for (const assetId of backgroundAssetIds(project.background)) {
          const asset = await getAsset(assetId)
          if (!asset) {
            missingBackgroundAsset = true
            break
          }
        }
        if (missingBackgroundAsset) {
          project.background = { kind: 'solid', color: '#eef0f2', preset: 'white' }
        }
        set((s) => {
          s.project = project
          s.view = 'editor'
          s.dirty = false
          s.lastSavedAt = record.updatedAt
          s.lastThumb = record.thumb ?? null
          s.pickTargetFor = null
          s.selectedCameraId = project.ui.preview.cameraId ?? project.cameras[0]?.id ?? null
          s.selectedObjectId = null
          s.playheadFrame = 0
          s.playing = false
          s.undoStack = []
          s.redoStack = []
          s.historyKey = ''
          applyTimelineAt(project, 0)
          syncProgramPreview(project, 0)
        })
        if (missingBackgroundAsset) {
          get().toast('背景资源缺失，已恢复纯色背景', 'error')
        }
      } catch (err) {
        get().toast('打开工程失败：' + errorMessage(err), 'error')
      }
    },

    importProject: async (file) => {
      try {
        const { project, assets } = await readProjectZip(file)
        const existing = await getProjectRecord(project.id)
        if (existing) project.id = uid()
        project.updatedAt = Date.now()
        await putProject({
          id: project.id,
          name: project.name,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          json: project,
        })
        for (const asset of assets) {
          await putAsset({
            id: asset.id,
            projectId: project.id,
            name: asset.name,
            type: asset.type,
            blob: asset.blob,
          })
        }
        if (project.background.kind !== 'solid') {
          const missing = await Promise.all(
            backgroundAssetIds(project.background).map(async (assetId) => !(await getAsset(assetId))),
          )
          if (missing.some(Boolean)) {
            project.background = { kind: 'solid', color: '#eef0f2', preset: 'white' }
          }
        }
        set((s) => {
          s.project = project
          s.view = 'editor'
          s.dirty = false
          s.lastSavedAt = project.updatedAt
          s.lastThumb = null
          s.pickTargetFor = null
          s.selectedCameraId = project.ui.preview.cameraId ?? project.cameras[0]?.id ?? null
          s.selectedObjectId = null
          s.playheadFrame = 0
          s.playing = false
          s.undoStack = []
          s.redoStack = []
          s.historyKey = ''
          applyTimelineAt(project, 0)
          syncProgramPreview(project, 0)
        })
        get().toast('工程已导入', 'success')
        await get().refreshHistory()
      } catch (err) {
        get().toast('导入失败：' + errorMessage(err), 'error')
      }
    },

    closeProject: async () => {
      set((s) => {
        s.view = 'start'
        s.project = null
        s.selectedCameraId = null
        s.selectedObjectId = null
        s.pickTargetFor = null
        s.dirty = false
        s.playheadFrame = 0
        s.playing = false
        s.undoStack = []
        s.redoStack = []
        s.historyKey = ''
      })
      await get().refreshHistory()
    },

    update: (fn, opts) => {
      get().checkpoint()
      set((s) => {
        if (!s.project) return
        fn(s.project)
        s.project.updatedAt = Date.now()
        if (opts?.dirty !== false) s.dirty = true
      })
    },

    selectCamera: (id) => {
      set((s) => {
        s.selectedCameraId = id
        if (id) s.selectedObjectId = null
        if (id && s.project) s.project.ui.preview.cameraId = id
      })
    },

    selectObject: (id) => {
      set((s) => {
        s.selectedObjectId = id
        if (id) s.selectedCameraId = null
      })
    },

    setTool: (tool) => {
      set((s) => {
        if (s.project) s.project.ui.tool = tool
      })
    },

    addCamera: () => {
      get().checkpoint()
      set((s) => {
        const project = s.project
        if (!project) return
        const index = project.cameras.length
        const angle = (index / 4) * Math.PI * 2 + 0.6
        const position = {
          x: Math.cos(angle) * 6.2,
          y: 2.1 + (index % 2) * 0.45,
          z: Math.sin(angle) * 6.2,
        }
        const cam = createCamera(uniqueCameraName(project.cameras), position, 50)
        project.cameras.push(cam)
        const slots = previewSlotCount(project.ui.preview.layout, project.ui.preview.free)
        if (project.ui.preview.layout === 'single') {
          project.ui.preview.cameraIds = [cam.id]
        } else {
          project.ui.preview.cameraIds = [
            ...(project.ui.preview.cameraIds ?? []),
            cam.id,
          ].slice(0, slots)
        }
        project.ui.preview.cameraId = cam.id
        project.ui.preview.visible = true
        s.selectedCameraId = cam.id
        s.selectedObjectId = null
        s.dirty = true
      })
    },

    removeCamera: (id) => {
      get().checkpoint()
      set((s) => {
        const project = s.project
        if (!project) return
        for (const cam of project.cameras) {
          if (cam.targetLock?.kind === 'camera' && cam.targetLock.id === id) {
            cam.targetLock = null
          }
        }
        project.cameras = project.cameras.filter((c) => c.id !== id)
        const fallback = project.cameras[0]?.id ?? null
        const remaining = project.cameras.map((camera) => camera.id)
        project.timeline.cameraCuts = normalizeCameraCuts(
          project.timeline.cameraCuts.filter((cut) => cut.cameraId !== id),
          remaining,
          project.timeline.durationFrames,
          fallback,
        )
        project.ui.preview.cameraIds = normalizeCameraSlots(
          project.ui.preview.layout,
          (project.ui.preview.cameraIds ?? []).filter((cameraId) => cameraId !== id),
          remaining,
          project.ui.preview.cameraId === id ? fallback ?? undefined : project.ui.preview.cameraId ?? undefined,
          previewSlotCount(project.ui.preview.layout, project.ui.preview.free),
        )
        if (project.ui.preview.cameraId === id) project.ui.preview.cameraId = fallback
        if (s.selectedCameraId === id) s.selectedCameraId = fallback
        if (s.pickTargetFor === id) s.pickTargetFor = null
        s.dirty = true
      })
    },

    renameCamera: (id, name) => {
      const project = get().project
      const camera = project?.cameras.find((c) => c.id === id)
      if (!project || !camera) return { ok: false, error: '机位不存在' }
      const trimmed = name.trim()
      if (!trimmed) return { ok: false, error: '名称不能为空' }
      if (trimmed.length > 30) return { ok: false, error: '名称最多 30 个字符' }
      const key = trimmed.toLocaleLowerCase()
      if (
        project.cameras.some(
          (c) => c.id !== id && c.name.trim().toLocaleLowerCase() === key,
        )
      ) {
        return { ok: false, error: '已经有同名机位，请换一个名称' }
      }
      if (camera.name === trimmed) return { ok: true }
      get().checkpoint()
      set((s) => {
        const target = s.project?.cameras.find((c) => c.id === id)
        if (target) {
          target.name = trimmed
          s.dirty = true
        }
      })
      return { ok: true }
    },

    patchCamera: (id, patch) => {
      get().checkpoint(`camera:${id}`)
      set((s) => {
        const project = s.project
        if (!project) return
        const cam = project.cameras.find((c) => c.id === id)
        if (!cam) return
        Object.assign(cam, patch)
        if (
          'focal' in patch ||
          'sensor' in patch ||
          'aperture' in patch ||
          'focusDistance' in patch ||
          'dof' in patch
        ) {
          cam.lensTemplateId = null
        }
        cam.position.y = Math.max(0.02, cam.position.y)
        if (cam.targetLock) {
          const target = resolveTargetPosition(project, cam.targetLock, cam.id)
          if (target) cam.rotation = lookAtRotation(cam.position, target)
        } else {
          cam.rotation.x = clamp(cam.rotation.x, -89.5, 89.5)
        }
        // 被别的机位锁定为目标时，同步更新那些机位的朝向
        for (const other of project.cameras) {
          if (other.id === cam.id) continue
          if (other.targetLock?.kind === 'camera' && other.targetLock.id === cam.id) {
            const target = resolveTargetPosition(project, other.targetLock, other.id)
            if (target) other.rotation = lookAtRotation(other.position, target)
          }
        }
        s.dirty = true
        if (s.autoKey) writeKeyframe(project, s.playheadFrame)
      })
    },

    addObject: (presetId) => {
      get().checkpoint()
      set((s) => {
        const project = s.project
        if (!project) return
        const object = createSceneObject(presetId, project.objects)
        project.objects.push(object)
        s.selectedObjectId = object.id
        s.selectedCameraId = null
        s.dirty = true
      })
      get().toast('已添加对象', 'success')
    },

    removeObject: (id) => {
      get().checkpoint()
      set((s) => {
        const project = s.project
        if (!project) return
        for (const camera of project.cameras) {
          if (camera.targetLock?.kind === 'object' && camera.targetLock.id === id) {
            camera.targetLock = null
          }
        }
        project.objects = project.objects.filter((object) => object.id !== id)
        if (s.selectedObjectId === id) s.selectedObjectId = null
        s.dirty = true
      })
      get().toast('已删除对象', 'success')
    },

    duplicateObject: (id) => {
      get().checkpoint()
      set((s) => {
        const project = s.project
        const source = project?.objects.find((object) => object.id === id)
        if (!project || !source) return
        const preset = getObjectPreset(source.variant)
        project.objects.push({
          ...source,
          id: uid(),
          name: uniqueObjectName(project.objects, preset.label),
          position: { ...source.position, x: source.position.x + 0.8 },
          homePosition: { ...source.position, x: source.position.x + 0.8 },
          rotation: { ...source.rotation },
          scale: { ...source.scale },
        })
        const copy = project.objects[project.objects.length - 1]
        s.selectedObjectId = copy.id
        s.selectedCameraId = null
        s.dirty = true
      })
      get().toast('已复制对象', 'success')
    },

    patchObject: (id, patch) => {
      get().checkpoint(`object:${id}`)
      set((s) => {
        const project = s.project
        const object = project?.objects.find((item) => item.id === id)
        if (!project || !object) return
        Object.assign(object, patch)
        if (!object.allowUnderground) object.position.y = Math.max(0, object.position.y)
        const clampScale = (value: number) =>
          Math.min(1000, Math.max(0.01, Number(value) || 1))
        object.scale.x = clampScale(object.scale.x)
        object.scale.y = clampScale(object.scale.y)
        object.scale.z = clampScale(object.scale.z)
        object.aimHeight = objectAimHeight(object)
        for (const camera of project.cameras) {
          if (camera.targetLock?.kind === 'object' && camera.targetLock.id === id) {
            const target = resolveTargetPosition(project, camera.targetLock, camera.id)
            if (target) camera.rotation = lookAtRotation(camera.position, target)
          }
        }
        s.dirty = true
        if (s.autoKey) writeKeyframe(project, s.playheadFrame)
      })
    },

    startTargetPick: (cameraId) => {
      set((s) => {
        if (!s.project) return
        s.pickTargetFor = cameraId
        s.selectedCameraId = cameraId
        s.selectedObjectId = null
        s.project.ui.preview.cameraId = cameraId
      })
    },

    cancelTargetPick: () => {
      set((s) => {
        s.pickTargetFor = null
      })
    },

    completeTargetPick: (target) => {
      const { pickTargetFor } = get()
      if (!pickTargetFor) return
      set((s) => {
        s.pickTargetFor = null
      })
      if (!target) {
        get().toast('没有选中目标', 'info')
        return
      }
      get().setCameraTarget(pickTargetFor, target)
    },

    setCameraTarget: (cameraId, target) => {
      if (target.kind === 'camera' && target.id === cameraId) {
        get().toast('不能把机位锁定到它自己', 'error')
        return
      }
      const project = get().project
      if (!project) return
      if (target.kind === 'object' && !project.objects.some((object) => object.id === target.id)) {
        get().toast('目标对象已不存在', 'error')
        return
      }
      get().checkpoint(`target:${cameraId}`)
      set((s) => {
        const current = s.project
        if (!current) return
        const cam = current.cameras.find((c) => c.id === cameraId)
        if (!cam) return
        cam.targetLock = target
        const position = resolveTargetPosition(current, target, cameraId)
        if (position) cam.rotation = lookAtRotation(cam.position, position)
        s.dirty = true
      })
      get().toast('已锁定目标', 'success')
    },

    unlockCamera: (cameraId) => {
      get().checkpoint(`target:${cameraId}`)
      set((s) => {
        const cam = s.project?.cameras.find((c) => c.id === cameraId)
        if (!cam) return
        cam.targetLock = null
        s.dirty = true
      })
      get().toast('已取消目标锁定', 'success')
    },

    setNudgeStep: async (value) => {
      const step = clamp(Number(value) || 0.1, 0.01, 2)
      set((s) => {
        s.nudgeStep = step
      })
      if (nudgeSaveTimer) window.clearTimeout(nudgeSaveTimer)
      nudgeSaveTimer = window.setTimeout(() => {
        void setSetting('nudgeStep', step).catch(() => {})
      }, 300)
    },

    applyLensTemplate: (cameraId, template) => {
      get().checkpoint(`camera:${cameraId}`)
      set((s) => {
        const cam = s.project?.cameras.find((c) => c.id === cameraId)
        if (!cam) return
        cam.focal = template.focal
        cam.sensor = template.sensor
        cam.aperture = template.aperture
        cam.focusDistance = template.focusDistance
        cam.dof = template.dof
        cam.lensTemplateId = template.id
        s.dirty = true
      })
      get().toast(`已应用「${template.name}」`, 'success')
    },

    saveLensTemplate: async (name) => {
      const { project, selectedCameraId, lensTemplates } = get()
      const camera = project?.cameras.find((c) => c.id === selectedCameraId)
      if (!camera) {
        get().toast('请先选择一个机位', 'error')
        return
      }
      const template: LensTemplate = {
        id: uid(),
        name: (name.trim() || `我的镜头 ${lensTemplates.length + 1}`).slice(0, 40),
        builtin: false,
        focal: camera.focal,
        sensor: camera.sensor,
        aperture: camera.aperture,
        focusDistance: camera.focusDistance,
        dof: camera.dof,
      }
      set((s) => {
        s.lensTemplates.push(template)
      })
      const cameraId = get().selectedCameraId
      if (cameraId) {
        set((s) => {
          const cam = s.project?.cameras.find((c) => c.id === cameraId)
          if (cam) {
            cam.lensTemplateId = template.id
            s.dirty = true
          }
        })
      }
      await persistLensTemplates(get().lensTemplates)
      get().toast(`已保存模板「${template.name}」`, 'success')
    },

    renameLensTemplate: async (id, name) => {
      const target = get().lensTemplates.find((t) => t.id === id)
      if (!target) return
      const nextName = (name.trim() || target.name).slice(0, 40)
      set((s) => {
        const template = s.lensTemplates.find((t) => t.id === id)
        if (template) template.name = nextName
      })
      await persistLensTemplates(get().lensTemplates)
      get().toast('镜头模板已重命名', 'success')
    },

    deleteLensTemplate: async (id) => {
      const target = get().lensTemplates.find((t) => t.id === id)
      if (!target) return
      set((s) => {
        s.lensTemplates = s.lensTemplates.filter((t) => t.id !== id)
        if (s.project) {
          for (const cam of s.project.cameras) {
            if (cam.lensTemplateId === id) {
              cam.lensTemplateId = null
              s.dirty = true
            }
          }
        }
      })
      await persistLensTemplates(get().lensTemplates)
      get().toast(`已删除模板「${target.name}」`, 'success')
    },

    exportLensTemplate: (id) => {
      const template = [...BUILTIN_LENS_TEMPLATES, ...get().lensTemplates].find((t) => t.id === id)
      if (!template) return
      const payload = {
        app: 'WhiteStage',
        type: 'lens-template',
        version: 1,
        exportedAt: new Date().toISOString(),
        templates: [
          {
            name: template.name,
            focal: template.focal,
            sensor: template.sensor,
            aperture: template.aperture,
            focusDistance: template.focusDistance,
            dof: template.dof,
          },
        ],
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `${sanitizeFileName(template.name)}.lens.json`)
      get().toast('镜头模板已导出', 'success')
    },

    importLensTemplates: async (file) => {
      try {
        const text = await file.text()
        let raw: unknown
        try {
          raw = JSON.parse(text)
        } catch {
          throw new Error('文件不是合法 JSON')
        }
        const parsed = parseLensTemplateFile(raw)
        if (parsed.length === 0) throw new Error('没有找到可用的镜头参数')
        const created = parsed.map((template) => ({ ...template, id: uid(), builtin: false }))
        set((s) => {
          s.lensTemplates.push(...created)
        })
        await persistLensTemplates(get().lensTemplates)
        const cameraId = get().selectedCameraId
        if (cameraId) get().applyLensTemplate(cameraId, created[0])
        get().toast(`已导入 ${created.length} 个镜头模板`, 'success')
      } catch (err) {
        get().toast('导入镜头模板失败：' + errorMessage(err), 'error')
      }
    },

    saveCustomCharacter: async (character) => {
      const normalized = normalizeCustomCharacter(character)
      if (!normalized) throw new Error('角色数据无效')
      const existing = get().customCharacters
      normalized.name = uniqueCharacterName(existing, normalized.name)
      if (existing.some((item) => item.id === normalized.id)) normalized.id = uid()
      normalized.createdAt = Date.now()
      set((s) => {
        s.customCharacters.push(normalized)
      })
      await persistCustomCharacters(get().customCharacters)
      get().toast(`已保存角色「${normalized.name}」`, 'success')
      return normalized
    },

    applyCustomToObject: (objectId, customId) => {
      get().checkpoint(`object:${objectId}`)
      set((s) => {
        const project = s.project
        const custom = s.customCharacters.find((item) => item.id === customId)
        const object = project?.objects.find((item) => item.id === objectId)
        if (!project || !custom || !object || object.kind !== 'mannequin') return
        object.customId = custom.id
        object.variant = custom.baseVariant
        object.category = 'mannequin'
        object.height = custom.height
        object.color = custom.color
        object.skinColor = custom.skinColor
        object.shoeColor = custom.shoeColor
        object.faceDetail = custom.faceDetail
        object.joints = JSON.parse(JSON.stringify(custom.joints))
        object.bodyOffset = { ...custom.bodyOffset }
        object.bodyRotation = { ...custom.bodyRotation }
        object.weapon = custom.weapon ? JSON.parse(JSON.stringify(custom.weapon)) : null
        object.pose = 'stand'
        object.aimHeight = objectAimHeight({
          kind: 'mannequin',
          variant: custom.baseVariant,
          height: custom.height,
        })
        s.dirty = true
      })
    },

    addCustomCharacter: (customId) => {
      get().checkpoint()
      set((s) => {
        const project = s.project
        const custom = s.customCharacters.find((item) => item.id === customId)
        if (!project || !custom) return
        const object = createObjectFromCharacter(custom, project.objects)
        project.objects.push(object)
        s.selectedObjectId = object.id
        s.selectedCameraId = null
        s.dirty = true
      })
      get().toast('已添加自定义角色', 'success')
    },

    deleteCustomCharacter: async (customId) => {
      set((s) => {
        s.customCharacters = s.customCharacters.filter((item) => item.id !== customId)
        if (s.project) {
          for (const object of s.project.objects) {
            if (object.customId === customId) object.customId = null
          }
        }
      })
      await persistCustomCharacters(get().customCharacters)
      get().toast('已删除自定义角色', 'success')
    },

    exportCustomCharacter: (customId) => {
      const character = get().customCharacters.find((item) => item.id === customId)
      if (!character) return
      const blob = new Blob([characterJson(character)], { type: 'application/json' })
      downloadBlob(blob, `${sanitizeFileName(character.name)}.wsc.json`)
      get().toast('自定义角色已导出', 'success')
    },

    importCustomCharacters: async (file) => {
      try {
        const text = await file.text()
        const parsed = parseCharacterFile(text)
        const existing = get().customCharacters
        const next = [...existing]
        for (const character of parsed) {
          const normalized = normalizeCustomCharacter(character)
          if (!normalized) continue
          normalized.id = next.some((item) => item.id === normalized.id) ? uid() : normalized.id
          normalized.name = uniqueCharacterName(next, normalized.name)
          next.push(normalized)
        }
        set((s) => {
          s.customCharacters = next
        })
        await persistCustomCharacters(next)
        get().toast(`已导入 ${parsed.length} 个自定义角色`, 'success')
      } catch (err) {
        get().toast('导入自定义角色失败：' + errorMessage(err), 'error')
      }
    },

    setBackground: (background) => {
      get().checkpoint()
      set((s) => {
        if (!s.project) return
        s.project.background = background
        s.dirty = true
      })
    },

    applyBackgroundFile: async (file, kind) => {
      const project = get().project
      if (!project) return
      try {
        const prepared = await prepareImage(file)
        let blob = prepared.blob
        let width = prepared.width
        let height = prepared.height
        let preview = prepared.preview

        if (kind === 'pano-180') {
          const pano = await build180Equirect(prepared.blob, prepared.width, prepared.height)
          blob = pano.blob
          width = pano.width
          height = pano.height
          preview = pano.preview
        } else if (kind === 'planet-360') {
          const pano = await unwrapLittlePlanet(prepared.blob)
          blob = pano.blob
          width = pano.width
          height = pano.height
          preview = pano.preview
        }

        const assetId = uid()
        await putAsset({
          id: assetId,
          projectId: project.id,
          name: file.name,
          type: blob.type || 'image/jpeg',
          blob,
        })

        let config: BackgroundConfig
        if (kind === 'image-screen' || kind === 'image-plane') {
          config = {
            kind: 'image',
            assetId,
            mode: kind === 'image-plane' ? 'plane' : 'screen',
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            rotation: 0,
            plane: { x: 0, y: 3, z: -8, width: 12 },
            fallbackColor: '#0e1013',
            name: file.name,
            width: prepared.width,
            height: prepared.height,
            preview: prepared.preview,
          }
        } else {
          config = {
            kind: 'pano',
            assetId,
            projection: kind === 'pano-180' ? '180' : '360',
            yaw: 0,
            pitch: 0,
            roll: 0,
            source: kind === 'planet-360' ? 'littleplanet' : 'equirect',
            name: file.name,
            width,
            height,
            preview,
          }
        }

        get().checkpoint()
        set((s) => {
          if (!s.project) return
          s.project.background = config
          if (
            s.project.ui.backgroundInEditor &&
            (kind === 'pano-180' ||
              kind === 'pano-360' ||
              kind === 'planet-360' ||
              kind === 'image-screen')
          ) {
            s.project.stage.grid = false
          }
          s.dirty = true
        })
        await get().save({ silent: true })
        get().toast(
          kind === 'planet-360'
            ? '星球全景已近似展开为 360° 背景'
            : kind === 'pano-180'
              ? '180° 全景背景已应用'
              : '背景图片已应用',
          'success',
        )
      } catch (err) {
        get().toast('背景处理失败：' + errorMessage(err), 'error')
        throw err
      }
    },

    updateImageBackground: (patch) => {
      get().checkpoint('image-background')
      set((s) => {
        const background = s.project?.background
        if (!background || background.kind !== 'image') return
        Object.assign(background, patch)
        s.dirty = true
      })
    },

    applyBoardFiles: async (files) => {
      const project = get().project
      if (!project) return
      if (project.background.kind === 'board' && project.background.locked) {
        get().toast('背景板已锁定，请先解锁', 'error')
        return
      }
      const images = files.filter((file) => file.type.startsWith('image/'))
      if (images.length === 0) {
        get().toast('请选择图片文件', 'error')
        return
      }
      try {
        const items: BoardItem[] = []
        for (const file of images) {
          const prepared = await prepareImage(file)
          const assetId = uid()
          await putAsset({
            id: assetId,
            projectId: project.id,
            name: file.name,
            type: prepared.blob.type || 'image/jpeg',
            blob: prepared.blob,
          })
          items.push({
            id: uid(),
            assetId,
            name: file.name,
            width: prepared.width,
            height: prepared.height,
            preview: prepared.preview,
            plane: { x: 0, y: 0, z: -8, width: 4 },
            rotation: 0,
            yaw: 0,
          })
        }
        layoutBoard(items)
        get().checkpoint('board-files')
        set((s) => {
          if (!s.project) return
          s.project.background = {
            kind: 'board',
            items,
            activeId: items[0]?.id ?? null,
            fallbackColor: '#0e1013',
            curve: 0,
            feather: 0,
            locked: false,
          }
          s.project.stage.grid = false
          s.dirty = true
        })
        await get().save({ silent: true })
        get().toast(`已创建 ${items.length} 张图的背景板`, 'success')
      } catch (err) {
        get().toast('背景板处理失败：' + errorMessage(err), 'error')
      }
    },

    updateBoardBackground: (patch) => {
      const background = get().project?.background
      if (!background || background.kind !== 'board' || background.locked) return
      get().checkpoint('board-background')
      set((s) => {
        const current = s.project?.background
        if (!current || current.kind !== 'board' || current.locked) return
        const previousCurve = current.curve
        Object.assign(current, patch)
        current.curve = Math.max(0, Math.min(360, Number(current.curve) || 0))
        current.feather = Math.max(0, Math.min(0.4, Number(current.feather) || 0))
        if (current.curve !== previousCurve) {
          layoutBoard(current.items, current.curve)
        }
        s.dirty = true
      })
    },

    updateBoardItem: (id, patch) => {
      const background = get().project?.background
      if (!background || background.kind !== 'board' || background.locked) return
      get().checkpoint(`board:${id}`)
      set((s) => {
        const current = s.project?.background
        if (!current || current.kind !== 'board' || current.locked) return
        const item = current.items.find((entry) => entry.id === id)
        if (!item) return
        if (patch.plane) {
          item.plane = { ...item.plane, ...patch.plane }
          item.plane.width = Math.max(0.5, Math.min(40, Number(item.plane.width) || 4))
        }
        if (typeof patch.rotation === 'number') item.rotation = patch.rotation
        if (patch.name !== undefined) item.name = patch.name
        s.dirty = true
      })
    },

    removeBoardItem: (id) => {
      const background = get().project?.background
      if (!background || background.kind !== 'board' || background.locked) return
      get().checkpoint()
      set((s) => {
        const current = s.project?.background
        if (!current || current.kind !== 'board' || current.locked) return
        current.items = current.items.filter((item) => item.id !== id)
        if (current.activeId === id) current.activeId = current.items[0]?.id ?? null
        s.dirty = true
      })
    },

    setActiveBoardItem: (id) => {
      set((s) => {
        const background = s.project?.background
        if (!background || background.kind !== 'board') return
        background.activeId = id
      })
    },

    alignBoard: () => {
      const background = get().project?.background
      if (!background || background.kind !== 'board' || background.locked) return
      get().checkpoint('board-align')
      set((s) => {
        const current = s.project?.background
        if (!current || current.kind !== 'board' || current.locked) return
        layoutBoard(current.items, current.curve)
        s.dirty = true
      })
      get().toast('背景板已按宽度重新拼接', 'success')
    },

    setBoardLocked: (locked) => {
      get().checkpoint('board-lock')
      set((s) => {
        const background = s.project?.background
        if (!background || background.kind !== 'board') return
        background.locked = locked
        s.dirty = true
      })
      get().toast(locked ? '背景板已锁定' : '背景板已解锁', 'success')
    },

    sortBoardByName: () => {
      const background = get().project?.background
      if (!background || background.kind !== 'board' || background.locked) return
      get().checkpoint('board-sort')
      set((s) => {
        const current = s.project?.background
        if (!current || current.kind !== 'board' || current.locked) return
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
        current.items.sort((a, b) => collator.compare(a.name ?? '', b.name ?? ''))
        current.activeId = current.items[0]?.id ?? null
        layoutBoard(current.items, current.curve)
        s.dirty = true
      })
      get().toast('已按文件名序号排序', 'success')
    },

    updatePanoBackground: (patch) => {
      get().checkpoint('pano-background')
      set((s) => {
        const background = s.project?.background
        if (!background || background.kind !== 'pano') return
        Object.assign(background, patch)
        s.dirty = true
      })
    },

    resetBackground: async () => {
      get().checkpoint()
      const background = get().project?.background
      if (!background) return
      set((s) => {
        if (!s.project) return
        s.project.background = { kind: 'solid', color: '#eef0f2', preset: 'white' }
        s.dirty = true
      })
      await get().save({ silent: true })
      get().toast('已恢复纯色背景', 'success')
    },

    setOutputAspect: (aspect) => {
      get().checkpoint('output-aspect')
      set((s) => {
        if (!s.project) return
        const a = ASPECTS[aspect]
        s.project.output.aspect = aspect
        s.project.output.width = a.width
        s.project.output.height = a.height
        s.dirty = true
      })
    },

    setPreview: (patch, opts) => {
      set((s) => {
        if (!s.project) return
        Object.assign(s.project.ui.preview, patch)
        if (opts?.dirty !== false) s.dirty = true
      })
    },

    toggleStage: (key) => {
      get().checkpoint(`stage:${key}`)
      set((s) => {
        if (!s.project) return
        s.project.stage[key] = !s.project.stage[key]
        s.dirty = true
      })
    },

    setGridWidth: (width) => {
      get().checkpoint('grid-width')
      set((s) => {
        if (!s.project) return
        s.project.stage.gridWidth = clamp(width, 1, 8)
        s.dirty = true
      })
    },

    setBackgroundInEditor: (value) => {
      get().checkpoint('background-editor')
      set((s) => {
        if (!s.project) return
        s.project.ui.backgroundInEditor = value
        if (!value && !s.project.stage.grid) s.project.stage.grid = true
        s.dirty = true
      })
    },

    setAgentEnabled: async (value) => {
      set((s) => {
        s.agentEnabled = value
      })
      await setSetting('agentEnabled', value).catch(() => {})
    },

    setAgentStatus: (status) => {
      set((s) => {
        s.agentStatus = status
      })
    },

    setAiConfig: async (config) => {
      set((s) => {
        s.aiConfig = {
          provider: config.provider === 'custom' ? 'custom' : 'openai-compatible',
          baseUrl: config.baseUrl.trim(),
          apiKey: config.apiKey,
          model: config.model.trim(),
        }
      })
      await setSetting('aiConfig', get().aiConfig).catch(() => {})
    },

    setPlayhead: (frame) => {
      set((s) => {
        if (!s.project) return
        s.playheadFrame = timelineFrame(s.project, frame)
        applyTimelineAt(s.project, s.playheadFrame)
        syncProgramPreview(s.project, s.playheadFrame)
      })
    },

    setProgramCamera: (cameraId, frame) => {
      const project = get().project
      const camera = project?.cameras.find((item) => item.id === cameraId)
      if (!project || !camera) return
      get().checkpoint('camera-cut')
      set((s) => {
        if (!s.project) return
        const targetFrame = timelineFrame(s.project, frame ?? s.playheadFrame)
        const cuts = s.project.timeline.cameraCuts
        const existing = cameraCutAt(cuts, targetFrame)
        if (existing) {
          existing.cameraId = cameraId
        } else {
          if (cuts.length === 0 && targetFrame > 0) {
            const baseCamera = activeCameraIdAt(s.project, 0) ?? cameraId
            cuts.push({ id: uid(), frame: 0, cameraId: baseCamera })
          }
          cuts.push({ id: uid(), frame: targetFrame, cameraId })
        }
        s.project.timeline.cameraCuts = sortCameraCuts(cuts)
        s.selectedCameraId = cameraId
        s.selectedObjectId = null
        syncProgramPreview(s.project, s.playheadFrame)
        s.dirty = true
      })
      get().toast(
        `第 ${timelineFrame(project, frame ?? get().playheadFrame)} 帧切到「${camera.name}」`,
        'success',
      )
    },

    removeCameraCut: (frame) => {
      const project = get().project
      if (!project) return
      const targetFrame = timelineFrame(project, frame ?? get().playheadFrame)
      const existed = project.timeline.cameraCuts.some((cut) => cut.frame === targetFrame)
      if (!existed) return
      get().checkpoint('camera-cut')
      set((s) => {
        if (!s.project) return
        s.project.timeline.cameraCuts = s.project.timeline.cameraCuts.filter(
          (cut) => cut.frame !== targetFrame,
        )
        s.project.timeline.cameraCuts = normalizeCameraCuts(
          s.project.timeline.cameraCuts,
          s.project.cameras.map((camera) => camera.id),
          s.project.timeline.durationFrames,
          s.project.ui.preview.cameraId,
        )
        syncProgramPreview(s.project, s.playheadFrame)
        s.dirty = true
      })
      get().toast(`已删除第 ${targetFrame} 帧切镜`, 'success')
    },

    setPlaying: (playing) => {
      set((s) => {
        s.playing = playing
      })
    },

    togglePlay: () => {
      set((s) => {
        s.playing = !s.playing
      })
    },

    stepFrames: (delta) => {
      get().setPlayhead(get().playheadFrame + delta)
    },

    addKeyframe: () => {
      get().checkpoint('keyframe')
      set((s) => {
        if (!s.project) return
        const frame = writeKeyframe(s.project, s.playheadFrame)
        s.playheadFrame = frame
        s.dirty = true
      })
      get().toast('已记录关键帧', 'success')
    },

    removeKeyframe: (frame) => {
      get().checkpoint('keyframe')
      set((s) => {
        if (!s.project) return
        const target = frame ?? s.playheadFrame
        s.project.timeline.keyframes = s.project.timeline.keyframes.filter(
          (keyframe) => keyframe.frame !== target,
        )
        s.dirty = true
        applyTimelineAt(s.project, s.playheadFrame)
      })
      get().toast('已删除该帧关键帧', 'success')
    },

    removeKeyframes: (frames) => {
      const unique = [...new Set(frames.map((frame) => Math.round(frame)))]
      if (unique.length === 0) return
      const targets = new Set(unique)
      get().checkpoint('keyframe')
      set((s) => {
        if (!s.project) return
        s.project.timeline.keyframes = s.project.timeline.keyframes.filter(
          (keyframe) => !targets.has(keyframe.frame),
        )
        s.dirty = true
        applyTimelineAt(s.project, s.playheadFrame)
      })
      get().toast(`已删除 ${unique.length} 个关键帧`, 'success')
    },

    clearKeyframes: () => {
      get().checkpoint('keyframe-clear')
      set((s) => {
        if (!s.project) return
        s.project.timeline.keyframes = []
        s.dirty = true
      })
      get().toast('已清空时间线关键帧', 'success')
    },

    setDurationFrames: (frames) => {
      get().checkpoint('timeline-duration')
      set((s) => {
        if (!s.project) return
        const value = Math.max(12, Math.min(3600, Math.round(frames) || DEFAULT_TIMELINE_FRAMES))
        s.project.timeline.durationFrames = value
        s.project.timeline.cameraCuts = normalizeCameraCuts(
          s.project.timeline.cameraCuts,
          s.project.cameras.map((camera) => camera.id),
          value,
          s.project.ui.preview.cameraId,
        )
        s.playheadFrame = Math.min(s.playheadFrame, value)
        syncProgramPreview(s.project, s.playheadFrame)
        s.dirty = true
      })
    },

    setAutoKey: (value) => {
      set((s) => {
        s.autoKey = value
      })
    },

    checkpoint: (key = '') => {
      const project = get().project
      if (!project) return
      const now = Date.now()
      if (key && key === get().historyKey && now - get().historyAt < 700) {
        set((s) => {
          s.historyAt = now
        })
        return
      }
      const snapshot = cloneProject(project)
      set((s) => {
        s.undoStack.push(snapshot)
        if (s.undoStack.length > 30) s.undoStack.shift()
        s.redoStack = []
        s.historyKey = key
        s.historyAt = now
      })
    },

    undo: () => {
      const current = get().project
      const previous = get().undoStack[get().undoStack.length - 1]
      if (!current || !previous) {
        get().toast('没有可撤销的操作', 'info')
        return
      }
      const snapshot = cloneProject(current)
      set((s) => {
        s.undoStack.pop()
        s.redoStack.push(snapshot)
        s.project = previous
        s.dirty = true
        s.playing = false
        s.playheadFrame = Math.min(
          previous.timeline.durationFrames,
          Math.max(0, s.playheadFrame),
        )
        s.historyKey = ''
        if (s.selectedCameraId && !previous.cameras.some((c) => c.id === s.selectedCameraId)) {
          s.selectedCameraId = previous.ui.preview.cameraId ?? previous.cameras[0]?.id ?? null
        }
        if (s.selectedObjectId && !previous.objects.some((o) => o.id === s.selectedObjectId)) {
          s.selectedObjectId = null
        }
      })
      get().toast('已撤销', 'success')
    },

    redo: () => {
      const current = get().project
      const next = get().redoStack[get().redoStack.length - 1]
      if (!current || !next) {
        get().toast('没有可重做的操作', 'info')
        return
      }
      const snapshot = cloneProject(current)
      set((s) => {
        s.redoStack.pop()
        s.undoStack.push(snapshot)
        s.project = next
        s.dirty = true
        s.playing = false
        s.playheadFrame = Math.min(next.timeline.durationFrames, Math.max(0, s.playheadFrame))
        s.historyKey = ''
        if (s.selectedCameraId && !next.cameras.some((c) => c.id === s.selectedCameraId)) {
          s.selectedCameraId = next.ui.preview.cameraId ?? next.cameras[0]?.id ?? null
        }
        if (s.selectedObjectId && !next.objects.some((o) => o.id === s.selectedObjectId)) {
          s.selectedObjectId = null
        }
      })
      get().toast('已重做', 'success')
    },

    setAutosaveMinutes: async (minutes) => {
      const value = clamp(Math.round(minutes) || 10, 1, 120)
      set((s) => {
        s.autosaveMinutes = value
      })
      try {
        await setSetting('autosaveMinutes', value)
      } catch (err) {
        console.error(err)
      }
      get().toast(`自动保存间隔已设为每 ${value} 分钟`, 'success')
    },

    save: async (opts) => {
      const { project, saving } = get()
      if (!project || saving) return
      set((s) => {
        s.saving = true
      })
      try {
        const clone = JSON.parse(JSON.stringify(project)) as Project
        clone.updatedAt = Date.now()
        const thumb = opts?.thumb ?? get().lastThumb ?? undefined
        await putProject({
          id: clone.id,
          name: clone.name,
          createdAt: clone.createdAt,
          updatedAt: clone.updatedAt,
          json: clone,
          thumb: thumb || undefined,
        })
        set((s) => {
          s.dirty = false
          s.lastSavedAt = clone.updatedAt
          if (opts?.thumb) s.lastThumb = opts.thumb
          s.saving = false
        })
        if (!opts?.silent) get().toast('项目已保存', 'success')
      } catch (err) {
        set((s) => {
          s.saving = false
        })
        get().toast('保存失败：' + errorMessage(err), 'error')
      }
    },

    exportProject: async (thumb) => {
      const { project } = get()
      if (!project) return
      try {
        const useThumb = thumb ?? get().lastThumb
        const fileName = `${sanitizeFileName(project.name)}.wsp`
        const picked = await pickProjectFile(fileName)
        if (picked.status === 'cancelled') {
          get().toast('已取消导出', 'info')
          return
        }
        const assets: ProjectAssetFile[] = []
        for (const assetId of backgroundAssetIds(project.background)) {
          const asset = await getAsset(assetId)
          if (asset) {
            assets.push({
              id: asset.id,
              name: asset.name,
              type: asset.type,
              data: new Uint8Array(await asset.blob.arrayBuffer()),
            })
          }
        }
        const blob = buildProjectZip(project, useThumb ?? undefined, assets)
        if (picked.status === 'picked') {
          try {
            await writeBlobToHandle(picked.handle, blob)
            get().toast(`工程文件已保存：${picked.handle.name}`, 'success')
            return
          } catch (err) {
            get().toast(
              '写入所选文件失败，改为浏览器下载：' + errorMessage(err),
              'error',
            )
          }
        }
        downloadBlob(blob, fileName)
        get().toast('工程文件已下载（.wsp）', 'success')
      } catch (err) {
        get().toast('导出工程失败：' + errorMessage(err), 'error')
      }
    },

    deleteHistory: async (id) => {
      try {
        await deleteProjectRecord(id)
        await get().refreshHistory()
        get().toast('历史记录已删除', 'success')
      } catch (err) {
        get().toast('删除失败：' + errorMessage(err), 'error')
      }
    },

    toast: (text, tone = 'info') => {
      const id = uid()
      set((s) => {
        s.toasts = s.toasts
          .filter((toast) => !(toast.text === text && toast.tone === tone))
          .slice(-2)
        s.toasts.push({ id, text, tone })
      })
      window.setTimeout(() => get().dismissToast(id), 3200)
    },

    dismissToast: (id) => {
      set((s) => {
        s.toasts = s.toasts.filter((t) => t.id !== id)
      })
    },
  })),
)
