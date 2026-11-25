import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useStore } from '../store/useStore'
import { activeCameraIdAt, cameraCutAt } from '../core/timeline'
import { IconChevron, IconPause, IconPin, IconPlay, IconScissors, IconTrash } from './Icons'

const STEP = 1
const SNAP_FRAMES = 4

function nearestTimelineFrame(frames: number[], frame: number, threshold = SNAP_FRAMES): number {
  let best = frame
  let bestDistance = threshold + 1
  for (const candidate of frames) {
    const distance = Math.abs(candidate - frame)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return bestDistance <= threshold ? best : frame
}

export function TimelineBar() {
  const project = useStore((s) => s.project)
  const playhead = useStore((s) => s.playheadFrame)
  const playing = useStore((s) => s.playing)
  const autoKey = useStore((s) => s.autoKey)
  const setPlayhead = useStore((s) => s.setPlayhead)
  const setPlaying = useStore((s) => s.setPlaying)
  const togglePlay = useStore((s) => s.togglePlay)
  const stepFrames = useStore((s) => s.stepFrames)
  const addKeyframe = useStore((s) => s.addKeyframe)
  const removeKeyframe = useStore((s) => s.removeKeyframe)
  const removeKeyframes = useStore((s) => s.removeKeyframes)
  const clearKeyframes = useStore((s) => s.clearKeyframes)
  const setProgramCamera = useStore((s) => s.setProgramCamera)
  const removeCameraCut = useStore((s) => s.removeCameraCut)
  const setDurationFrames = useStore((s) => s.setDurationFrames)
  const setAutoKey = useStore((s) => s.setAutoKey)
  const [snap, setSnap] = useState(true)
  const [cutCamera, setCutCamera] = useState('')
  const [selectedFrames, setSelectedFrames] = useState<Set<number>>(() => new Set())
  const selectionAnchorRef = useRef<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const fps = project?.output.fps || 24
  const duration = project?.timeline.durationFrames || 240
  const keyframes = project?.timeline.keyframes ?? []
  const cuts = project?.timeline.cameraCuts ?? []
  const cameras = project?.cameras ?? []
  const programCameraId = project ? (activeCameraIdAt(project, playhead) ?? '') : ''
  const currentCut = cameraCutAt(cuts, playhead)
  const currentHasKey = keyframes.some((keyframe) => keyframe.frame === playhead)
  const ratio = Math.min(1, Math.max(0, playhead / Math.max(1, duration)))

  useEffect(() => {
    if (!project) return
    setCutCamera(programCameraId)
  }, [project, playhead, programCameraId])

  useEffect(() => {
    const available = new Set(keyframes.map((keyframe) => keyframe.frame))
    setSelectedFrames((previous) => {
      const next = new Set([...previous].filter((frame) => available.has(frame)))
      return next.size === previous.size ? previous : next
    })
  }, [keyframes])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let accumulator = 0
    const tick = (now: number) => {
      const state = useStore.getState()
      if (!state.playing || !state.project) return
      accumulator += now - last
      last = now
      const stepMs = 1000 / Math.max(1, state.project.output.fps)
      let guard = 0
      while (accumulator >= stepMs && guard < 4) {
        accumulator -= stepMs
        guard += 1
        const next = state.playheadFrame + 1
        state.setPlayhead(next > state.project.timeline.durationFrames ? 0 : next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, fps, duration])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlay()
        return
      }
      if (event.key === 'Escape') {
        setSelectedFrames(new Set())
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFrames.size > 0) {
        event.preventDefault()
        removeKeyframes([...selectedFrames])
        setSelectedFrames(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, selectedFrames, removeKeyframes])

  if (!project) return null

  const seekAt = (clientX: number) => {
    const element = trackRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const usable = Math.max(1, rect.width - 20)
    const raw = Math.round(((clientX - rect.left - 10) / usable) * duration)
    const frame = Math.max(0, Math.min(duration, raw))
    const snapFrames = [...keyframes.map((keyframe) => keyframe.frame), ...cuts.map((cut) => cut.frame)]
    const snapped = snap ? nearestTimelineFrame(snapFrames, frame, SNAP_FRAMES) : frame
    setPlaying(false)
    setPlayhead(snapped)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    setSelectedFrames(new Set())
    selectionAnchorRef.current = null
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekAt(event.clientX)
  }

  const selectKeyframe = (event: ReactMouseEvent<HTMLButtonElement>, frame: number) => {
    event.stopPropagation()
    setPlaying(false)
    const additive = event.ctrlKey || event.metaKey
    const range = event.shiftKey
    if (range) {
      const anchor = selectionAnchorRef.current ?? frame
      const start = Math.min(anchor, frame)
      const end = Math.max(anchor, frame)
      const next = new Set(selectedFrames)
      for (const keyframe of keyframes) {
        if (keyframe.frame >= start && keyframe.frame <= end) next.add(keyframe.frame)
      }
      setSelectedFrames(next)
    } else if (additive) {
      const next = new Set(selectedFrames)
      if (next.has(frame)) next.delete(frame)
      else next.add(frame)
      setSelectedFrames(next)
      selectionAnchorRef.current = frame
    } else {
      setSelectedFrames(new Set([frame]))
      selectionAnchorRef.current = frame
    }
    setPlayhead(frame)
  }

  const deleteCount =
    selectedFrames.size > 0 ? selectedFrames.size : currentHasKey ? 1 : 0

  const deleteKeyframes = () => {
    if (selectedFrames.size > 0) {
      removeKeyframes([...selectedFrames])
      setSelectedFrames(new Set())
      return
    }
    if (currentHasKey) removeKeyframe()
  }

  const clearAllKeyframes = () => {
    if (keyframes.length === 0) return
    clearKeyframes()
    setSelectedFrames(new Set())
    selectionAnchorRef.current = null
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    seekAt(event.clientX)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const frameLeft = (value: number) => {
    const pct = Math.min(1, Math.max(0, value / Math.max(1, duration)))
    return `calc(${pct * 100}% + ${10 - pct * 20}px)`
  }

  return (
    <footer className="timeline-bar">
      <div className="transport">
        <button
          className="icon-btn sm"
          title="后退 1 帧"
          onClick={() => {
            setPlaying(false)
            stepFrames(-STEP)
          }}
        >
          <IconChevron size={13} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          className={`icon-btn sm ${playing ? 'active' : ''}`}
          title={playing ? '暂停 (空格)' : '播放 (空格)'}
          onClick={togglePlay}
        >
          {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
        </button>
        <button
          className="icon-btn sm"
          title="前进 1 帧"
          onClick={() => {
            setPlaying(false)
            stepFrames(STEP)
          }}
        >
          <IconChevron size={13} />
        </button>
      </div>

      <div className="timecode">
        <span className="tc-label">帧</span>
        <input
          className="tl-frame-input"
          type="number"
          min={0}
          max={duration}
          value={playhead}
          onChange={(event) => {
            setPlaying(false)
            setPlayhead(Number(event.target.value))
          }}
        />
      </div>
      <div className="timecode">
        <input
          className="tl-time-input"
          type="number"
          min={0}
          step={0.01}
          value={(playhead / Math.max(1, fps)).toFixed(2)}
          onChange={(event) => {
            setPlaying(false)
            setPlayhead(Math.round(Number(event.target.value) * fps))
          }}
        />
        <span className="tc-label">s</span>
      </div>

      <div
        className="tl-track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="tl-rail" />
        <div
          className="tl-progress"
          style={{
            left: 10,
            width: `calc(${ratio * 100}% - ${ratio * 20}px)`,
          }}
        />
        <div
          className="tl-head"
          style={{ left: `calc(${ratio * 100}% + ${10 - ratio * 20}px)` }}
        />
        {cuts.map((cut) => {
          const camera = cameras.find((item) => item.id === cut.cameraId)
          return (
            <button
              key={cut.id}
              className={`tl-cut ${cut.frame === playhead ? 'active' : ''}`}
              style={{ left: frameLeft(cut.frame) }}
              title={`切镜 ${cut.frame} · ${camera?.name ?? '已删除机位'}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setPlaying(false)
                setPlayhead(cut.frame)
                setCutCamera(cut.cameraId)
              }}
            >
              <IconScissors size={10} />
            </button>
          )
        })}
        {keyframes.map((keyframe) => (
          <button
            key={keyframe.frame}
            className={`tl-kf ${keyframe.frame === playhead ? 'active' : ''} ${
              selectedFrames.has(keyframe.frame) ? 'selected' : ''
            }`}
            style={{
              left: `calc(${(keyframe.frame / Math.max(1, duration)) * 100}% + ${
                10 - (keyframe.frame / Math.max(1, duration)) * 20
              }px)`,
            }}
            title={`关键帧 ${keyframe.frame} · Ctrl 点击多选 · Shift 点击范围选择`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => selectKeyframe(event, keyframe.frame)}
          >
            <IconPin size={11} />
          </button>
        ))}
        {keyframes.length === 0 ? (
          <span className="tl-empty">图钉记关键帧 · Ctrl/Shift 多选 · 剪刀切镜</span>
        ) : null}
      </div>

      <div className="tl-meta">
        <button
          className={`tl-chip ${autoKey ? 'on' : ''}`}
          title="开启后，移动机位 / 对象会自动在当前帧记录关键帧"
          onClick={() => setAutoKey(!autoKey)}
        >
          自动关键帧
        </button>
        <button
          className={`tl-chip ${snap ? 'on' : ''}`}
          title="拖动时间线时吸附到附近关键帧 / 切镜"
          onClick={() => setSnap((value) => !value)}
        >
          吸附
        </button>
        <div className="tl-cuts" title="节目切镜：第 N 帧起输出所选机位">
          <span className="tl-cuts-label">切镜</span>
          <select
            className="tl-cut-select"
            value={cutCamera || programCameraId}
            disabled={cameras.length === 0}
            onChange={(event) => setCutCamera(event.target.value)}
            title="要切到的节目机位"
          >
            {cameras.length === 0 ? <option value="">无机位</option> : null}
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </select>
          <button
            className="icon-btn sm"
            title="在当前帧切到所选机位"
            disabled={!cutCamera || cameras.length === 0}
            onClick={() => setProgramCamera(cutCamera)}
          >
            <IconScissors size={13} />
          </button>
          <button
            className="icon-btn sm"
            title={playhead === 0 ? '0 帧是基准切镜，不能删除' : '删除当前帧切镜'}
            disabled={!currentCut || playhead === 0}
            onClick={() => removeCameraCut(playhead)}
          >
            <IconTrash size={13} />
          </button>
        </div>
        <button
          className={`icon-btn sm ${currentHasKey ? 'active' : ''}`}
          title={currentHasKey ? '更新当前帧关键帧' : '记录当前帧关键帧'}
          onClick={addKeyframe}
        >
          <IconPin size={13} />
        </button>
        <button
          className="icon-btn sm"
          title={
            selectedFrames.size > 0
              ? `删除选中的 ${selectedFrames.size} 个关键帧`
              : '删除当前帧关键帧'
          }
          disabled={deleteCount === 0}
          onClick={deleteKeyframes}
        >
          <IconTrash size={13} />
        </button>
        {selectedFrames.size > 0 ? (
          <span className="tl-selected">已选 {selectedFrames.size}</span>
        ) : null}
        <button
          className="tl-chip tl-clear-all"
          title="一键清空所有关键帧（可撤销，不影响切镜）"
          disabled={keyframes.length === 0}
          onClick={clearAllKeyframes}
        >
          清空全部
        </button>
        <span className="tl-count">{keyframes.length} 关键帧 · {cuts.length} 切镜</span>
        <label className="tl-duration" title="时间线长度（帧）">
          长度
          <input
            type="number"
            min={12}
            max={3600}
            value={duration}
            onChange={(event) => setDurationFrames(Number(event.target.value))}
          />
        </label>
        <span className="tl-dot">·</span>
        <span className="tl-fps">{fps} fps</span>
      </div>
    </footer>
  )
}
