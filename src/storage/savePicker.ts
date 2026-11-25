export interface SaveFileHandleLike {
  name: string
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

interface PickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
  }) => Promise<SaveFileHandleLike>
}

export type SaveFilePickResult =
  | { status: 'picked'; handle: SaveFileHandleLike }
  | { status: 'cancelled' }
  | { status: 'unsupported' }

export function canPickSaveFile(): boolean {
  return typeof (window as PickerWindow).showSaveFilePicker === 'function'
}

/**
 * 必须在用户点击的同步调用栈里调用（浏览器安全限制）。
 * 用户取消返回 cancelled；不支持或权限/环境异常返回 unsupported，让调用方回退到普通下载。
 */
export async function pickProjectFile(suggestedName: string): Promise<SaveFilePickResult> {
  const picker = (window as PickerWindow).showSaveFilePicker
  if (!picker) return { status: 'unsupported' }
  try {
    const handle = await picker({
      suggestedName,
    })
    return { status: 'picked', handle }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'cancelled' }
    }
    return { status: 'unsupported' }
  }
}

export async function writeBlobToHandle(handle: SaveFileHandleLike, blob: Blob): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
}
