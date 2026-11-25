import type { FreePreviewGrid } from './types'

export type { FreePreviewGrid } from './types'

export type PreviewLayout = 'single' | 'dual' | 'quad' | 'five' | 'free'

export interface PreviewLayoutMeta {
  id: PreviewLayout
  label: string
  cols: number
  rows: number
  slots: number
}

export interface PreviewCell {
  x: number
  y: number
  w: number
  h: number
  index: number
}

export const PREVIEW_LAYOUTS: PreviewLayoutMeta[] = [
  { id: 'single', label: '单机位', cols: 1, rows: 1, slots: 1 },
  { id: 'dual', label: '双机位', cols: 2, rows: 1, slots: 2 },
  { id: 'quad', label: '四机位', cols: 2, rows: 2, slots: 4 },
  { id: 'five', label: '五机位', cols: 3, rows: 2, slots: 5 },
  { id: 'free', label: '自由分屏', cols: 2, rows: 2, slots: 4 },
]

export const DEFAULT_FREE_GRID: FreePreviewGrid = {
  cols: 2,
  rows: 2,
  colSizes: [0.5, 0.5],
  rowSizes: [0.5, 0.5],
}

export function previewLayoutMeta(layout: PreviewLayout): PreviewLayoutMeta {
  return PREVIEW_LAYOUTS.find((item) => item.id === layout) ?? PREVIEW_LAYOUTS[0]
}

export function normalizeFreePreviewGrid(input: unknown): FreePreviewGrid {
  const raw = (input ?? {}) as Partial<FreePreviewGrid>
  const cols = Math.max(1, Math.min(3, Math.round(Number(raw.cols) || 2)))
  const rows = Math.max(1, Math.min(2, Math.round(Number(raw.rows) || 2)))
  const rawCols = Array.isArray(raw.colSizes) ? raw.colSizes : []
  const rawRows = Array.isArray(raw.rowSizes) ? raw.rowSizes : []
  const fit = (sizes: unknown[], count: number): number[] => {
    const values = Array.from({ length: count }, (_, index) =>
      Math.max(0.08, Number(sizes[index]) || 1 / count),
    )
    const total = values.reduce((sum, value) => sum + value, 0)
    return values.map((value) => value / total)
  }
  return {
    cols,
    rows,
    colSizes: fit(rawCols, cols),
    rowSizes: fit(rawRows, rows),
  }
}

export function previewSlotCount(layout: PreviewLayout, free?: FreePreviewGrid): number {
  if (layout === 'free') {
    const grid = normalizeFreePreviewGrid(free)
    return Math.min(5, grid.cols * grid.rows)
  }
  return previewLayoutMeta(layout).slots
}

/**
 * 归一化格子（左上原点）。
 * free 使用自定义列宽 / 行高；其余布局使用固定网格。
 */
export function previewCells(layout: PreviewLayout, free?: FreePreviewGrid): PreviewCell[] {
  const grid = normalizeFreePreviewGrid(free)
  if (layout === 'free') {
    const cells: PreviewCell[] = []
    const cols = grid.cols
    const rows = grid.rows
    let y = 0
    for (let row = 0; row < rows; row += 1) {
      let x = 0
      for (let col = 0; col < cols; col += 1) {
        cells.push({
          x,
          y,
          w: grid.colSizes[col],
          h: grid.rowSizes[row],
          index: row * cols + col,
        })
        x += grid.colSizes[col]
      }
      y += grid.rowSizes[row]
    }
    return cells
  }

  const meta = previewLayoutMeta(layout)
  const cells: PreviewCell[] = []
  const total = meta.id === 'five' ? 6 : meta.cols * meta.rows
  for (let index = 0; index < total; index += 1) {
    const col = index % meta.cols
    const row = Math.floor(index / meta.cols)
    cells.push({
      x: col / meta.cols,
      y: row / meta.rows,
      w: 1 / meta.cols,
      h: 1 / meta.rows,
      index,
    })
  }
  return cells
}

export function normalizePreviewLayout(value: unknown): PreviewLayout {
  return value === 'dual' ||
    value === 'quad' ||
    value === 'five' ||
    value === 'free'
    ? value
    : 'single'
}

export function normalizeCameraSlots(
  layout: PreviewLayout,
  ids: string[],
  cameraIds: string[],
  primary?: string,
  slotsOverride?: number,
): string[] {
  const slots = Math.max(1, slotsOverride ?? previewSlotCount(layout))
  const valid = ids.filter((id) => cameraIds.includes(id))
  if (slots === 1) {
    const only = primary && cameraIds.includes(primary) ? primary : valid[0] ?? cameraIds[0]
    return only ? [only] : []
  }
  const result = valid.slice(0, slots)
  for (const id of cameraIds) {
    if (result.length >= slots) break
    if (!result.includes(id)) result.push(id)
  }
  while (result.length < slots && cameraIds.length > 0) {
    result.push(cameraIds[result.length % cameraIds.length])
  }
  return result
}
