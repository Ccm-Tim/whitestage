import type { Engine } from '../engine/Engine'
import type { CameraConfig, SceneObject } from '../core/types'
import { ASPECTS } from '../core/constants'
import { useStore } from '../store/useStore'

let agentEngine: Engine | null = null

export function setAgentEngine(engine: Engine | null) {
  agentEngine = engine
}

type Params = Record<string, unknown>

const str = (params: Params, key: string): string => {
  const value = params[key]
  if (typeof value !== 'string' || !value) throw new Error(`缺少参数 ${key}`)
  return value
}

export const AGENT_COMMANDS = [
  { method: 'app.status', description: '当前应用 / 工程 / 选中状态' },
  { method: 'app.listProjects', description: '读取本地工程历史列表' },
  { method: 'app.getProject', description: '读取当前工程 JSON' },
  { method: 'app.createProject', params: { name: 'string', aspect: '16:9|9:16|4:3|3:4|21:9' } },
  { method: 'app.openProject', params: { id: 'string' } },
  { method: 'app.save', description: '保存当前工程' },
  { method: 'app.closeProject', description: '返回开始页' },
  { method: 'project.patch', params: { name: 'string?', stage: 'object?', output: 'object?', ui: 'object?' } },
  { method: 'camera.list', description: '列出机位' },
  { method: 'camera.add', description: '新建机位并选中' },
  { method: 'camera.select', params: { id: 'string' } },
  { method: 'camera.update', params: { id: 'string', patch: 'Partial<CameraConfig>' } },
  { method: 'camera.remove', params: { id: 'string' } },
  { method: 'camera.setTarget', params: { id: 'string', target: 'CameraTargetLock' } },
  { method: 'camera.unlock', params: { id: 'string' } },
  { method: 'object.list', description: '列出场景对象' },
  { method: 'object.add', params: { presetId: 'string' } },
  { method: 'object.addCustom', params: { customId: 'string' } },
  { method: 'object.select', params: { id: 'string' } },
  { method: 'object.update', params: { id: 'string', patch: 'Partial<SceneObject>' } },
  { method: 'object.remove', params: { id: 'string' } },
  { method: 'object.duplicate', params: { id: 'string' } },
  { method: 'stage.update', params: { patch: 'Partial<StageSettings>' } },
  { method: 'preview.update', params: { patch: 'Partial<PreviewState>' } },
  { method: 'output.update', params: { patch: 'Partial<OutputSettings>' } },
  { method: 'background.setSolid', params: { color: 'string', preset: 'white|green|blue|custom' } },
  { method: 'background.board.active', params: { id: 'string' } },
  { method: 'background.board.updateItem', params: { id: 'string', patch: 'Partial<BoardItem>' } },
  { method: 'background.board.remove', params: { id: 'string' } },
  { method: 'background.board.align', description: '按宽度横向拼接' },
  { method: 'background.board.update', params: { patch: 'Partial<BoardBackground>' } },
  { method: 'background.board.lock', params: { locked: 'boolean' } },
  { method: 'background.board.sort', description: '按文件名序号排序' },
  { method: 'background.board.fallback', params: { color: 'string' } },
  { method: 'tool.set', params: { tool: 'select|translate|rotate|scale' } },
  { method: 'timeline.list', description: '列出时间线关键帧与切镜' },
  { method: 'timeline.addKeyframe', description: '在当前帧记录 / 更新关键帧' },
  { method: 'timeline.removeKeyframe', params: { frame: 'number?' } },
  { method: 'timeline.removeKeyframes', params: { frames: 'number[]' } },
  { method: 'timeline.listCuts', description: '列出节目切镜' },
  { method: 'timeline.addCut', params: { cameraId: 'string?', frame: 'number?' } },
  { method: 'timeline.removeCut', params: { frame: 'number?' } },
  { method: 'timeline.setPlayhead', params: { frame: 'number' } },
  { method: 'timeline.play', description: '播放' },
  { method: 'timeline.pause', description: '暂停' },
  { method: 'timeline.setDuration', params: { frames: 'number' } },
  { method: 'timeline.setAutoKey', params: { enabled: 'boolean' } },
  { method: 'timeline.clear', description: '清空关键帧' },
  { method: 'editor.focus', description: '聚焦当前选中对象' },
  { method: 'editor.screenshot', params: { maxWidth: 'number?' }, description: '当前预览画面截图 dataURL' },
  { method: 'history.undo', description: '撤销上一步编辑' },
  { method: 'history.redo', description: '重做' },
  { method: 'history.status', description: '撤销 / 重做栈状态' },
  { method: 'agent.ping', description: '连通性检查' },
]

export async function executeAgentCommand(method: string, params: Params = {}): Promise<unknown> {
  const state = () => useStore.getState()
  const project = () => {
    const current = state().project
    if (!current) throw new Error('当前没有打开的工程')
    return current
  }

  switch (method) {
    case 'history.status':
      return {
        undo: state().undoStack.length,
        redo: state().redoStack.length,
        canUndo: state().undoStack.length > 0,
        canRedo: state().redoStack.length > 0,
      }

    case 'history.undo':
      state().undo()
      return {
        undo: state().undoStack.length,
        redo: state().redoStack.length,
      }

    case 'history.redo':
      state().redo()
      return {
        undo: state().undoStack.length,
        redo: state().redoStack.length,
      }

    case 'agent.ping':
      return { pong: true, time: Date.now(), commands: AGENT_COMMANDS.length }

    case 'app.status': {
      const current = state()
      return {
        booted: current.booted,
        view: current.view,
        project: current.project
          ? {
              id: current.project.id,
              name: current.project.name,
              cameras: current.project.cameras.length,
              objects: current.project.objects.length,
              selectedCameraId: current.selectedCameraId,
              selectedObjectId: current.selectedObjectId,
            }
          : null,
        dirty: current.dirty,
        agentPort: 8787,
        canUndo: current.undoStack.length > 0,
        canRedo: current.redoStack.length > 0,
        timeline: {
          playhead: current.playheadFrame,
          playing: current.playing,
          autoKey: current.autoKey,
          keyframes: current.project?.timeline.keyframes.map((item) => item.frame) ?? [],
        },
      }
    }

    case 'app.listProjects':
      await state().refreshHistory()
      return state().history.map((item) => ({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt,
        cameras: item.json?.cameras?.length ?? 0,
        objects: item.json?.objects?.length ?? 0,
      }))

    case 'app.getProject':
      return JSON.parse(JSON.stringify(project()))

    case 'app.createProject':
      await state().createNewProject(String(params.name ?? 'Agent 新建工程'))
      if (typeof params.aspect === 'string') {
        state().setOutputAspect(params.aspect as never)
      }
      return { project: state().project ? JSON.parse(JSON.stringify(state().project)) : null }

    case 'app.openProject':
      await state().openProject(str(params, 'id'))
      return { projectId: state().project?.id ?? null }

    case 'app.save':
      await state().save({ silent: true })
      return { savedAt: state().lastSavedAt }

    case 'app.closeProject':
      await state().save({ silent: true })
      await state().closeProject()
      return { view: state().view }

    case 'project.patch': {
      const patch = (params.patch ?? {}) as Record<string, unknown>
      state().update((current) => {
        if (typeof patch.name === 'string' && patch.name.trim()) current.name = patch.name.trim()
        if (patch.stage && typeof patch.stage === 'object') {
          Object.assign(current.stage, patch.stage)
        }
        if (patch.output && typeof patch.output === 'object') {
          Object.assign(current.output, patch.output)
        }
        if (patch.ui && typeof patch.ui === 'object') {
          Object.assign(current.ui, patch.ui)
        }
      })
      return { project: JSON.parse(JSON.stringify(project())) }
    }

    case 'camera.list':
      return project().cameras.map((camera) => ({
        ...camera,
        preview: project().ui.preview.cameraId === camera.id,
      }))

    case 'camera.add':
      state().addCamera()
      return { camera: project().cameras[project().cameras.length - 1] }

    case 'camera.select':
      state().selectCamera(str(params, 'id'))
      return { selectedCameraId: state().selectedCameraId }

    case 'camera.update':
      state().patchCamera(str(params, 'id'), (params.patch ?? {}) as Partial<CameraConfig>)
      return { camera: project().cameras.find((item) => item.id === params.id) ?? null }

    case 'camera.remove':
      state().removeCamera(str(params, 'id'))
      return { cameras: project().cameras.length }

    case 'camera.setTarget':
      state().setCameraTarget(str(params, 'id'), params.target as never)
      return { camera: project().cameras.find((item) => item.id === params.id) ?? null }

    case 'camera.unlock':
      state().unlockCamera(str(params, 'id'))
      return { ok: true }

    case 'object.list':
      return project().objects.map((object) => ({ ...object }))

    case 'object.add':
      state().addObject(str(params, 'presetId'))
      return { object: project().objects[project().objects.length - 1] }

    case 'object.addCustom':
      state().addCustomCharacter(str(params, 'customId'))
      return { object: project().objects[project().objects.length - 1] }

    case 'object.select':
      state().selectObject(str(params, 'id'))
      return { selectedObjectId: state().selectedObjectId }

    case 'object.update':
      state().patchObject(str(params, 'id'), (params.patch ?? {}) as Partial<SceneObject>)
      return { object: project().objects.find((item) => item.id === params.id) ?? null }

    case 'object.remove':
      state().removeObject(str(params, 'id'))
      return { objects: project().objects.length }

    case 'object.duplicate':
      state().duplicateObject(str(params, 'id'))
      return { object: project().objects[project().objects.length - 1] }

    case 'stage.update': {
      const patch = (params.patch ?? {}) as Partial<{
        grid: boolean
        gridWidth: number
        whiteFloor: boolean
        shadows: boolean
        fog: boolean
      }>
      state().update((current) => {
        Object.assign(current.stage, patch)
      })
      return { stage: project().stage }
    }

    case 'preview.update':
      state().setPreview(params.patch as never)
      return { preview: project().ui.preview }

    case 'output.update': {
      const patch = (params.patch ?? {}) as Record<string, unknown>
      if (typeof patch.aspect === 'string') {
        state().setOutputAspect(patch.aspect as never)
      }
      state().update((current) => {
        if (typeof patch.width === 'number') current.output.width = Math.round(patch.width)
        if (typeof patch.height === 'number') current.output.height = Math.round(patch.height)
        if (typeof patch.fps === 'number') current.output.fps = Math.round(patch.fps)
      })
      return { output: project().output }
    }

    case 'background.setSolid':
      state().setBackground({
        kind: 'solid',
        color: str(params, 'color'),
        preset: (params.preset as never) ?? 'custom',
      })
      return { background: project().background }

    case 'background.board.active':
      state().setActiveBoardItem(str(params, 'id'))
      return { activeId: (project().background as { activeId?: string }).activeId }

    case 'background.board.updateItem':
      state().updateBoardItem(str(params, 'id'), (params.patch ?? {}) as never)
      return { background: project().background }

    case 'background.board.remove':
      state().removeBoardItem(str(params, 'id'))
      return { background: project().background }

    case 'background.board.align':
      state().alignBoard()
      return { background: project().background }

    case 'background.board.update':
      state().updateBoardBackground((params.patch ?? {}) as never)
      return { background: project().background }

    case 'background.board.lock':
      state().setBoardLocked(params.locked === true)
      return { background: project().background }

    case 'background.board.sort':
      state().sortBoardByName()
      return { background: project().background }

    case 'background.board.fallback':
      state().updateBoardBackground({ fallbackColor: str(params, 'color') })
      return { background: project().background }

    case 'tool.set':
      state().setTool(params.tool as never)
      return { tool: project().ui.tool }

    case 'timeline.list':
      return {
        frames: project().timeline.keyframes.map((keyframe) => keyframe.frame),
        cuts: project().timeline.cameraCuts,
        durationFrames: project().timeline.durationFrames,
        playhead: state().playheadFrame,
        playing: state().playing,
        autoKey: state().autoKey,
      }

    case 'timeline.listCuts':
      return {
        cuts: project().timeline.cameraCuts,
        playhead: state().playheadFrame,
      }

    case 'timeline.addCut': {
      const targetFrame =
        typeof params.frame === 'number' ? Number(params.frame) : state().playheadFrame
      state().setPlayhead(targetFrame)
      const cameraId =
        typeof params.cameraId === 'string'
          ? params.cameraId
          : (project().ui.preview.cameraId ?? project().cameras[0]?.id)
      if (!cameraId) throw new Error('没有可用机位')
      state().setProgramCamera(cameraId, targetFrame)
      return {
        cuts: project().timeline.cameraCuts,
        playhead: state().playheadFrame,
      }
    }

    case 'timeline.removeCut':
      state().removeCameraCut(typeof params.frame === 'number' ? params.frame : undefined)
      return { cuts: project().timeline.cameraCuts }

    case 'timeline.addKeyframe':
      state().addKeyframe()
      return {
        frames: project().timeline.keyframes.map((keyframe) => keyframe.frame),
        playhead: state().playheadFrame,
      }

    case 'timeline.removeKeyframe':
      state().removeKeyframe(typeof params.frame === 'number' ? params.frame : undefined)
      return { frames: project().timeline.keyframes.map((keyframe) => keyframe.frame) }

    case 'timeline.removeKeyframes': {
      const frames = Array.isArray(params.frames)
        ? (params.frames as unknown[]).map(Number).filter((frame) => Number.isFinite(frame))
        : []
      state().removeKeyframes(frames)
      return { frames: project().timeline.keyframes.map((keyframe) => keyframe.frame) }
    }

    case 'timeline.setPlayhead':
      state().setPlayhead(Number(params.frame) || 0)
      return { playhead: state().playheadFrame }

    case 'timeline.play':
      state().setPlaying(true)
      return { playing: true }

    case 'timeline.pause':
      state().setPlaying(false)
      return { playing: false }

    case 'timeline.setDuration':
      state().setDurationFrames(Number(params.frames) || 240)
      return { durationFrames: project().timeline.durationFrames }

    case 'timeline.setAutoKey':
      state().setAutoKey(params.enabled === true)
      return { autoKey: state().autoKey }

    case 'timeline.clear':
      state().clearKeyframes()
      return { frames: [] }

    case 'editor.focus':
      if (!agentEngine) throw new Error('编辑器尚未初始化')
      agentEngine.focusSelected()
      return { ok: true }

    case 'editor.screenshot': {
      if (!agentEngine) throw new Error('编辑器尚未初始化')
      const maxWidth = typeof params.maxWidth === 'number' ? params.maxWidth : 1280
      const ratio = ASPECTS[project().output.aspect].ratio
      const url = agentEngine.captureThumb(ratio, maxWidth)
      return { dataUrl: url, width: maxWidth }
    }

    default:
      throw new Error(`未知命令：${method}`)
  }
}
