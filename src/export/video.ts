import { zipSync } from 'fflate'
import type { Engine } from '../engine/Engine'
import { useStore } from '../store/useStore'
import {
  normalizeCameraSlots,
  normalizeFreePreviewGrid,
  normalizePreviewLayout,
  previewCells,
  previewSlotCount,
} from '../core/preview'
import { FlvMuxer } from './flvMuxer'
import { activeCameraIdAt } from '../core/timeline'

export type VideoFormat = 'webm' | 'mp4' | 'mov' | 'flv' | 'png'
export type VideoSource = 'camera' | 'preview'

export interface VideoExportOptions {
  format: VideoFormat
  source: VideoSource
  width: number
  height: number
  fps: number
  from: number
  to: number
  bitrate: number
}

export interface VideoExportProgress {
  frame: number
  total: number
  stage: string
}

export interface VideoExportResult {
  blob: Blob
  extension: string
  mime: string
}

interface EncodedChunkLike {
  byteLength: number
}

interface VideoEncoderLike {
  encodeQueueSize: number
  configure: (config: Record<string, unknown>) => void
  encode: (
    frame: { close: () => void },
    options?: { keyFrame?: boolean },
  ) => void
  flush: () => Promise<void>
  close: () => void
}

interface VideoEncoderConstructor {
  new (init: {
    output: (chunk: EncodedChunkLike, meta?: unknown) => void
    error: (error: Error) => void
  }): VideoEncoderLike
  isConfigSupported: (
    config: Record<string, unknown>,
  ) => Promise<{ supported: boolean }>
}

interface VideoFrameConstructor {
  new (
    source: HTMLCanvasElement,
    init: { timestamp: number; duration: number },
  ): { close: () => void }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function abortError() {
  return new DOMException('导出已取消', 'AbortError')
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function renderFrame(
  engine: Engine,
  cameraId: string,
  frame: number,
  width: number,
  height: number,
  source: VideoSource,
): Promise<HTMLCanvasElement> {
  const store = useStore.getState()
  store.setPlaying(false)
  store.setPlayhead(frame)
  engine.syncProject(useStore.getState().project!)
  await nextFrame()
  const project = useStore.getState().project
  if (!project) throw new Error('没有打开的工程')
  const cameraFor = (id: string) => project.cameras.find((camera) => camera.id === id)
  const activeCameraId = activeCameraIdAt(project, frame) ?? cameraId

  if (source === 'camera') {
    const camera = cameraFor(activeCameraId)
    const canvas = camera?.dof
      ? engine.renderCameraFrameWithDof(activeCameraId, width, height)
      : engine.renderCameraFrame(activeCameraId, width, height)
    if (!canvas) throw new Error('当前机位不可渲染')
    return canvas
  }

  const preview = project.ui.preview
  const layout = normalizePreviewLayout(preview.layout)
  const free = normalizeFreePreviewGrid(preview.free)
  const slots = previewSlotCount(layout, free)
  const ids =
    layout === 'single'
      ? [activeCameraId]
      : normalizeCameraSlots(
          layout,
          preview.cameraIds ?? [],
          project.cameras.map((camera) => camera.id),
          preview.cameraId ?? undefined,
          slots,
        )
  const cells = previewCells(layout, free)
  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const ctx = output.getContext('2d')
  if (!ctx) throw new Error('无法创建导出画布')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  for (let index = 0; index < Math.min(slots, cells.length); index += 1) {
    const id = ids[index]
    if (!id) continue
    const cell = cells[index]
    const cellW = Math.max(2, Math.round(cell.w * width))
    const cellH = Math.max(2, Math.round(cell.h * height))
    const camera = cameraFor(id)
    const cellCanvas = camera?.dof
      ? engine.renderCameraFrameWithDof(id, cellW, cellH)
      : engine.renderCameraFrame(id, cellW, cellH)
    if (!cellCanvas) continue
    ctx.drawImage(
      cellCanvas,
      Math.round(cell.x * width),
      Math.round(cell.y * height),
      cellW,
      cellH,
    )
  }
  return output
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), 'image/png'),
  )
  if (!blob) throw new Error('PNG 编码失败')
  return new Uint8Array(await blob.arrayBuffer())
}

export async function exportVideo(
  engine: Engine,
  options: VideoExportOptions,
  onProgress: (progress: VideoExportProgress) => void,
  signal?: AbortSignal,
): Promise<VideoExportResult> {
  const store = useStore.getState()
  const project = store.project
  if (!project) throw new Error('没有打开的工程')
  const cameraId =
    project.ui.preview.cameraId ?? project.ui.preview.cameraIds[0] ?? project.cameras[0]?.id
  if (!cameraId) throw new Error('没有可用机位')

  const width = even(options.width)
  const height = even(options.height)
  const fps = Math.max(1, Math.round(options.fps || project.output.fps || 24))
  const from = Math.max(0, Math.min(project.timeline.durationFrames - 1, Math.round(options.from)))
  const to = Math.max(from, Math.min(project.timeline.durationFrames - 1, Math.round(options.to)))
  const total = to - from + 1
  const previousFrame = store.playheadFrame
  const fileName = project.name || '未命名'
  store.setPlaying(false)

  try {
    if (options.format === 'png') {
      const files: Record<string, Uint8Array> = {}
      for (let index = 0; index < total; index += 1) {
        if (signal?.aborted) throw abortError()
        const frame = from + index
        const canvas = await renderFrame(engine, cameraId, frame, width, height, options.source)
        files[`frame_${String(frame).padStart(4, '0')}.png`] = await canvasToPng(canvas)
        onProgress({ frame: index + 1, total, stage: '渲染 PNG 帧' })
      }
      const zipped = zipSync(files, { level: 0 })
      return {
        blob: new Blob([zipped], { type: 'application/zip' }),
        extension: 'zip',
        mime: 'application/zip',
      }
    }

    const globalObject = window as unknown as {
      VideoEncoder?: VideoEncoderConstructor
      VideoFrame?: VideoFrameConstructor
    }
    const Encoder = globalObject.VideoEncoder
    const Frame = globalObject.VideoFrame
    if (!Encoder || !Frame) {
      throw new Error('当前浏览器不支持 WebCodecs，请用 Chrome / Edge，或选择 PNG 序列导出')
    }

    const candidates =
      options.format === 'webm'
        ? [
            { codec: 'vp09.00.10.08', muxerCodec: 'V_VP9' },
            { codec: 'vp8', muxerCodec: 'V_VP8' },
          ]
        : [
            { codec: 'avc1.42001f', muxerCodec: 'avc' },
            { codec: 'avc1.4d002a', muxerCodec: 'avc' },
          ]
    const isAvc = options.format !== 'webm'
    let selected: { codec: string; muxerCodec: string } | null = null
    for (const candidate of candidates) {
      const config: Record<string, unknown> = {
        codec: candidate.codec,
        width,
        height,
        bitrate: Math.max(500_000, options.bitrate || 6_000_000),
        framerate: fps,
      }
      if (isAvc) config.avc = { format: 'avc' }
      const support = await Encoder.isConfigSupported(config).catch(() => ({ supported: false }))
      if (support.supported) {
        selected = candidate
        break
      }
    }
    if (!selected) {
      throw new Error(
        isAvc
          ? '当前浏览器不支持 H.264 编码，请改用 WebM 或 PNG 序列'
          : '当前浏览器不支持 VP9/VP8 编码，请改用 PNG 序列',
      )
    }

    let muxer: {
      addVideoChunk: (chunk: EncodedChunkLike, meta?: unknown) => void
      finalize: () => void
    }
    let mp4Target: { buffer: ArrayBuffer } | null = null
    let flvMuxer: FlvMuxer | null = null
    if (options.format === 'flv') {
      flvMuxer = new FlvMuxer()
      muxer = flvMuxer as unknown as typeof muxer
    } else {
      const muxerModule = (options.format === 'webm'
        ? await import('webm-muxer')
        : await import('mp4-muxer')) as unknown as {
        Muxer: new (options: Record<string, unknown>) => {
          addVideoChunk: (chunk: EncodedChunkLike, meta?: unknown) => void
          finalize: () => void
        }
        ArrayBufferTarget: new () => { buffer: ArrayBuffer }
      }
      const target = new muxerModule.ArrayBufferTarget()
      mp4Target = target
      muxer = new muxerModule.Muxer(
        options.format === 'webm'
          ? {
              target,
              video: { codec: selected.muxerCodec, width, height, frameRate: fps },
              firstTimestampBehavior: 'offset',
            }
          : {
              target,
              video: { codec: selected.muxerCodec, width, height, frameRate: fps },
              fastStart: 'in-memory',
              firstTimestampBehavior: 'offset',
            },
      )
    }

    let encodeError: Error | null = null
    const encoder = new Encoder({
      output: (chunk, meta) => {
        if (flvMuxer) {
          flvMuxer.addVideoChunk(chunk as never, meta as never)
          return
        }
        muxer.addVideoChunk(chunk, meta)
      },
      error: (error) => {
        encodeError = error
      },
    })
    const config: Record<string, unknown> = {
      codec: selected.codec,
      width,
      height,
      bitrate: Math.max(500_000, options.bitrate || 6_000_000),
      framerate: fps,
      latencyMode: 'quality',
    }
    if (isAvc) config.avc = { format: 'avc' }
    encoder.configure(config)

    for (let index = 0; index < total; index += 1) {
      if (signal?.aborted) throw abortError()
      if (encodeError) throw encodeError
      const frameNumber = from + index
      const canvas = await renderFrame(engine, cameraId, frameNumber, width, height, options.source)
      const timestamp = Math.round((index * 1_000_000) / fps)
      const duration = Math.round(1_000_000 / fps)
      const frame = new Frame(canvas, { timestamp, duration })
      encoder.encode(frame, { keyFrame: index % Math.max(1, fps * 2) === 0 })
      frame.close()
      while (encoder.encodeQueueSize > 6) {
        if (signal?.aborted) throw abortError()
        await sleep(4)
      }
      onProgress({ frame: index + 1, total, stage: '编码视频' })
    }

    await encoder.flush()
    if (encodeError) throw encodeError
    muxer.finalize()
    if (options.format === 'flv' && flvMuxer) {
      const bytes = flvMuxer.finalize()
      return {
        blob: new Blob([bytes as unknown as BlobPart], { type: 'video/x-flv' }),
        extension: 'flv',
        mime: 'video/x-flv',
      }
    }
    const buffer = (mp4Target as unknown as { buffer: ArrayBuffer }).buffer
    const mime =
      options.format === 'webm'
        ? 'video/webm'
        : options.format === 'mov'
          ? 'video/quicktime'
          : 'video/mp4'
    return {
      blob: new Blob([buffer], { type: mime }),
      extension: options.format === 'mov' ? 'mov' : options.format,
      mime,
    }
  } finally {
    useStore.getState().setPlayhead(previousFrame)
    engine.syncProject(useStore.getState().project!)
  }
}
