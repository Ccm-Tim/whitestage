import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { AspectId, Project } from '../core/types'
import { ASPECTS, ASPECT_ORDER } from '../core/constants'
import {
  DEFAULT_FREE_GRID,
  PREVIEW_LAYOUTS,
  normalizeCameraSlots,
  normalizeFreePreviewGrid,
  normalizePreviewLayout,
  previewCells,
  previewSlotCount,
  type FreePreviewGrid,
} from '../core/preview'
import { clamp } from '../core/math'
import { useStore } from '../store/useStore'
import type { Engine } from '../engine/Engine'
import { IconEyeOff, IconGrip, IconReset } from './Icons'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const HEADER_H = 36

export function PreviewWindow({
  project,
  engine,
  boundsRef,
}: {
  project: Project
  engine: Engine
  boundsRef: RefObject<HTMLDivElement | null>
}) {
  const preview = project.ui.preview
  const aspect = project.output.aspect
  const cameras = project.cameras
  const layout = normalizePreviewLayout(preview.layout)
  const free = normalizeFreePreviewGrid(preview.free)
  const slotCount = previewSlotCount(layout, free)
  const layoutMeta = { label: '自由分屏', slots: slotCount }
  const slotIds = normalizeCameraSlots(
    layout,
    preview.cameraIds ?? [],
    cameras.map((camera) => camera.id),
    preview.cameraId ?? undefined,
    slotCount,
  )
  const previewCameraId =
    slotIds[0] ??
    (preview.cameraId && cameras.some((c) => c.id === preview.cameraId)
      ? preview.cameraId
      : (cameras[0]?.id ?? ''))
  const cells = previewCells(layout, free)

  const [rect, setRect] = useState<Rect>({
    x: preview.x,
    y: preview.y,
    w: preview.w,
    h: preview.h,
  })
  const rectRef = useRef<Rect>(rect)
  const [frame, setFrame] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; start: Rect } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<{ axis: 'col' | 'row'; index: number } | null>(null)

  const applyRect = useCallback((next: Rect) => {
    rectRef.current = next
    setRect(next)
  }, [])

  // 外部状态（打开工程、换画幅）同步到本地矩形
  useEffect(() => {
    if (dragRef.current) return
    const next = { x: preview.x, y: preview.y, w: preview.w, h: preview.h }
    rectRef.current = next
    setRect(next)
  }, [preview.x, preview.y, preview.w, preview.h])

  // 首次打开时默认贴到右下角，并保证不超出视口
  useLayoutEffect(() => {
    const fit = () => {
      const bounds = boundsRef.current
      if (!bounds) return
      const bw = bounds.clientWidth
      const bh = bounds.clientHeight
      if (bw < 40 || bh < 40) return
      const w = clamp(preview.w || 480, 300, Math.max(300, bw - 16))
      const h = clamp(preview.h || 306, 220, Math.max(220, bh - 16))
      const x = preview.x ? clamp(preview.x, 8, Math.max(8, bw - w - 8)) : Math.max(8, bw - w - 16)
      const y = preview.y ? clamp(preview.y, 8, Math.max(8, bh - h - 8)) : Math.max(8, bh - h - 16)
      const next = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
      if (
        next.x !== preview.x ||
        next.y !== preview.y ||
        next.w !== preview.w ||
        next.h !== preview.h
      ) {
        useStore.getState().setPreview(next, { dirty: false })
      }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [preview.x, preview.y, preview.w, preview.h, boundsRef])

  // 把 WebGL 预览画布挂进面板
  useEffect(() => {
    const host = frameRef.current
    if (!host) return
    engine.mountPreview(host)
    return () => engine.unmountPreview()
  }, [engine])

  // 分屏布局 / 每格机位同步到引擎
  useEffect(() => {
    engine.setPreviewLayout(layout, slotIds, free)
  }, [engine, layout, slotIds.join('|'), free.cols, free.rows, free.colSizes.join(','), free.rowSizes.join(',')])

  // 按画幅计算画面区域尺寸（letterbox）
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const update = () => {
      const bw = body.clientWidth
      const bh = body.clientHeight
      if (bw < 2 || bh < 2) return
      const ratio = ASPECTS[aspect].ratio
      let w = bw
      let h = bw / ratio
      if (h > bh) {
        h = bh
        w = bh * ratio
      }
      setFrame({ w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(body)
    return () => observer.disconnect()
  }, [aspect, rect.w, rect.h])

  const commit = () => {
    const r = rectRef.current
    useStore.getState().setPreview({
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.w),
      h: Math.round(r.h),
    })
  }

  const begin = (mode: 'move' | 'resize') => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (mode === 'move' && (e.target as HTMLElement).closest('button, select, input')) return
    e.preventDefault()
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, start: rectRef.current }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件或无效 pointerId 时忽略 */
    }
    setDragging(true)
  }

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const bounds = boundsRef.current
    const bw = bounds?.clientWidth ?? window.innerWidth
    const bh = bounds?.clientHeight ?? window.innerHeight
    const dx = e.clientX - drag.sx
    const dy = e.clientY - drag.sy
    if (drag.mode === 'move') {
      const x = clamp(drag.start.x + dx, 8, Math.max(8, bw - drag.start.w - 8))
      const y = clamp(drag.start.y + dy, 8, Math.max(8, bh - drag.start.h - 8))
      applyRect({ ...drag.start, x, y })
    } else {
      const w = clamp(drag.start.w + dx, 300, Math.max(300, bw - drag.start.x - 8))
      const h = clamp(drag.start.h + dy, 220, Math.max(220, bh - drag.start.y - 8))
      applyRect({ ...drag.start, w, h })
    }
  }

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    commit()
  }

  const changeAspect = (next: AspectId) => {
    const store = useStore.getState()
    store.setOutputAspect(next)
    const bounds = boundsRef.current
    const bw = bounds?.clientWidth ?? window.innerWidth
    const bh = bounds?.clientHeight ?? window.innerHeight
    const w = clamp(rectRef.current.w, 300, Math.max(300, bw - 16))
    const targetH = Math.round(HEADER_H + (w - 2) / ASPECTS[next].ratio)
    const maxH = Math.max(220, bh - rectRef.current.y - 16)
    store.setPreview({ h: Math.round(clamp(targetH, 220, maxH)) })
  }

  const applyFreeGrid = (grid: FreePreviewGrid) => {
    const store = useStore.getState()
    const slots = previewSlotCount('free', grid)
    const ids = normalizeCameraSlots(
      'free',
      store.project?.ui.preview.cameraIds ?? [],
      cameras.map((camera) => camera.id),
      store.project?.ui.preview.cameraId ?? undefined,
      slots,
    )
    store.setPreview({
      layout: 'free',
      free: grid,
      cameraIds: ids,
      cameraId: ids[0] ?? store.project?.ui.preview.cameraId ?? null,
    })
  }

  const changeFreeSize = (cols: number, rows: number) => {
    applyFreeGrid(normalizeFreePreviewGrid({ cols, rows }))
  }

  const snapFraction = (value: number) => {
    const snapped = Math.round(value * 20) / 20
    for (const target of [0.25, 0.5, 0.75]) {
      if (Math.abs(snapped - target) <= 0.025) return target
    }
    return snapped
  }

  const startDivider =
    (axis: 'col' | 'row', index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      dividerRef.current = { axis, index }
      event.currentTarget.setPointerCapture(event.pointerId)
    }

  const moveDivider = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dividerRef.current
    const rect = frameRef.current?.getBoundingClientRect()
    if (!drag || !rect) return
    const state = useStore.getState().project?.ui.preview.free
    if (!state) return
    const sizes = drag.axis === 'col' ? [...state.colSizes] : [...state.rowSizes]
    if (drag.index + 1 >= sizes.length) return
    const before = sizes.slice(0, drag.index).reduce((sum, value) => sum + value, 0)
    const pair = sizes[drag.index] + sizes[drag.index + 1]
    const ratio =
      drag.axis === 'col'
        ? (event.clientX - rect.left) / rect.width
        : (event.clientY - rect.top) / rect.height
    const local = clamp(snapFraction((ratio - before) / Math.max(0.001, pair)), 0.08, 0.92)
    sizes[drag.index] = pair * local
    sizes[drag.index + 1] = pair * (1 - local)
    useStore.getState().setPreview({
      free: {
        ...state,
        colSizes: drag.axis === 'col' ? sizes : state.colSizes,
        rowSizes: drag.axis === 'row' ? sizes : state.rowSizes,
      },
    })
  }

  const endDivider = (event: ReactPointerEvent<HTMLDivElement>) => {
    dividerRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  const resetPosition = () => {
    const bounds = boundsRef.current
    const bw = bounds?.clientWidth ?? window.innerWidth
    const bh = bounds?.clientHeight ?? window.innerHeight
    const w = Math.min(480, Math.max(300, bw - 32))
    const h = Math.min(Math.round(HEADER_H + (w - 2) / ASPECTS[aspect].ratio), Math.max(220, bh - 32))
    useStore.getState().setPreview({
      visible: true,
      x: Math.max(8, bw - w - 16),
      y: Math.max(8, bh - h - 16),
      w,
      h,
    })
  }

  return (
    <div
      className={`preview-panel ${dragging ? 'is-dragging' : ''}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        display: preview.visible ? 'flex' : 'none',
      }}
    >
      <div
        className="preview-head"
        onPointerDown={begin('move')}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span className="preview-grip" title="拖动预览窗">
          <IconGrip size={14} />
        </span>
        <span className="preview-title">输出预览{layout === 'single' ? '' : ` · ${layoutMeta.slots} 格`}</span>
        {layout === 'single' ? (
          <select
            className="preview-select"
            value={previewCameraId}
            disabled={cameras.length === 0}
            title="切换预览机位"
            onChange={(e) => {
              const id = e.target.value
              const store = useStore.getState()
              store.setPreview({ cameraId: id, cameraIds: [id] })
              store.selectCamera(id)
            }}
          >
            {cameras.length === 0 ? <option value="">无机位</option> : null}
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className="preview-select layout"
          value={layout}
          title="分屏布局"
          onChange={(e) => {
            const nextLayout = normalizePreviewLayout(e.target.value)
            const nextFree =
              nextLayout === 'free' ? normalizeFreePreviewGrid(preview.free ?? DEFAULT_FREE_GRID) : free
            const slots = previewSlotCount(nextLayout, nextFree)
            const nextIds = normalizeCameraSlots(
              nextLayout,
              preview.cameraIds ?? [],
              cameras.map((camera) => camera.id),
              preview.cameraId ?? undefined,
              slots,
            )
            const store = useStore.getState()
            store.setPreview({
              layout: nextLayout,
              free: nextFree,
              cameraIds: nextIds,
              cameraId: nextIds[0] ?? preview.cameraId,
            })
          }}
        >
          {PREVIEW_LAYOUTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {layout === 'free' ? (
          <>
            <select
              className="preview-select free-size"
              value={free.cols}
              title="自由分屏列数"
              onChange={(event) => changeFreeSize(Number(event.target.value), free.rows)}
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  {value} 列
                </option>
              ))}
            </select>
            <select
              className="preview-select free-size"
              value={free.rows}
              title="自由分屏行数"
              onChange={(event) => changeFreeSize(free.cols, Number(event.target.value))}
            >
              {[1, 2].map((value) => (
                <option key={value} value={value}>
                  {value} 行
                </option>
              ))}
            </select>
          </>
        ) : null}
        <select
          className="preview-select ratio"
          value={aspect}
          title="画幅比例"
          onChange={(e) => changeAspect(e.target.value as AspectId)}
        >
          {ASPECT_ORDER.map((a) => (
            <option key={a} value={a}>
              {ASPECTS[a].label}
            </option>
          ))}
        </select>
        <div className="preview-head-spacer" />
        <button
          className="icon-btn tiny"
          title="隐藏预览窗"
          onClick={() => useStore.getState().setPreview({ visible: false })}
        >
          <IconEyeOff size={15} />
        </button>
        <button className="icon-btn tiny" title="恢复默认位置" onClick={resetPosition}>
          <IconReset size={15} />
        </button>
      </div>

      <div className="preview-body" ref={bodyRef}>
        <div
          className="preview-frame"
          ref={frameRef}
          style={{ width: frame.w || 1, height: frame.h || 1 }}
        >
          {layout !== 'single' ? (
            <div className={`preview-grid layout-${layout}`}>
              {cells.map((cell) => (
                <div
                  key={cell.index}
                  className={`preview-cell ${cell.index >= layoutMeta.slots ? 'empty' : ''}`}
                  style={{
                    left: `${cell.x * 100}%`,
                    top: `${cell.y * 100}%`,
                    width: `${cell.w * 100}%`,
                    height: `${cell.h * 100}%`,
                  }}
                >
                  {cell.index < layoutMeta.slots ? (
                    <select
                      className="preview-cell-select"
                      value={slotIds[cell.index] ?? ''}
                      disabled={cameras.length === 0}
                      title={`第 ${cell.index + 1} 格机位`}
                      onChange={(event) => {
                        const id = event.target.value
                        const next = [...slotIds]
                        next[cell.index] = id
                        const store = useStore.getState()
                        store.setPreview({
                          cameraIds: next,
                          cameraId: id,
                        })
                        store.selectCamera(id)
                      }}
                    >
                      {cameras.length === 0 ? <option value="">无机位</option> : null}
                      {cameras.map((camera) => (
                        <option key={camera.id} value={camera.id}>
                          {camera.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="preview-cell-empty">空</span>
                  )}
                </div>
              ))}
              {layout === 'free'
                ? free.colSizes.slice(0, -1).map((_, index) => {
                    const left = free.colSizes
                      .slice(0, index + 1)
                      .reduce((sum, value) => sum + value, 0)
                    return (
                      <div
                        key={`col-${index}`}
                        className="preview-divider vertical"
                        style={{ left: `${left * 100}%` }}
                        title="拖动调整列宽（吸附 25 / 50 / 75%）"
                        onPointerDown={startDivider('col', index)}
                        onPointerMove={moveDivider}
                        onPointerUp={endDivider}
                        onPointerCancel={endDivider}
                      />
                    )
                  })
                : null}
              {layout === 'free'
                ? free.rowSizes.slice(0, -1).map((_, index) => {
                    const top = free.rowSizes
                      .slice(0, index + 1)
                      .reduce((sum, value) => sum + value, 0)
                    return (
                      <div
                        key={`row-${index}`}
                        className="preview-divider horizontal"
                        style={{ top: `${top * 100}%` }}
                        title="拖动调整行高（吸附 25 / 50 / 75%）"
                        onPointerDown={startDivider('row', index)}
                        onPointerMove={moveDivider}
                        onPointerUp={endDivider}
                        onPointerCancel={endDivider}
                      />
                    )
                  })
                : null}
            </div>
          ) : null}
        </div>
        {cameras.length === 0 ? <div className="preview-empty">添加机位后在这里看到画面</div> : null}
      </div>

      <div
        className="preview-resize"
        title="拖动缩放"
        onPointerDown={begin('resize')}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  )
}
