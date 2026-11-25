import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import type {
  AspectId,
  BackgroundUploadKind,
  CameraConfig,
  LensTemplate,
  SensorId,
} from '../core/types'
import { ASPECTS, ASPECT_ORDER, BG_PRESETS, SENSORS } from '../core/constants'
import { fovFromFocal, lookAtRotation, round } from '../core/math'
import { targetLabel } from '../core/defaults'
import { BUILTIN_LENS_TEMPLATES, templateMatchesCamera } from '../core/lens'
import { Field, NumField, Readout, Section, SliderField, Toggle } from './fields'
import { IconCamera, IconPlus, IconTarget, IconTemplate, IconUpload } from './Icons'
import { Modal } from './Modal'
import { BackgroundDialog } from './BackgroundDialog'
import { ObjectInspector } from './ObjectInspector'
import { Watermark } from './Watermark'

const AUTOSAVE_OPTIONS = [1, 5, 10, 15, 30, 60]

type TemplateModalState = {
  mode: 'save' | 'rename' | 'delete'
  id?: string
  name: string
}

export function Inspector() {
  const project = useStore((s) => s.project)
  const selectedId = useStore((s) => s.selectedCameraId)
  const selectedObjectId = useStore((s) => s.selectedObjectId)
  const autosaveMinutes = useStore((s) => s.autosaveMinutes)
  const setBackground = useStore((s) => s.setBackground)
  const toggleStage = useStore((s) => s.toggleStage)
  const setGridWidth = useStore((s) => s.setGridWidth)
  const setBackgroundInEditor = useStore((s) => s.setBackgroundInEditor)
  const setOutputAspect = useStore((s) => s.setOutputAspect)
  const setAutosaveMinutes = useStore((s) => s.setAutosaveMinutes)
  const exportProject = useStore((s) => s.exportProject)
  const addCamera = useStore((s) => s.addCamera)
  const removeCamera = useStore((s) => s.removeCamera)
  const renameCamera = useStore((s) => s.renameCamera)
  const selectCamera = useStore((s) => s.selectCamera)
  const patchCamera = useStore((s) => s.patchCamera)
  const startTargetPick = useStore((s) => s.startTargetPick)
  const cancelTargetPick = useStore((s) => s.cancelTargetPick)
  const setCameraTarget = useStore((s) => s.setCameraTarget)
  const unlockCamera = useStore((s) => s.unlockCamera)
  const pickTargetFor = useStore((s) => s.pickTargetFor)
  const nudgeStep = useStore((s) => s.nudgeStep)
  const setNudgeStep = useStore((s) => s.setNudgeStep)
  const lensTemplates = useStore((s) => s.lensTemplates)
  const applyLensTemplate = useStore((s) => s.applyLensTemplate)
  const saveLensTemplate = useStore((s) => s.saveLensTemplate)
  const renameLensTemplate = useStore((s) => s.renameLensTemplate)
  const deleteLensTemplate = useStore((s) => s.deleteLensTemplate)
  const exportLensTemplate = useStore((s) => s.exportLensTemplate)
  const importLensTemplates = useStore((s) => s.importLensTemplates)
  const applyBackgroundFile = useStore((s) => s.applyBackgroundFile)
  const applyBoardFiles = useStore((s) => s.applyBoardFiles)
  const updateBoardBackground = useStore((s) => s.updateBoardBackground)
  const updateBoardItem = useStore((s) => s.updateBoardItem)
  const removeBoardItem = useStore((s) => s.removeBoardItem)
  const setActiveBoardItem = useStore((s) => s.setActiveBoardItem)
  const alignBoard = useStore((s) => s.alignBoard)
  const setBoardLocked = useStore((s) => s.setBoardLocked)
  const sortBoardByName = useStore((s) => s.sortBoardByName)
  const updateImageBackground = useStore((s) => s.updateImageBackground)
  const updatePanoBackground = useStore((s) => s.updatePanoBackground)
  const resetBackground = useStore((s) => s.resetBackground)
  const agentEnabled = useStore((s) => s.agentEnabled)
  const agentStatus = useStore((s) => s.agentStatus)
  const agentUrl = useStore((s) => s.agentUrl)
  const aiConfig = useStore((s) => s.aiConfig)
  const setAgentEnabled = useStore((s) => s.setAgentEnabled)
  const setAiConfig = useStore((s) => s.setAiConfig)
  const toast = useStore((s) => s.toast)

  const [templateModal, setTemplateModal] = useState<TemplateModalState | null>(null)
  const lensFileRef = useRef<HTMLInputElement>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const boardFileRef = useRef<HTMLInputElement>(null)
  const [pendingBg, setPendingBg] = useState<{
    file: File
    url: string
    width: number
    height: number
  } | null>(null)
  const [bgBusy, setBgBusy] = useState(false)
  const [aiDraft, setAiDraft] = useState(aiConfig)

  useEffect(() => {
    setAiDraft(aiConfig)
  }, [aiConfig])

  const [tab, setTab] = useState<'scene' | 'camera' | 'object'>('scene')
  const [cameraNameDraft, setCameraNameDraft] = useState('')
  const [cameraNameError, setCameraNameError] = useState('')
  const [deleteCameraTarget, setDeleteCameraTarget] = useState<CameraConfig | null>(null)

  const selected = project?.cameras.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId) setTab('camera')
  }, [selectedId])

  useEffect(() => {
    if (selectedObjectId) setTab('object')
  }, [selectedObjectId])

  useEffect(() => {
    setCameraNameDraft(selected?.name ?? '')
    setCameraNameError('')
  }, [selected?.id, selected?.name])

  useEffect(() => {
    return () => {
      if (pendingBg) URL.revokeObjectURL(pendingBg.url)
    }
  }, [pendingBg])

  if (!project) return null

  const background = project.background
  const solidColor = background.kind === 'solid' ? background.color : '#eef0f2'
  const boardActive =
    background.kind === 'board'
      ? background.items.find((item) => item.id === background.activeId) ?? background.items[0] ?? null
      : null
  const backgroundPreview =
    background.kind === 'solid'
      ? null
      : background.kind === 'board'
        ? boardActive?.preview
        : background.preview
  const backgroundName =
    background.kind === 'solid'
      ? '纯色背景'
      : background.kind === 'board'
        ? boardActive?.name || '多图背景板'
        : background.name || (background.kind === 'image' ? '背景图片' : '全景背景')
  const backgroundMeta =
    background.kind === 'solid'
      ? '纯色'
      : background.kind === 'board'
        ? `${background.items.length} 张 · ${background.curve ? `${background.curve}° 曲面` : '横向拼接'}${
          background.feather ? ` · 羽化 ${Math.round(background.feather * 100)}%` : ''
        }`
        : background.kind === 'image'
          ? background.mode === 'screen'
            ? '2D · 屏幕贴片'
            : '2D · 实体背景板'
          : `${background.projection}° 全景${
              background.source === 'littleplanet' ? ' · 星球展开' : ''
            }`
  const activePreset = background.kind === 'solid' ? background.preset : null

  const patch = (patchValue: Partial<CameraConfig>) => {
    if (selected) patchCamera(selected.id, patchValue)
  }

  const commitCameraName = () => {
    if (!selected) return false
    const desired = cameraNameDraft.trim()
    if (!desired) {
      setCameraNameError('名称不能为空')
      setCameraNameDraft(selected.name)
      return false
    }
    if (desired === selected.name) {
      setCameraNameDraft(desired)
      setCameraNameError('')
      return true
    }
    const result = renameCamera(selected.id, desired)
    if (!result.ok) {
      setCameraNameError(result.error ?? '名称不可用')
      setCameraNameDraft(selected.name)
      return false
    }
    setCameraNameDraft(desired)
    setCameraNameError('')
    return true
  }

  const lockedBy = deleteCameraTarget
    ? project.cameras.filter(
        (camera) =>
          camera.targetLock?.kind === 'camera' &&
          camera.targetLock.id === deleteCameraTarget.id,
      )
    : []

  const confirmDeleteCamera = () => {
    if (!deleteCameraTarget) return
    const name = deleteCameraTarget.name
    removeCamera(deleteCameraTarget.id)
    setDeleteCameraTarget(null)
    toast(`已删除机位「${name}」`, 'success')
  }

  const allTemplates = [...BUILTIN_LENS_TEMPLATES, ...lensTemplates]
  const matchedTemplate = selected
    ? (allTemplates.find(
        (t) => t.id === selected.lensTemplateId && templateMatchesCamera(selected, t),
      ) ??
      allTemplates.find((t) => templateMatchesCamera(selected, t)) ??
      null)
    : null

  const confirmTemplateModal = async () => {
    const modal = templateModal
    if (!modal) return
    if (modal.mode === 'save') await saveLensTemplate(modal.name)
    else if (modal.mode === 'rename' && modal.id) await renameLensTemplate(modal.id, modal.name)
    else if (modal.mode === 'delete' && modal.id) await deleteLensTemplate(modal.id)
    setTemplateModal(null)
  }

  const pickBackgroundFile = async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file)
      const width = bitmap.width
      const height = bitmap.height
      bitmap.close()
      setPendingBg({ file, url: URL.createObjectURL(file), width, height })
    } catch {
      toast('无法读取这张图片，请换一张试试', 'error')
    }
  }

  const closeBackgroundDialog = () => {
    if (bgBusy) return
    if (pendingBg) URL.revokeObjectURL(pendingBg.url)
    setPendingBg(null)
  }

  const confirmBackground = async (kind: BackgroundUploadKind) => {
    if (!pendingBg || bgBusy) return
    setBgBusy(true)
    try {
      await applyBackgroundFile(pendingBg.file, kind)
      URL.revokeObjectURL(pendingBg.url)
      setPendingBg(null)
    } catch {
      /* 错误提示由 store 处理，保留弹窗便于重试 */
    } finally {
      setBgBusy(false)
    }
  }

  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        <button className={`tab ${tab === 'scene' ? 'active' : ''}`} onClick={() => setTab('scene')}>
          场景
        </button>
        <button className={`tab ${tab === 'camera' ? 'active' : ''}`} onClick={() => setTab('camera')}>
          镜头
        </button>
        <button className={`tab ${tab === 'object' ? 'active' : ''}`} onClick={() => setTab('object')}>
          对象{project.objects.length > 0 ? ` ${project.objects.length}` : ''}
        </button>
      </div>

      <div className="inspector-scroll">
        {tab === 'object' ? (
          <ObjectInspector />
        ) : tab === 'scene' ? (
          <>
            <Section
              title="背景"
              action={
                <span className="badge soft">
                  {background.kind === 'solid'
                    ? '纯色'
                    : background.kind === 'image'
                      ? '图片'
                      : background.kind === 'pano'
                        ? '全景'
                        : '背景板'}
                </span>
              }
            >
              {background.kind === 'solid' ? (
                <>
                  <div className="bg-grid">
                    {BG_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        className={`bg-swatch ${activePreset === preset.id ? 'active' : ''}`}
                        onClick={() =>
                          setBackground({ kind: 'solid', color: preset.color, preset: preset.id })
                        }
                      >
                        <span className="swatch" style={{ background: preset.color }} />
                        <span className="swatch-label">{preset.label}</span>
                      </button>
                    ))}
                    <label className={`bg-swatch ${activePreset === 'custom' ? 'active' : ''}`}>
                      <span className="swatch custom" style={{ background: solidColor }} />
                      <span className="swatch-label">自定义</span>
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(solidColor) ? solidColor : '#eef0f2'}
                        onChange={(e) =>
                          setBackground({ kind: 'solid', color: e.target.value, preset: 'custom' })
                        }
                      />
                    </label>
                  </div>
                  <Readout>{background.color.toUpperCase()}</Readout>
                </>
              ) : (
                <div className="bg-current">
                  {backgroundPreview ? (
                    <img src={backgroundPreview} alt="" />
                  ) : (
                    <div className="bg-current-empty" />
                  )}
                  <div className="bg-current-info">
                    <b>{backgroundName}</b>
                    <span>{backgroundMeta}</span>
                  </div>
                </div>
              )}

              {background.kind === 'image' ? (
                <>
                  <Field label="模式">
                    <select
                      className="select"
                      value={background.mode}
                      onChange={(e) =>
                        updateImageBackground({ mode: e.target.value as 'screen' | 'plane' })
                      }
                    >
                      <option value="screen">屏幕贴片（每机位满幅）</option>
                      <option value="plane">实体背景板（有视差）</option>
                    </select>
                  </Field>
                  {background.mode === 'screen' ? (
                    <>
                      <SliderField
                        label="水平偏移"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={background.offsetX}
                        onChange={(v) => updateImageBackground({ offsetX: v })}
                      />
                      <SliderField
                        label="垂直偏移"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={background.offsetY}
                        onChange={(v) => updateImageBackground({ offsetY: v })}
                      />
                      <SliderField
                        label="缩放"
                        min={0.2}
                        max={4}
                        step={0.01}
                        value={background.scale}
                        onChange={(v) => updateImageBackground({ scale: v })}
                      />
                      <SliderField
                        label="旋转"
                        min={-180}
                        max={180}
                        step={1}
                        value={background.rotation}
                        unit="°"
                        onChange={(v) => updateImageBackground({ rotation: v })}
                      />
                    </>
                  ) : (
                    <>
                      <Field label="位置">
                        <div className="axis-grid">
                          {(['x', 'y', 'z'] as const).map((axis) => (
                            <div className="axis-field" key={axis}>
                              <span className={`axis-tag ${axis}`}>{axis.toUpperCase()}</span>
                              <NumField
                                value={background.plane[axis]}
                                step={0.1}
                                digits={2}
                                onChange={(v) =>
                                  updateImageBackground({
                                    plane: { ...background.plane, [axis]: v },
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </Field>
                      <SliderField
                        label="宽度"
                        min={2}
                        max={40}
                        step={0.5}
                        value={background.plane.width}
                        unit="m"
                        onChange={(v) =>
                          updateImageBackground({ plane: { ...background.plane, width: v } })
                        }
                      />
                    </>
                  )}
                </>
              ) : null}

              {background.kind === 'pano' ? (
                <>
                  <SliderField
                    label="水平旋转"
                    min={-180}
                    max={180}
                    step={1}
                    value={background.yaw}
                    unit="°"
                    onChange={(v) => updatePanoBackground({ yaw: v })}
                  />
                  <SliderField
                    label="地面贴合"
                    min={-60}
                    max={60}
                    step={1}
                    value={background.pitch}
                    unit="°"
                    onChange={(v) => updatePanoBackground({ pitch: v })}
                  />
                  <SliderField
                    label="翻滚校准"
                    min={-45}
                    max={45}
                    step={1}
                    value={background.roll}
                    unit="°"
                    onChange={(v) => updatePanoBackground({ roll: v })}
                  />
                  <div className="bg-actions">
                    <button
                      className="mini-btn"
                      onClick={() => {
                        if (project.stage.grid) toggleStage('grid')
                        if (project.stage.whiteFloor) toggleStage('whiteFloor')
                      }}
                    >
                      干净全景对位（隐藏网格 / 白地）
                    </button>
                  </div>
                  <p className="note">
                    {background.projection === '180'
                      ? '180° 全景：素材放在 360° 环境的左半边，背面用浅色补齐。'
                      : background.source === 'littleplanet'
                        ? '星球全景已近似展开为 360°，边缘可能有拉伸，建议在预览窗里环视检查。'
                        : '360° 等距柱状全景，任意机位环视都正确。'}
                    「地面贴合」上下移动照片地平线，让全景地面尽量落到人物脚下；再把机位高度调到接近拍摄者眼睛高度（机位越低，人偶在画面里越大）。照片地面和 3D 网格不可能完全重合，网格 / 白地只是对位辅助，不会出现在预览或输出里。
                  </p>
                </>
              ) : null}

              {background.kind === 'board' ? (
                <>
                  <div className="board-strip">
                    {background.items.map((item, index) => (
                      <button
                        key={item.id}
                        className={`board-thumb ${item.id === background.activeId ? 'active' : ''}`}
                        title={item.name || `图 ${index + 1}`}
                        onClick={() => setActiveBoardItem(item.id)}
                      >
                        {item.preview ? (
                          <img src={item.preview} alt="" />
                        ) : (
                          <span className="board-thumb-num">{index + 1}</span>
                        )}
                        <span>{item.name || `图 ${index + 1}`}</span>
                      </button>
                    ))}
                  </div>
                  <div className="bg-actions">
                    <button
                      className="mini-btn"
                      onClick={() => boardFileRef.current?.click()}
                      disabled={background.locked}
                    >
                      <IconUpload size={12} />
                      添加图片
                    </button>
                    <button
                      className="mini-btn"
                      onClick={alignBoard}
                      disabled={background.locked}
                    >
                      按宽度横向拼接
                    </button>
                    <button
                      className="mini-btn"
                      onClick={sortBoardByName}
                      disabled={background.locked}
                    >
                      按文件名排序
                    </button>
                    {boardActive ? (
                      <button
                        className="mini-btn"
                        onClick={() => removeBoardItem(boardActive.id)}
                        disabled={background.locked}
                      >
                        删除当前
                      </button>
                    ) : null}
                  </div>
                  <Toggle
                    label="锁定背景板"
                    hint="锁定后禁止改动板位置 / 宽度 / 曲面 / 羽化 / 排序"
                    checked={background.locked}
                    onChange={() => setBoardLocked(!background.locked)}
                  />
                  {boardActive ? (
                    <>
                      <Field label="板位置">
                        <div className="axis-grid">
                          {(['x', 'y', 'z'] as const).map((axis) => (
                            <div className="axis-field" key={axis}>
                              <span className={`axis-tag ${axis}`}>{axis.toUpperCase()}</span>
                              <NumField
                                value={boardActive.plane[axis]}
                                step={0.1}
                                digits={2}
                                disabled={background.locked}
                                onChange={(value) =>
                                  updateBoardItem(boardActive.id, {
                                    plane: { ...boardActive.plane, [axis]: value },
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </Field>
                      <SliderField
                        label="板宽"
                        min={0.5}
                        max={40}
                        step={0.1}
                        value={boardActive.plane.width}
                        unit="m"
                        disabled={background.locked}
                        onChange={(value) =>
                          updateBoardItem(boardActive.id, {
                            plane: { ...boardActive.plane, width: value },
                          })
                        }
                      />
                      <SliderField
                        label="板旋转"
                        min={-45}
                        max={45}
                        step={1}
                        value={boardActive.rotation}
                        unit="°"
                        disabled={background.locked}
                        onChange={(value) =>
                          updateBoardItem(boardActive.id, { rotation: value })
                        }
                      />
                      <SliderField
                        label="曲面角度"
                        min={0}
                        max={360}
                        step={5}
                        value={background.curve}
                        unit="°"
                        disabled={background.locked}
                        onChange={(value) => updateBoardBackground({ curve: value })}
                      />
                      <SliderField
                        label="接缝羽化"
                        min={0}
                        max={0.4}
                        step={0.01}
                        value={background.feather}
                        disabled={background.locked}
                        onChange={(value) => updateBoardBackground({ feather: value })}
                      />
                    </>
                  ) : (
                    <p className="note">还没有图片，点「添加图片」选择多张本地图片。</p>
                  )}
                  <Field label="底色">
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(background.fallbackColor) ? background.fallbackColor : '#0e1013'}
                      disabled={background.locked}
                      onChange={(event) =>
                        updateBoardBackground({ fallbackColor: event.target.value })
                      }
                    />
                  </Field>
                  <p className="note">
                    多张图片会按各自宽度横向排列，适合做长背景 / 走廊 / 多块场景板；拖动板位置和板宽可以微调接缝。曲面角 0° 为平面，180° / 360° 会按宽度围绕舞台；接缝羽化让相邻图片边缘透明过渡。
                  </p>
                </>
              ) : null}

              <div className="bg-actions">
                <button className="mini-btn" onClick={() => bgFileRef.current?.click()}>
                  <IconUpload size={12} />
                  {background.kind === 'solid' ? '上传背景图' : '更换图片'}
                </button>
                <button
                  className="mini-btn"
                  onClick={() => boardFileRef.current?.click()}
                >
                  <IconUpload size={12} />
                  多图背景板
                </button>
                {background.kind !== 'solid' ? (
                  <button className="mini-btn" onClick={() => void resetBackground()}>
                    恢复纯色
                  </button>
                ) : null}
              </div>

              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) await pickBackgroundFile(file)
                }}
              />
              <input
                ref={boardFileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  if (files.length > 0) await applyBoardFiles(files)
                }}
              />

              <p className="note">
                {background.kind === 'solid'
                  ? '纯色背景从任何机位看都保持一致；也可以上传图片、全景或多图背景板。'
                  : background.kind === 'board'
                    ? '多图背景板会把每张图作为独立平面放进场景；先选一张，再调板位置 / 板宽 / 旋转。'
                    : '屏幕贴片没有视差、每个机位都满幅；实体背景板会放进场景，适合放在人物身后。'}
              </p>

              <Toggle
                label="仅预览显示背景"
                hint="工作台保持白膜，背景只在预览窗和导出中出现"
                checked={!project.ui.backgroundInEditor}
                onChange={() => setBackgroundInEditor(!project.ui.backgroundInEditor)}
              />
            </Section>

            <Section title="舞台">
              <Toggle label="显示网格" checked={project.stage.grid} onChange={() => toggleStage('grid')} />
              <Field label="网格粗细" hint="数值越大线条越粗">
                <div className="focal-row">
                  <input
                    className="range"
                    type="range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={project.stage.gridWidth}
                    onChange={(e) => setGridWidth(Number(e.target.value))}
                  />
                  <NumField
                    value={project.stage.gridWidth}
                    min={1}
                    max={8}
                    step={0.5}
                    digits={1}
                    onChange={(v) => setGridWidth(v)}
                  />
                </div>
              </Field>
              <Toggle
                label="局部白色地面"
                hint="仅编辑器显示；在全景 / 图片背景上垫一块白色地面"
                checked={project.stage.whiteFloor}
                onChange={() => toggleStage('whiteFloor')}
              />
              <Toggle label="地面阴影" checked={project.stage.shadows} onChange={() => toggleStage('shadows')} />
              <Toggle
                label="雾效"
                hint="让纯色舞台无限延伸"
                checked={project.stage.fog}
                onChange={() => toggleStage('fog')}
              />
              <p className="note">
                全景 / 图片背景默认关闭网格，避免与照片地面冲突；打开后网格只在舞台附近淡出，也可以垫一块白色地面看清网格。
              </p>
            </Section>

            <Section title="编辑器">
              <Field label="方向键步长">
                <div className="focal-row">
                  <input
                    className="range"
                    type="range"
                    min={0.01}
                    max={2}
                    step={0.01}
                    value={nudgeStep}
                    onChange={(e) => void setNudgeStep(Number(e.target.value))}
                  />
                  <NumField
                    value={nudgeStep}
                    min={0.01}
                    max={2}
                    step={0.01}
                    digits={2}
                    suffix="m"
                    onChange={(v) => void setNudgeStep(v)}
                  />
                </div>
              </Field>
              <p className="note">
                选中机位后：方向键前后左右微调，Shift + ↑/↓ 升降；按住方向键可连续移动。
              </p>
            </Section>

            <Section title="输出">
              <Field label="画幅">
                <select
                  className="select"
                  value={project.output.aspect}
                  onChange={(e) => setOutputAspect(e.target.value as AspectId)}
                >
                  {ASPECT_ORDER.map((a) => (
                    <option key={a} value={a}>
                      {ASPECTS[a].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="分辨率">
                <Readout>
                  {project.output.width} × {project.output.height}
                </Readout>
              </Field>
              <Field label="帧率">
                <Readout>
                  {project.output.fps} fps <span className="badge">M5 可调</span>
                </Readout>
              </Field>
              <p className="note">预览窗口与最终导出共用这一画幅设置，避免比例错位。</p>
            </Section>

            <Section
              title="本地 Agent"
              action={
                <span className={`agent-state ${agentStatus}`}>
                  {agentStatus === 'online'
                    ? '已连接'
                    : agentStatus === 'connecting'
                      ? '连接中'
                      : agentStatus === 'offline'
                        ? '未连接'
                        : '未启用'}
                </span>
              }
            >
              <Toggle
                label="启用本地 Agent 控制"
                hint="仅监听 127.0.0.1，不对外网开放"
                checked={agentEnabled}
                onChange={() => void setAgentEnabled(!agentEnabled)}
              />
              <Field label="端口">
                <Readout>127.0.0.1:8787</Readout>
              </Field>
              <Field label="地址">
                <Readout>{agentUrl}</Readout>
              </Field>
              <p className="note">
                本地 HTTP 桥接端口 8787，默认 Token：whitestage-local。外部 Agent 通过
                POST /rpc 调用平台命令；完整命令表与示例见 AGENT.md。桥接服务未启动时这里显示“未连接”，不影响编辑器。
              </p>
            </Section>

            <Section title="AI 接口（预留）" action={<span className="badge soft">未启用</span>}>
              <Field label="服务商">
                <select
                  className="select"
                  value={aiDraft.provider}
                  onChange={(event) =>
                    setAiDraft({
                      ...aiDraft,
                      provider: event.target.value === 'custom' ? 'custom' : 'openai-compatible',
                    })
                  }
                >
                  <option value="openai-compatible">OpenAI 兼容</option>
                  <option value="custom">自定义</option>
                </select>
              </Field>
              <Field label="Base URL">
                <input
                  className="text-input"
                  placeholder="例如 https://api.openai.com/v1"
                  value={aiDraft.baseUrl}
                  onChange={(event) => setAiDraft({ ...aiDraft, baseUrl: event.target.value })}
                />
              </Field>
              <Field label="模型">
                <input
                  className="text-input"
                  placeholder="例如 gpt-4o / 本地模型名"
                  value={aiDraft.model}
                  onChange={(event) => setAiDraft({ ...aiDraft, model: event.target.value })}
                />
              </Field>
              <Field label="API Key">
                <input
                  className="text-input"
                  type="password"
                  placeholder="只保存在本机"
                  value={aiDraft.apiKey}
                  onChange={(event) => setAiDraft({ ...aiDraft, apiKey: event.target.value })}
                />
              </Field>
              <button
                className="btn btn-ghost sm"
                onClick={() => {
                  void setAiConfig(aiDraft)
                  toast('AI 配置已保存到本机（当前不会发起网络请求）', 'success')
                }}
              >
                保存到本机
              </button>
              <p className="note">
                当前只预留配置与接口类型，不会发送 API Key 或发起网络请求。后续聊天、上传图片 / 文件、按指令控制平台都走同一套 Agent 命令总线。
              </p>
            </Section>

            <Section title="工程存储">
              <p className="note">
                自动保存位置：本机浏览器 IndexedDB（当前浏览器 + 127.0.0.1:5175），
                <b>不会自动生成 .wsp 文件</b>。清理浏览器站点数据会删除这里的历史。
              </p>
              <p className="note">
                `.wsp` 是独立的工程文件。点下面的按钮或顶部「导出工程」，Chrome / Edge
                会弹出 Windows 保存位置；不支持时会走普通浏览器下载。
              </p>
              <button
                className="btn btn-ghost sm"
                onClick={() => void exportProject()}
              >
                另存为 .wsp 工程文件…
              </button>
            </Section>

            <Section title="保存">
              <Field label="自动保存">
                <select
                  className="select"
                  value={autosaveMinutes}
                  onChange={(e) => void setAutosaveMinutes(Number(e.target.value))}
                >
                  {AUTOSAVE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      每 {m} 分钟
                    </option>
                  ))}
                </select>
              </Field>
              <p className="note">编辑停止 30 秒后也会静默保存一次；返回首页前会自动保存。</p>
            </Section>
          </>
        ) : (
          <>
            <Section
              title="机位"
              action={
                <button className="mini-btn" onClick={addCamera} title="新建机位">
                  <IconPlus size={13} />
                  新建
                </button>
              }
            >
              {project.cameras.length === 0 ? (
                <div className="empty-mini">
                  <IconCamera size={22} />
                  <p>舞台上还没有机位</p>
                  <button className="btn btn-primary sm" onClick={addCamera}>
                    <IconPlus size={14} />
                    添加第一个机位
                  </button>
                </div>
              ) : (
                <div className="cam-chips">
                  {project.cameras.map((cam, index) => (
                    <button
                      key={cam.id}
                      className={`cam-chip ${cam.id === selectedId ? 'active' : ''}`}
                      onClick={() => selectCamera(cam.id)}
                      title={`${cam.name} · ${round(fovFromFocal(cam.focal, SENSORS[cam.sensor].height), 1)}°`}
                    >
                      <span className="cam-index">{index + 1}</span>
                      {cam.name}
                    </button>
                  ))}
                </div>
              )}
            </Section>

            {selected ? (
              <>
                <Section
                  title="镜头模板"
                  action={
                    <span
                      className={`badge ${
                        matchedTemplate?.builtin ? 'soft' : matchedTemplate ? 'accent' : 'soft'
                      }`}
                    >
                      {matchedTemplate ? (matchedTemplate.builtin ? '系统预设' : '我的模板') : '自定义'}
                    </span>
                  }
                >
                  <select
                    className="select"
                    value={matchedTemplate?.id ?? ''}
                    onChange={(e) => {
                      const template = allTemplates.find((t) => t.id === e.target.value)
                      if (template) applyLensTemplate(selected.id, template)
                    }}
                  >
                    <option value="">自定义参数</option>
                    <optgroup label="系统预设 · 固定不可删除">
                      {BUILTIN_LENS_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="我的模板">
                      {lensTemplates.length === 0 ? (
                        <option value="__none" disabled>
                          还没有保存的模板
                        </option>
                      ) : (
                        lensTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))
                      )}
                    </optgroup>
                  </select>

                  <div className="template-meta">
                    {selected.focal}mm · f/{selected.aperture} · {SENSORS[selected.sensor].label} · 对焦{' '}
                    {selected.focusDistance}m
                  </div>

                  <div className="template-actions">
                    <button
                      className="mini-btn"
                      onClick={() =>
                        setTemplateModal({
                          mode: 'save',
                          name: `我的镜头 ${lensTemplates.length + 1}`,
                        })
                      }
                    >
                      <IconTemplate size={12} />
                      保存当前
                    </button>
                    <button className="mini-btn" onClick={() => lensFileRef.current?.click()}>
                      <IconUpload size={12} />
                      导入模板
                    </button>
                    {matchedTemplate ? (
                      <button
                        className="mini-btn"
                        onClick={() => exportLensTemplate(matchedTemplate.id)}
                      >
                        导出
                      </button>
                    ) : null}
                    {matchedTemplate && !matchedTemplate.builtin ? (
                      <button
                        className="mini-btn"
                        onClick={() =>
                          setTemplateModal({
                            mode: 'rename',
                            id: matchedTemplate.id,
                            name: matchedTemplate.name,
                          })
                        }
                      >
                        重命名
                      </button>
                    ) : null}
                    {matchedTemplate && !matchedTemplate.builtin ? (
                      <button
                        className="mini-btn danger"
                        onClick={() =>
                          setTemplateModal({
                            mode: 'delete',
                            id: matchedTemplate.id,
                            name: matchedTemplate.name,
                          })
                        }
                      >
                        删除
                      </button>
                    ) : null}
                  </div>

                  <p className="note">
                    选择模板会套用焦距、传感器、光圈与对焦距离；系统预设固定不可删除。光圈/景深效果在 M3
                    生效。
                  </p>

                  <input
                    ref={lensFileRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) await importLensTemplates(file)
                    }}
                  />
                </Section>

                <Section
                  title="机位参数"
                  action={
                    <span className={`badge ${project.ui.preview.cameraId === selected.id ? 'accent' : 'soft'}`}>
                      {project.ui.preview.cameraId === selected.id ? '预览中' : '未预览'}
                    </span>
                  }
                >
                  <Field label="名称">
                    <input
                      className={`text-input ${cameraNameError ? 'has-error' : ''}`}
                      value={cameraNameDraft}
                      maxLength={30}
                      onChange={(e) => {
                        setCameraNameDraft(e.target.value)
                        if (cameraNameError) setCameraNameError('')
                      }}
                      onBlur={() => {
                        if (!selected) return
                        if (cameraNameDraft.trim() === selected.name.trim()) {
                          setCameraNameDraft(selected.name)
                          setCameraNameError('')
                          return
                        }
                        commitCameraName()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') {
                          setCameraNameDraft(selected?.name ?? '')
                          setCameraNameError('')
                          e.currentTarget.blur()
                        }
                      }}
                    />
                    {cameraNameError ? (
                      <div className="field-error">{cameraNameError}</div>
                    ) : (
                      <div className="field-hint">不可与其它机位重名；改名会同步到预览窗</div>
                    )}
                  </Field>

                  <Field label="位置" hint="也可以直接拖动场景里的坐标箭头">
                    <div className="axis-grid">
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <div className="axis-field" key={axis}>
                          <span className={`axis-tag ${axis}`}>{axis.toUpperCase()}</span>
                          <NumField
                            value={selected.position[axis]}
                            step={0.05}
                            digits={2}
                            onChange={(v) =>
                              patch({ position: { ...selected.position, [axis]: v } })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </Field>

                  <SliderField
                    label="偏航 Yaw"
                    min={-180}
                    max={180}
                    step={1}
                    value={selected.rotation.y}
                    unit="°"
                    onChange={(v) => patch({ rotation: { ...selected.rotation, y: v } })}
                  />
                  <SliderField
                    label="俯仰 Pitch"
                    min={-89}
                    max={89}
                    step={1}
                    value={selected.rotation.x}
                    unit="°"
                    onChange={(v) => patch({ rotation: { ...selected.rotation, x: v } })}
                  />

                  <Field label="焦距">
                    <div className="focal-row">
                      <input
                        className="range"
                        type="range"
                        min={12}
                        max={300}
                        step={1}
                        value={selected.focal}
                        onChange={(e) => patch({ focal: Number(e.target.value) })}
                      />
                      <NumField
                        value={selected.focal}
                        step={1}
                        min={8}
                        max={400}
                        suffix="mm"
                        digits={0}
                        onChange={(v) => patch({ focal: v })}
                      />
                    </div>
                  </Field>

                  <Field label="传感器">
                    <select
                      className="select"
                      value={selected.sensor}
                      onChange={(e) => patch({ sensor: e.target.value as SensorId })}
                    >
                      {(Object.keys(SENSORS) as SensorId[]).map((id) => (
                        <option key={id} value={id}>
                          {SENSORS[id].label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Readout>
                    垂直视场角 {round(fovFromFocal(selected.focal, SENSORS[selected.sensor].height), 1)}°
                    <span className="readout-sep" />
                    等效 {Math.round((selected.focal * 24) / SENSORS[selected.sensor].height)} mm
                  </Readout>
                </Section>

                <Section
                  title="目标锁定"
                  action={
                    <span className={`badge ${selected.targetLock ? 'accent' : 'soft'}`}>
                      {selected.targetLock ? '已锁定' : '未锁定'}
                    </span>
                  }
                >
                  {selected.targetLock ? (
                    <>
                      <div className="lock-state">
                        <IconTarget size={15} />
                        <span>{targetLabel(project, selected.targetLock)}</span>
                      </div>
                      <div className="btn-row">
                        <button
                          className="btn btn-ghost sm"
                          onClick={() => startTargetPick(selected.id)}
                        >
                          <IconTarget size={14} />
                          重新选择
                        </button>
                        <button
                          className="btn btn-danger-ghost sm"
                          onClick={() => unlockCamera(selected.id)}
                        >
                          取消锁定
                        </button>
                      </div>
                      <p className="note">
                        锁定后移动机位，镜头始终对准目标；旋转工具会临时切换为移动。
                      </p>
                    </>
                  ) : pickTargetFor === selected.id ? (
                    <>
                      <div className="lock-state picking">
                        <IconTarget size={15} />
                        <span>正在选择目标…</span>
                      </div>
                      <p className="note">点击场景中的另一个机位、人偶/道具或地面。按 Esc 取消。</p>
                      <button className="btn btn-ghost sm" onClick={() => cancelTargetPick()}>
                        取消选择
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="btn-row">
                        <button
                          className="btn btn-ghost sm"
                          onClick={() => startTargetPick(selected.id)}
                        >
                          <IconTarget size={14} />
                          锁定目标…
                        </button>
                        <button
                          className="btn btn-ghost sm"
                          onClick={() => setCameraTarget(selected.id, { kind: 'origin' })}
                        >
                          锁定舞台中心
                        </button>
                      </div>
                      <p className="note">
                        进入选择状态后，点击场景中的机位、人偶/道具或地面即可锁定；目标上会出现镜头锁定标记。
                      </p>
                    </>
                  )}
                </Section>

                <Section
                  title="景深"
                  action={<span className="badge soft">实时预览</span>}
                >
                  <Toggle
                    label="启用景深"
                    hint="每个分屏格子按自己的光圈 / 对焦距离虚化"
                    checked={selected.dof}
                    onChange={() => patch({ dof: !selected.dof })}
                  />
                  <SliderField
                    label="光圈"
                    min={1.2}
                    max={22}
                    step={0.1}
                    value={selected.aperture}
                    unit="f/"
                    onChange={(value) => patch({ aperture: value })}
                  />
                  <SliderField
                    label="对焦距离"
                    min={0.2}
                    max={50}
                    step={0.1}
                    value={selected.focusDistance}
                    unit="m"
                    onChange={(value) => patch({ focusDistance: value })}
                  />
                  <p className="note">实时预览使用屏幕空间景深近似；光圈越小越虚，对焦距离是镜头到焦平面的米数。导出视频会复用这些参数。</p>
                </Section>

                <div className="btn-row">
                  <button
                    className="btn btn-ghost sm"
                    onClick={() =>
                      patch({ rotation: lookAtRotation(selected.position, { x: 0, y: 1.05, z: 0 }) })
                    }
                  >
                    看向中心
                  </button>
                  <button
                    className="btn btn-danger-ghost sm"
                    onClick={() => setDeleteCameraTarget(selected)}
                  >
                    删除机位
                  </button>
                </div>
              </>
            ) : (
              <Section title="机位参数">
                <p className="note">选择上方机位后，可在这里调整位置、角度与镜头参数。</p>
              </Section>
            )}
          </>
        )}
      </div>

      <Modal
        open={!!templateModal}
        title={
          templateModal?.mode === 'save'
            ? '保存镜头模板'
            : templateModal?.mode === 'rename'
              ? '重命名镜头模板'
              : '删除镜头模板？'
        }
        subtitle={
          templateModal && templateModal.mode !== 'delete'
            ? '模板保存在本机，之后可以在「我的模板」里直接选择。'
            : undefined
        }
        onClose={() => setTemplateModal(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setTemplateModal(null)}>
              取消
            </button>
            <button
              className={`btn ${templateModal?.mode === 'delete' ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => void confirmTemplateModal()}
            >
              {templateModal?.mode === 'delete' ? '确认删除' : '保存'}
            </button>
          </>
        }
      >
        {templateModal?.mode === 'delete' ? (
          <>
            <p className="modal-text">
              即将删除「<b>{templateModal.name}</b>」。
            </p>
            <div className="warn-box">
              <b>删除后无法找回。</b>
              已套用该模板的机位参数不会改变，但模板本身会从「我的模板」列表移除。
            </div>
          </>
        ) : (
          <>
            <label className="modal-label">模板名称</label>
            <input
              className="text-input lg"
              autoFocus
              value={templateModal?.name ?? ''}
              maxLength={40}
              onChange={(e) =>
                setTemplateModal((current) =>
                  current ? { ...current, name: e.target.value } : current,
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmTemplateModal()
              }}
            />
            <p className="modal-note">系统预设固定不可修改；自定义模板可以随时重命名或删除。</p>
          </>
        )}
      </Modal>

      <Modal
        open={!!deleteCameraTarget}
        title="删除机位？"
        onClose={() => setDeleteCameraTarget(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDeleteCameraTarget(null)}>
              取消
            </button>
            <button className="btn btn-danger" onClick={confirmDeleteCamera}>
              确认删除
            </button>
          </>
        }
      >
        <p className="modal-text">
          即将删除「<b>{deleteCameraTarget?.name}</b>」。
        </p>
        <div className="warn-box">
          <b>删除后无法恢复。</b>
          该机位的位置、镜头参数和目标锁定都会被移除。
        </div>
        {lockedBy.length > 0 ? (
          <p className="modal-text">
            以下机位锁定在它身上，删除后会自动解除：
            {lockedBy.map((camera) => camera.name).join('、')}
          </p>
        ) : null}
        {project.cameras.length <= 1 ? (
          <p className="modal-text">这是最后一个机位，删除后预览窗会没有画面。</p>
        ) : null}
      </Modal>

      <BackgroundDialog
        open={!!pendingBg}
        fileName={pendingBg?.file.name ?? ''}
        previewUrl={pendingBg?.url ?? ''}
        width={pendingBg?.width ?? 0}
        height={pendingBg?.height ?? 0}
        busy={bgBusy}
        onClose={closeBackgroundDialog}
        onConfirm={(kind) => void confirmBackground(kind)}
      />
      <Watermark placement="inspector" />
    </aside>
  )
}
