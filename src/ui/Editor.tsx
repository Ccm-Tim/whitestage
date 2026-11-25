import { useCallback, useEffect, useRef, useState } from 'react'
import { Engine } from '../engine/Engine'
import { setAgentEngine } from '../agent/commands'
import { ASPECTS } from '../core/constants'
import { rad } from '../core/math'
import { errorMessage, useStore } from '../store/useStore'
import { downloadBlob, sanitizeFileName } from '../storage/projectFile'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'
import { Inspector } from './Inspector'
import { TimelineBar } from './TimelineBar'
import { PreviewWindow } from './PreviewWindow'
import { VideoExportDialog } from './VideoExportDialog'

export function Editor() {
  const project = useStore((s) => s.project)
  const selectedCameraId = useStore((s) => s.selectedCameraId)
  const selectedObjectId = useStore((s) => s.selectedObjectId)
  const dirty = useStore((s) => s.dirty)
  const saving = useStore((s) => s.saving)
  const autosaveMinutes = useStore((s) => s.autosaveMinutes)
  const tool = useStore((s) => s.project?.ui.tool ?? 'select')
  const previewCameraId = useStore((s) => s.project?.ui.preview.cameraId ?? null)
  const pickTargetFor = useStore((s) => s.pickTargetFor)
  const cancelTargetPick = useStore((s) => s.cancelTargetPick)
  const canUndo = useStore((s) => s.undoStack.length > 0)
  const canRedo = useStore((s) => s.redoStack.length > 0)

  const viewportRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [videoExportOpen, setVideoExportOpen] = useState(false)

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    let instance: Engine
    try {
      instance = new Engine(element, {
        onSelectCamera: (id) => useStore.getState().selectCamera(id),
        onSelectObject: (id) => useStore.getState().selectObject(id),
        onCameraChange: (id, patch) => useStore.getState().patchCamera(id, patch),
        onObjectChange: (id, patch) => useStore.getState().patchObject(id, patch),
        onPickTarget: (target) => useStore.getState().completeTargetPick(target),
      })
    } catch (err) {
      setEngineError(errorMessage(err))
      return
    }
    engineRef.current = instance
    setAgentEngine(instance)
    setEngine(instance)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __ws?: unknown }).__ws = { engine: instance, store: useStore }
    }
    return () => {
      engineRef.current = null
      setAgentEngine(null)
      instance.dispose()
    }
  }, [])

  useEffect(() => {
    if (project) engine?.syncProject(project)
  }, [engine, project])

  useEffect(() => {
    engine?.setSelected(selectedCameraId)
  }, [engine, selectedCameraId])

  useEffect(() => {
    engine?.setSelectedObject(selectedObjectId)
  }, [engine, selectedObjectId])

  useEffect(() => {
    engine?.setTool(tool)
  }, [engine, tool])

  useEffect(() => {
    engine?.setPreviewCamera(previewCameraId)
  }, [engine, previewCameraId])

  useEffect(() => {
    engine?.setPickMode(!!pickTargetFor)
  }, [engine, pickTargetFor])

  // 对象页的“导出部件 ID / Mask”按钮通过事件交给这里，因为引擎在 Editor 里
  useEffect(() => {
    const handler = async () => {
      const instance = engineRef.current
      if (!instance) return
      const state = useStore.getState()
      state.toast('正在导出部件 ID / Mask…', 'info')
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      try {
        const result = instance.exportPartMasks()
        if (!result) {
          state.toast('没有可导出的人偶：请先添加并显示至少一个人偶', 'error')
          return
        }
        const base = sanitizeFileName(state.project?.name ?? '白膜预演')
        downloadBlob(result.blob, `${base}-AI部件ID.zip`)
        state.toast(
          `已导出 ${result.objectCount} 个人偶、${result.partCount} 个部件`,
          'success',
        )
      } catch (err) {
        state.toast('部件 ID 导出失败：' + errorMessage(err), 'error')
      }
    }
    window.addEventListener('whitestage:export-part-masks', handler)
    return () => window.removeEventListener('whitestage:export-part-masks', handler)
  }, [])

  const saveNow = useCallback(async (silent: boolean) => {
    const state = useStore.getState()
    if (!state.project) return
    const ratio = ASPECTS[state.project.output.aspect].ratio
    const thumb = engineRef.current?.captureThumb(ratio) ?? null
    await state.save({ silent, thumb })
  }, [])

  const exportProject = async () => {
    const state = useStore.getState()
    if (!state.project) return
    const thumb = engineRef.current?.captureThumb(ASPECTS[state.project.output.aspect].ratio) ?? null
    await state.exportProject(thumb)
  }

  const handleBack = async () => {
    await saveNow(true)
    await useStore.getState().closeProject()
  }

  // 定时自动保存
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        const state = useStore.getState()
        if (!state.project || !state.dirty || state.saving) return
        void saveNow(true)
      },
      Math.max(1, autosaveMinutes) * 60_000,
    )
    return () => window.clearInterval(timer)
  }, [autosaveMinutes, saveNow])

  // 停止编辑 30 秒后静默保存
  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      const state = useStore.getState()
      if (state.project && state.dirty && !state.saving) void saveNow(true)
    }, 30_000)
    return () => window.clearTimeout(timer)
  }, [dirty, project?.updatedAt, saveNow])

  // 页面隐藏 / 关闭前兜底保存
  useEffect(() => {
    const persist = () => {
      const state = useStore.getState()
      if (state.project && state.dirty && !state.saving) void state.save({ silent: true })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return

      const state = useStore.getState()
      const key = e.key.toLowerCase()

      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault()
        void saveNow(false)
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        state.redo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown'
      ) {
        const camera = state.project?.cameras.find((c) => c.id === state.selectedCameraId)
        const object = state.project?.objects.find((o) => o.id === state.selectedObjectId)
        if (!camera && !object) return
        e.preventDefault()
        const step = state.nudgeStep
        if (object) {
          const yaw = rad(object.rotation.y)
          const forwardX = Math.sin(yaw)
          const forwardZ = Math.cos(yaw)
          const rightX = Math.cos(yaw)
          const rightZ = -Math.sin(yaw)
          let dx = 0
          let dy = 0
          let dz = 0
          if (e.key === 'PageUp' || (e.key === 'ArrowUp' && e.shiftKey)) {
            dy = step
          } else if (e.key === 'PageDown' || (e.key === 'ArrowDown' && e.shiftKey)) {
            dy = -step
          } else if (e.key === 'ArrowUp') {
            dx = forwardX * step
            dz = forwardZ * step
          } else if (e.key === 'ArrowDown') {
            dx = -forwardX * step
            dz = -forwardZ * step
          } else if (e.key === 'ArrowLeft') {
            dx = -rightX * step
            dz = -rightZ * step
          } else if (e.key === 'ArrowRight') {
            dx = rightX * step
            dz = rightZ * step
          }
          if (dx || dy || dz) {
            state.patchObject(object.id, {
              position: {
                x: object.position.x + dx,
                y: object.position.y + dy,
                z: object.position.z + dz,
              },
            })
          }
          return
        }
        if (!camera) return
        e.preventDefault()
        const yaw = rad(camera.rotation.y)
        const forwardX = -Math.sin(yaw)
        const forwardZ = -Math.cos(yaw)
        const rightX = Math.cos(yaw)
        const rightZ = -Math.sin(yaw)
        let dx = 0
        let dy = 0
        let dz = 0
        if (e.key === 'PageUp' || (e.key === 'ArrowUp' && e.shiftKey)) {
          dy = step
        } else if (e.key === 'PageDown' || (e.key === 'ArrowDown' && e.shiftKey)) {
          dy = -step
        } else if (e.key === 'ArrowUp') {
          dx = forwardX * step
          dz = forwardZ * step
        } else if (e.key === 'ArrowDown') {
          dx = -forwardX * step
          dz = -forwardZ * step
        } else if (e.key === 'ArrowLeft') {
          dx = -rightX * step
          dz = -rightZ * step
        } else if (e.key === 'ArrowRight') {
          dx = rightX * step
          dz = rightZ * step
        }
        if (dx || dy || dz) {
          state.patchCamera(camera.id, {
            position: {
              x: camera.position.x + dx,
              y: camera.position.y + dy,
              z: camera.position.z + dz,
            },
          })
        }
        return
      }

      if (key === 'q') state.setTool('select')
      else if (key === 'w') state.setTool('translate')
      else if (key === 'e') state.setTool('rotate')
      else if (key === 'f') engineRef.current?.focusSelected()
      else if (key === 'escape') {
        if (state.pickTargetFor) state.cancelTargetPick()
        else {
          state.selectCamera(null)
          state.selectObject(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow])

  if (!project) return null

  return (
    <div className="editor">
      <TopBar
        saving={saving}
        onBack={() => void handleBack()}
        onSave={() => void saveNow(false)}
        onExport={() => void exportProject()}
        onExportVideo={() => setVideoExportOpen(true)}
        onUndo={() => useStore.getState().undo()}
        onRedo={() => useStore.getState().redo()}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="editor-body">
        <LeftRail />
        <div className="viewport" ref={viewportRef}>
          <div className="viewport-brand">
            WHITESTAGE <span>M6</span>
          </div>
          <div className="viewport-hint">
            左键点选机位/人偶/道具 · 右键旋转 · 中键平移 · 滚轮缩放 · 方向键微调 · Shift+↑↓ 升降 · F 聚焦
          </div>
          {pickTargetFor ? (
            <div className="pick-banner">
              <span className="pick-banner-dot" />
              点击场景中的机位、人偶/道具或地面作为锁定目标
              <button className="mini-btn" onClick={() => cancelTargetPick()}>
                取消 (Esc)
              </button>
            </div>
          ) : null}
          {engineError ? (
            <div className="viewport-error">
              <b>3D 场景初始化失败</b>
              <p>{engineError}</p>
              <p>请使用最新版 Chrome / Edge，并确认浏览器已启用 WebGL。</p>
            </div>
          ) : null}
          {engine ? <PreviewWindow project={project} engine={engine} boundsRef={viewportRef} /> : null}
        </div>
        <Inspector />
      </div>

      <TimelineBar />
      <VideoExportDialog
        open={videoExportOpen}
        engine={engine}
        onClose={() => setVideoExportOpen(false)}
      />
    </div>
  )
}
