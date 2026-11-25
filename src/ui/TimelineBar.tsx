import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../store/useStore'
import { nearestKeyframeFrame } from '../core/timeline'
import { IconChevron, IconPause, IconPin, IconPlay, IconTrash } from './Icons'

const STEP = 1
const SNAP_FRAMES = 4

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
  const setDurationFrames = useStore((s) => s.setDurationFrames)
  const setAutoKey = useStore((s) => s.setAutoKey)
  const [snap, setSnap] = useState(true)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const fps = project?.output.fps || 24
  const duration = project?.timeline.durationFrames || 240
  const keyframes = project?.timeline.keyframes ?? []
  const currentHasKey = keyframes.some((keyframe) => keyframe.frame === playhead)
  const ratio = Math.min(1, Math.max(0, playhead / Math.max(1, duration)))

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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  if (!project) return null

  const seekAt = (clientX: number) => {
    const element = trackRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const usable = Math.max(1, rect.width - 20)
    const raw = Math.round(((clientX - rect.left - 10) / usable) * duration)
    const frame = Math.max(0, Math.min(duration, raw))
    const snapped = snap ? nearestKeyframeFrame(keyframes, frame, SNAP_FRAMES) : frame
    setPlaying(false)
    setPlayhead(snapped)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekAt(event.clientX)
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
        {keyframes.map((keyframe) => (
          <button
            key={keyframe.frame}
            className={`tl-kf ${keyframe.frame === playhead ? 'active' : ''}`}
            style={{
              left: `calc(${(keyframe.frame / Math.max(1, duration)) * 100}% + ${
                10 - (keyframe.frame / Math.max(1, duration)) * 20
              }px)`,
            }}
            title={`关键帧 ${keyframe.frame}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setPlaying(false)
              setPlayhead(keyframe.frame)
            }}
          >
            <IconPin size={11} />
          </button>
        ))}
        {keyframes.length === 0 ? (
          <span className="tl-empty">点右侧图钉记录当前帧，空格播放</span>
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
          title="拖动时间线时吸附到附近关键帧"
          onClick={() => setSnap((value) => !value)}
        >
          吸附
        </button>
        <button
          className={`icon-btn sm ${currentHasKey ? 'active' : ''}`}
          title={currentHasKey ? '更新当前帧关键帧' : '记录当前帧关键帧'}
          onClick={addKeyframe}
        >
          <IconPin size={13} />
        </button>
        <button
          className="icon-btn sm"
          title="删除当前帧关键帧"
          disabled={!currentHasKey}
          onClick={() => removeKeyframe()}
        >
          <IconTrash size={13} />
        </button>
        <span className="tl-count">{keyframes.length} 关键帧</span>
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
        <span>{fps} fps</span>
      </div>
    </footer>
  )
}
