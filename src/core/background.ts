import type { BackgroundUploadKind } from './types'

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  preview: string
}

const PREVIEW_MAX = 240
const OUTPUT_W = 2048
const OUTPUT_H = 1024

function canvasPreview(canvas: HTMLCanvasElement, max = PREVIEW_MAX): string {
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height))
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(canvas, 0, 0, width, height)
  return out.toDataURL('image/jpeg', 0.65)
}

function canvasBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败'))),
      type,
      quality,
    )
  })
}

/** 读取图片、按最长边降采样并生成缩略图 */
export async function prepareImage(file: File, maxDim = 4096): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file)
  const width = bitmap.width
  const height = bitmap.height
  const scale = Math.min(1, maxDim / Math.max(width, height))
  const drawWidth = Math.max(1, Math.round(width * scale))
  const drawHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = drawWidth
  canvas.height = drawHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('无法创建图片画布')
  }
  ctx.drawImage(bitmap, 0, 0, drawWidth, drawHeight)
  bitmap.close()
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await canvasBlob(canvas, type, 0.9)
  return { blob, width, height, preview: canvasPreview(canvas) }
}

/** 根据宽高比给出背景类型建议（仍然需要用户确认） */
export function detectBackgroundKind(
  width: number,
  height: number,
): { kind: BackgroundUploadKind; note: string } {
  const ratio = width / Math.max(1, height)
  if (Math.abs(ratio - 2) < 0.15) {
    return {
      kind: 'pano-360',
      note: '宽高比约 2:1，通常是 360° 等距柱状全景；如果实际是 180° 素材，请在下面改选。',
    }
  }
  if (Math.abs(ratio - 1) < 0.1) {
    return {
      kind: 'image-screen',
      note: '接近 1:1，可能是星球全景或普通图片；如果是星球全景，请选最后一项。',
    }
  }
  return {
    kind: 'image-screen',
    note: '已按普通 2D 图片处理；如果它是全景素材，请在下面改选。',
  }
}

/** 把 180° 素材放进 360° 等距柱状的左半边，另一半用补色填满 */
export async function build180Equirect(
  source: Blob,
  width: number,
  height: number,
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(source)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_W
  canvas.height = OUTPUT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('无法创建 180° 全景画布')
  }
  ctx.fillStyle = '#eef0f2'
  ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H)
  const aspect = Math.max(0.2, width / Math.max(1, height))
  const vfov = Math.min(180, Math.max(30, 180 / aspect))
  const destH = Math.round(OUTPUT_H * (vfov / 180))
  const destY = Math.round((OUTPUT_H - destH) / 2)
  ctx.drawImage(bitmap, 0, destY, OUTPUT_W / 2, destH)
  bitmap.close()
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.9)
  return { blob, width: OUTPUT_W, height: OUTPUT_H, preview: canvasPreview(canvas) }
}

/** 星球型全景的近似逆投影展开：中心=地面，半径=外圈，输出 2:1 等距柱状 */
export async function unwrapLittlePlanet(source: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(source)
  const srcMax = 1024
  const scale = Math.min(1, srcMax / Math.max(bitmap.width, bitmap.height))
  const srcW = Math.max(1, Math.round(bitmap.width * scale))
  const srcH = Math.max(1, Math.round(bitmap.height * scale))
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = srcW
  srcCanvas.height = srcH
  const srcCtx = srcCanvas.getContext('2d')
  if (!srcCtx) {
    bitmap.close()
    throw new Error('无法读取星球全景')
  }
  srcCtx.drawImage(bitmap, 0, 0, srcW, srcH)
  bitmap.close()
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data

  const outCanvas = document.createElement('canvas')
  outCanvas.width = OUTPUT_W
  outCanvas.height = OUTPUT_H
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) throw new Error('无法创建展开画布')
  const out = outCtx.createImageData(OUTPUT_W, OUTPUT_H)
  const cx = srcW * 0.5
  const cy = srcH * 0.5
  const radius = Math.min(srcW, srcH) * 0.5
  const thetaMax = (110 * Math.PI) / 180
  const tanHalf = Math.tan(thetaMax / 2)

  for (let y = 0; y < OUTPUT_H; y++) {
    const lat = (0.5 - y / OUTPUT_H) * Math.PI
    const theta = ((lat + Math.PI / 2) / Math.PI) * thetaMax
    const r = (radius * Math.tan(theta / 2)) / tanHalf
    for (let x = 0; x < OUTPUT_W; x++) {
      const lon = (x / OUTPUT_W) * Math.PI * 2 - Math.PI
      const sx = Math.min(srcW - 1, Math.max(0, Math.round(cx + r * Math.cos(lon))))
      const sy = Math.min(srcH - 1, Math.max(0, Math.round(cy + r * Math.sin(lon))))
      const si = (sy * srcW + sx) * 4
      const di = (y * OUTPUT_W + x) * 4
      out.data[di] = srcData[si]
      out.data[di + 1] = srcData[si + 1]
      out.data[di + 2] = srcData[si + 2]
      out.data[di + 3] = 255
    }
  }
  outCtx.putImageData(out, 0, 0)
  const blob = await canvasBlob(outCanvas, 'image/jpeg', 0.9)
  return { blob, width: OUTPUT_W, height: OUTPUT_H, preview: canvasPreview(outCanvas) }
}
