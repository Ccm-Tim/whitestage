import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { ASPECTS } from '../core/constants'
import { formatClock } from './format'
import { IconBack, IconDownload, IconFilm, IconRedo, IconSave, IconUndo } from './Icons'

export function TopBar({
  saving,
  onBack,
  onSave,
  onExport,
  onExportVideo,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  saving: boolean
  onBack: () => void
  onSave: () => void
  onExport: () => void
  onExportVideo: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const project = useStore((s) => s.project)
  const dirty = useStore((s) => s.dirty)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const update = useStore((s) => s.update)
  const [name, setName] = useState(project?.name ?? '')

  useEffect(() => {
    setName(project?.name ?? '')
  }, [project?.id, project?.name])

  if (!project) return null

  const commit = () => {
    const next = name.trim() || '未命名项目'
    setName(next)
    if (next !== project.name) update((p) => { p.name = next })
  }

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onBack} title="返回首页（自动保存）">
        <IconBack size={19} />
      </button>
      <div className="topbar-divider" />
      <div className="topbar-id">
        <input
          className="project-name-input"
          value={name}
          maxLength={60}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setName(project.name)
              e.currentTarget.blur()
            }
          }}
        />
        <div
          className={`save-state ${dirty ? 'is-dirty' : ''}`}
          title="自动保存位置是本机浏览器 IndexedDB，不会自动生成磁盘文件；需要 .wsp 文件请点“导出工程”。"
        >
          <i />
          {saving
            ? '正在保存…'
            : dirty
              ? '有未保存的更改'
              : lastSavedAt
                ? `已保存 ${formatClock(lastSavedAt)}`
                : '已保存'}
        </div>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-chips">
        <span className="chip">{project.output.width} × {project.output.height}</span>
        <span className="chip">{ASPECTS[project.output.aspect].label}</span>
        <span className="chip">{project.output.fps} fps</span>
      </div>

      <button className="icon-btn" onClick={onUndo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
        <IconUndo size={17} />
      </button>
      <button className="icon-btn" onClick={onRedo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z / Ctrl+Y)">
        <IconRedo size={17} />
      </button>
      <div className="topbar-divider" />

      <button className="btn btn-ghost" onClick={onSave} disabled={saving} title="保存到本地（Ctrl+S）">
        <IconSave size={16} />
        保存
      </button>
      <button className="btn btn-secondary" onClick={onExportVideo} title="逐帧导出视频">
        <IconFilm size={16} />
        导出视频
      </button>
      <button className="btn btn-secondary" onClick={onExport} title="导出 .wsp 工程文件（可选择保存位置）">
        <IconDownload size={16} />
        导出工程
      </button>
    </header>
  )
}
