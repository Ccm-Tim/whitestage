import { useEffect, useRef, useState } from 'react'
import type { Engine } from '../engine/Engine'
import { downloadBlob, sanitizeFileName } from '../storage/projectFile'
import { useStore } from '../store/useStore'
import { exportVideo, type VideoExportProgress, type VideoFormat, type VideoSource } from '../export/video'
import { Field, NumField, Readout } from './fields'
import { Modal } from './Modal'

export function VideoExportDialog({
  open,
  engine,
  onClose,
}: {
  open: boolean
  engine: Engine | null
  onClose: () => void
}) {
  const project = useStore((s) => s.project)
  const toast = useStore((s) => s.toast)
  const [format, setFormat] = useState<VideoFormat>('webm')
  const [source, setSource] = useState<VideoSource>('camera')
  const [width, setWidth] = useState(project?.output.width ?? 1920)
  const [height, setHeight] = useState(project?.output.height ?? 1080)
  const [fps, setFps] = useState(project?.output.fps ?? 24)
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState((project?.timeline.durationFrames ?? 240) - 1)
  const [bitrate, setBitrate] = useState(8_000_000)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<VideoExportProgress | null>(null)
  const [message, setMessage] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open || !project) return
    setWidth(project.output.width)
    setHeight(project.output.height)
    setFps(project.output.fps)
    setFrom(0)
    setTo(Math.max(0, project.timeline.durationFrames - 1))
    setProgress(null)
    setMessage('')
  }, [open, project?.id, project?.output.width, project?.output.height, project?.output.fps, project?.timeline.durationFrames])

  if (!project) return null
  const totalFrames = Math.max(1, to - from + 1)
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)
  const ratio = project.output.width / Math.max(1, project.output.height)
  const resolutionOptions = Array.from(
    new Set([
      `${project.output.width}x${project.output.height}`,
      `${even(project.output.width / 2)}x${even(project.output.height / 2)}`,
      `1280x${even(1280 / ratio)}`,
      `854x${even(854 / ratio)}`,
    ]),
  )

  const start = async () => {
    if (!engine || busy) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setProgress({ frame: 0, total: totalFrames, stage: '准备中' })
    setMessage('')
    try {
      const result = await exportVideo(
        engine,
        { format, source, width, height, fps, from, to, bitrate },
        setProgress,
        controller.signal,
      )
      downloadBlob(result.blob, `${sanitizeFileName(project.name)}.${result.extension}`)
      setMessage(`导出完成：${(result.blob.size / 1024 / 1024).toFixed(1)} MB`)
      toast('视频已导出', 'success')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessage('已取消导出')
      } else {
        const text = err instanceof Error ? err.message : String(err)
        setMessage('导出失败：' + text)
        toast('视频导出失败：' + text, 'error')
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  return (
    <Modal
      open={open}
      title="导出视频"
      subtitle="逐帧渲染主预览机位或当前分屏；视频编码依赖 Chrome / Edge WebCodecs"
      onClose={() => {
        if (busy) {
          abortRef.current?.abort()
          return
        }
        onClose()
      }}
      width={470}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            关闭
          </button>
          {busy ? (
            <button className="btn btn-danger-ghost" onClick={() => abortRef.current?.abort()}>
              取消导出
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void start()} disabled={!engine}>
              开始导出
            </button>
          )}
        </>
      }
    >
      <div className="export-form">
        <Field label="格式">
          <select
            className="select"
            value={format}
            onChange={(event) => setFormat(event.target.value as VideoFormat)}
            disabled={busy}
          >
            <option value="webm">WebM（VP9 / VP8）</option>
            <option value="mp4">MP4（H.264，浏览器支持时）</option>
            <option value="mov">MOV（H.264，QuickTime 兼容）</option>
            <option value="flv">FLV（H.264）</option>
            <option value="png">PNG 序列（.zip）</option>
          </select>
        </Field>
        <Field label="画面来源">
          <select
            className="select"
            value={source}
            onChange={(event) => setSource(event.target.value as VideoSource)}
            disabled={busy}
          >
            <option value="camera">主预览机位（单画面）</option>
            <option value="preview">当前分屏布局（逐格合成）</option>
          </select>
        </Field>
        <Field label="分辨率">
          <select
            className="select"
            value={`${width}x${height}`}
            onChange={(event) => {
              const [nextW, nextH] = event.target.value.split('x').map(Number)
              setWidth(nextW)
              setHeight(nextH)
            }}
            disabled={busy}
          >
            {resolutionOptions.map((value) => (
              <option key={value} value={value}>
                {value.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </Field>
        <div className="export-row">
          <Field label="帧率">
            <select
              className="select"
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
              disabled={busy}
            >
              {[12, 24, 25, 30, 60].map((value) => (
                <option key={value} value={value}>
                  {value} fps
                </option>
              ))}
            </select>
          </Field>
          <Field label="码率">
            <select
              className="select"
              value={bitrate}
              onChange={(event) => setBitrate(Number(event.target.value))}
              disabled={busy}
            >
              {[4_000_000, 8_000_000, 12_000_000, 20_000_000].map((value) => (
                <option key={value} value={value}>
                  {value / 1_000_000} Mbps
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="export-row">
          <Field label="起始帧">
            <NumField
              value={from}
              min={0}
              max={project.timeline.durationFrames - 1}
              step={1}
              digits={0}
              disabled={busy}
              onChange={(value) => setFrom(Math.max(0, Math.min(to, Math.round(value))))}
            />
          </Field>
          <Field label="结束帧">
            <NumField
              value={to}
              min={0}
              max={project.timeline.durationFrames - 1}
              step={1}
              digits={0}
              disabled={busy}
              onChange={(value) => setTo(Math.max(from, Math.min(project.timeline.durationFrames - 1, Math.round(value))))}
            />
          </Field>
        </div>
        <Readout>
          {totalFrames} 帧 · {(totalFrames / Math.max(1, fps)).toFixed(2)} 秒 ·{' '}
          {source === 'preview' ? '当前分屏布局' : '主预览机位'}
        </Readout>

        {busy || progress ? (
          <div className="export-progress">
            <div className="export-progress-head">
              <span>{progress?.stage ?? '准备中'}</span>
              <span>
                {progress ? `${progress.frame} / ${progress.total}` : ''}
              </span>
            </div>
            <div className="export-bar">
              <i
                style={{
                  width: `${progress ? Math.min(100, (progress.frame / Math.max(1, progress.total)) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        {message ? <p className="note">{message}</p> : null}
        <p className="note">
          WebM / MP4 / MOV / FLV 使用离线逐帧编码；PNG 序列会打包成 zip，适合再进剪辑软件。分屏导出会按当前布局逐格合成，并复用每个机位的实时景深。MOV 使用 H.264 ISO 兼容封装，FLV 使用内置 H.264 FLV muxer。
        </p>
      </div>
    </Modal>
  )
}
