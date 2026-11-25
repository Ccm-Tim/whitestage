import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '../store/useStore'
import type { ProjectRecord } from '../storage/db'
import { ASPECTS } from '../core/constants'
import { formatRelative } from './format'
import { Brand, LogoMark } from './Logo'
import { IconFilm, IconFolder, IconPlus, IconTrash } from './Icons'
import { Modal } from './Modal'

const AUTOSAVE_OPTIONS = [1, 5, 10, 15, 30, 60]

export function StartScreen() {
  const history = useStore((s) => s.history)
  const autosaveMinutes = useStore((s) => s.autosaveMinutes)
  const createNewProject = useStore((s) => s.createNewProject)
  const importProject = useStore((s) => s.importProject)
  const openProject = useStore((s) => s.openProject)
  const deleteHistory = useStore((s) => s.deleteHistory)
  const setAutosaveMinutes = useStore((s) => s.setAutosaveMinutes)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('未命名项目')
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (createOpen) {
      setName('未命名项目')
      window.setTimeout(() => {
        nameRef.current?.focus()
        nameRef.current?.select()
      }, 30)
    }
  }, [createOpen])

  const submitCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      await createNewProject(name)
      setCreateOpen(false)
    } finally {
      setCreating(false)
    }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importProject(file)
  }

  return (
    <div className="start-screen">
      <div className="start-bg" />
      <div className="start-grid" />
      <div className="start-glow start-glow-a" />
      <div className="start-glow start-glow-b" />

      <header className="start-top">
        <Brand />
        <div className="start-top-right">
          <span className="chip soft">M6 · 撤销 / 收尾</span>
          <span className="local-note">
            <i className="status-dot" />
            本地存储 · 无需联网
          </span>
        </div>
      </header>

      <main className="start-main">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-line" />
              轻量级 3D 预演 · 白膜 / 绿幕 / 蓝幕
            </div>
            <h1>
              先把镜头摆好，
              <br />
              <em>再让画面发生。</em>
            </h1>
            <p className="hero-sub">
              一个无限延展的纯色舞台，摆上机位、人偶和道具，实时看到成片画面。
              <br />
              所有工程都保存在这台电脑的浏览器里。
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-lg" onClick={() => setCreateOpen(true)}>
                <IconPlus size={18} />
                新建项目
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => fileRef.current?.click()}>
                <IconFolder size={17} />
                导入项目
              </button>
            </div>
            <div className="hero-meta">
              支持 <code>.wsp</code> 工程包 · 自动保存 · 本地历史
            </div>
          </div>

          <div className="hero-stage" aria-hidden="true">
            <div className="stage-floor" />
            <div className="stage-figure">
              <i className="fg-head" />
              <i className="fg-body" />
              <i className="fg-arm left" />
              <i className="fg-arm right" />
              <i className="fg-leg left" />
              <i className="fg-leg right" />
            </div>
            <div className="stage-camera">
              <i className="cam-body" />
              <i className="cam-lens" />
            </div>
            <div className="stage-frustum" />
            <div className="stage-caption">
              <span className="live-dot" />
              PREVIEW 16:9
            </div>
          </div>
        </section>

        <section className="recent">
          <div className="recent-head">
            <h2>最近项目</h2>
            <span className="recent-count">{history.length} 个工程</span>
          </div>
          {history.length === 0 ? (
            <div className="empty-history">
              <LogoMark size={42} />
              <p>还没有项目</p>
              <span>新建一个舞台，或导入已有的 .wsp 工程包</span>
            </div>
          ) : (
            <div className="history-grid">
              {history.map((item) => (
                <article key={item.id} className="history-card" onClick={() => void openProject(item.id)}>
                  <div className="history-thumb">
                    {item.thumb ? (
                      <img src={item.thumb} alt="" />
                    ) : (
                      <div className="thumb-empty">
                        <IconFilm size={22} />
                      </div>
                    )}
                    <span className="history-badge">{ASPECTS[item.json?.output?.aspect ?? '16:9']?.label}</span>
                  </div>
                  <div className="history-body">
                    <div className="history-name">{item.name}</div>
                    <div className="history-meta">
                      {formatRelative(item.updatedAt)} · {item.json?.cameras?.length ?? 0} 机位 ·{' '}
                      {item.json?.objects?.length ?? 0} 对象
                    </div>
                  </div>
                  <button
                    className="history-del"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(item)
                    }}
                  >
                    <IconTrash size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="start-settings">
          <div className="setting-inline">
            <span className="setting-label">自动保存</span>
            <select
              className="select compact"
              value={autosaveMinutes}
              onChange={(e) => void setAutosaveMinutes(Number(e.target.value))}
            >
              {AUTOSAVE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  每 {m} 分钟
                </option>
              ))}
            </select>
            <span className="setting-hint">工程自动写入本地数据库</span>
          </div>
          <div className="start-build">WhiteStage · 本地版 v0.1 · M6</div>
        </section>
      </main>

      <input ref={fileRef} type="file" accept=".wsp,.zip" style={{ display: 'none' }} onChange={onFile} />

      <Modal
        open={createOpen}
        title="新建项目"
        subtitle="创建一个纯色白膜舞台，稍后可以随时更换背景。"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={() => void submitCreate()} disabled={creating}>
              创建并进入
            </button>
          </>
        }
      >
        <label className="modal-label">项目名称</label>
        <input
          ref={nameRef}
          className="text-input lg"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitCreate()
          }}
        />
        <p className="modal-note">默认输出画幅 16:9，可在编辑器内切换。</p>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="删除历史记录？"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!deleteTarget) return
                const id = deleteTarget.id
                setDeleteTarget(null)
                await deleteHistory(id)
              }}
            >
              确认删除
            </button>
          </>
        }
      >
        <p className="modal-text">
          即将删除「<b>{deleteTarget?.name}</b>」的本地记录。
        </p>
        <div className="warn-box">
          <b>删除后无法找回。</b>
          该工程的场景、机位和全部设置都会从这台电脑上移除，建议先导出 .wsp 工程包备份。
        </div>
      </Modal>
    </div>
  )
}
