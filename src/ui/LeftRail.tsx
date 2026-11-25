import { useStore } from '../store/useStore'
import {
  IconCamera,
  IconCursor,
  IconEye,
  IconEyeOff,
  IconGrid,
  IconInfo,
  IconMove,
  IconPlus,
  IconRotate,
  IconScale,
} from './Icons'
import type { ToolId } from '../core/types'

const TOOLS: { id: ToolId; icon: typeof IconCursor; label: string; disabled?: boolean }[] = [
  { id: 'select', icon: IconCursor, label: '选择 (Q)' },
  { id: 'translate', icon: IconMove, label: '移动 (W)' },
  { id: 'rotate', icon: IconRotate, label: '旋转 (E)' },
  { id: 'scale', icon: IconScale, label: '缩放 · M2 开放', disabled: true },
]

export function LeftRail() {
  const tool = useStore((s) => s.project?.ui.tool ?? 'select')
  const grid = useStore((s) => s.project?.stage.grid ?? true)
  const previewVisible = useStore((s) => s.project?.ui.preview.visible ?? true)
  const setTool = useStore((s) => s.setTool)
  const addCamera = useStore((s) => s.addCamera)
  const toggleStage = useStore((s) => s.toggleStage)
  const setPreview = useStore((s) => s.setPreview)

  return (
    <aside className="left-rail">
      <div className="rail-group">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className={`rail-btn ${tool === t.id ? 'active' : ''}`}
              data-tip={t.label}
              disabled={t.disabled}
              onClick={() => setTool(t.id)}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </div>

      <div className="rail-sep" />

      <div className="rail-group">
        <button className="rail-btn" data-tip="添加机位" onClick={addCamera}>
          <span className="rail-cam-add">
            <IconCamera size={18} />
            <i>
              <IconPlus size={9} />
            </i>
          </span>
        </button>
        <button
          className={`rail-btn ${grid ? 'active-soft' : ''}`}
          data-tip={grid ? '隐藏网格' : '显示网格'}
          onClick={() => toggleStage('grid')}
        >
          <IconGrid size={18} />
        </button>
        <button
          className={`rail-btn ${previewVisible ? 'active-soft' : ''}`}
          data-tip={previewVisible ? '隐藏预览窗' : '显示预览窗'}
          onClick={() => setPreview({ visible: !previewVisible })}
        >
          {previewVisible ? <IconEye size={18} /> : <IconEyeOff size={18} />}
        </button>
      </div>

      <div className="rail-spacer" />

      <button
        className="rail-btn"
        data-tip="快捷键：Q 选择 · W 移动 · E 旋转 · F 聚焦 · Ctrl+S 保存"
      >
        <IconInfo size={17} />
      </button>
    </aside>
  )
}
