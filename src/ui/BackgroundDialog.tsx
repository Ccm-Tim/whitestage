import { useEffect, useState } from 'react'
import type { BackgroundUploadKind } from '../core/types'
import { detectBackgroundKind } from '../core/background'
import { Modal } from './Modal'

const OPTIONS: {
  value: BackgroundUploadKind
  label: string
  desc: string
}[] = [
  {
    value: 'image-screen',
    label: '普通 2D 图片 · 屏幕贴片',
    desc: '永远正对镜头，每个机位都满幅，适合天空 / 背景贴片',
  },
  {
    value: 'image-plane',
    label: '普通 2D 图片 · 实体背景板',
    desc: '放进 3D 场景，镜头移动有视差，适合放在人物身后',
  },
  {
    value: 'pano-360',
    label: '360° 全景',
    desc: '等距柱状全景，镜头环视任何方向都正确',
  },
  {
    value: 'pano-180',
    label: '180° 全景',
    desc: '半环绕背景，背面用浅色补齐',
  },
  {
    value: 'planet-360',
    label: '星球全景 → 360°',
    desc: '近似逆投影展开为 360° 全景，边缘可能有拉伸',
  },
]

export function BackgroundDialog({
  open,
  fileName,
  previewUrl,
  width,
  height,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  fileName: string
  previewUrl: string
  width: number
  height: number
  busy: boolean
  onClose: () => void
  onConfirm: (kind: BackgroundUploadKind) => void
}) {
  const [kind, setKind] = useState<BackgroundUploadKind>('image-screen')
  const detection = detectBackgroundKind(width, height)
  const ratio = width / Math.max(1, height)

  useEffect(() => {
    if (!open) return
    setKind(detectBackgroundKind(width, height).kind)
  }, [open, width, height])

  return (
    <Modal
      open={open}
      width={560}
      title="确认背景类型"
      subtitle="图片已读取。请确认它是什么类型的背景，应用后仍可更换。"
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(kind)} disabled={busy}>
            {busy ? '正在处理…' : '应用背景'}
          </button>
        </>
      }
    >
      <div className="bg-dialog">
        <div className="bg-dialog-preview">
          {previewUrl ? <img src={previewUrl} alt="" /> : null}
        </div>
        <div className="bg-dialog-meta">
          <b>{fileName}</b>
          <span>
            {width} × {height} · 宽高比 {ratio.toFixed(2)} : 1
          </span>
          <p>{detection.note}</p>
        </div>
      </div>

      <div className="bg-choices">
        {OPTIONS.map((option) => (
          <label key={option.value} className={`bg-choice ${kind === option.value ? 'active' : ''}`}>
            <input
              type="radio"
              name="bg-kind"
              value={option.value}
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
              disabled={busy}
            />
            <span className="bg-choice-body">
              <b>{option.label}</b>
              <em>{option.desc}</em>
            </span>
          </label>
        ))}
      </div>

      {kind === 'planet-360' ? (
        <p className="note">
          星球全景没有标准格式，无法保证 100% 还原。这里做的是近似逆投影展开，建议应用后在预览窗里环视检查，必要时重新上传。
        </p>
      ) : null}
      {kind === 'pano-180' ? (
        <p className="note">180° 素材会放进 360° 环境的左半边，背面用浅色补齐，适合只朝一个方向拍的素材。</p>
      ) : null}
    </Modal>
  )
}
