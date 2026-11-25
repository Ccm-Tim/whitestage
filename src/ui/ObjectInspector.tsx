import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import type { CustomCharacter, ObjectCategory, SceneObject } from '../core/types'
import {
  OBJECT_CATEGORIES,
  getObjectPreset,
  presetsForCategory,
} from '../core/objects'
import { Field, NumField, Section, SliderField, Toggle } from './fields'
import { Modal } from './Modal'
import { CharacterEditor } from './CharacterEditor'

const COLOR_SWATCHES = [
  '#8fa8c0',
  '#b58a96',
  '#87ad91',
  '#c7a06f',
  '#6f7f92',
  '#b4655a',
  '#5f7f6d',
  '#d6d9dd',
]

const SKIN_SWATCHES = [
  '#f5f2ed',
  '#eceae4',
  '#e3d3c2',
  '#d8b99e',
  '#c79572',
  '#a97050',
  '#80533c',
  '#5f4031',
]

const SHOE_SWATCHES = ['#f2f3f5', '#c9ced5', '#8c939d', '#4d545e', '#6b4a3a', '#d9c7aa']

export function ObjectInspector() {
  const project = useStore((s) => s.project)
  const selectedObjectId = useStore((s) => s.selectedObjectId)
  const addObject = useStore((s) => s.addObject)
  const selectObject = useStore((s) => s.selectObject)
  const removeObject = useStore((s) => s.removeObject)
  const duplicateObject = useStore((s) => s.duplicateObject)
  const patchObject = useStore((s) => s.patchObject)
  const customCharacters = useStore((s) => s.customCharacters)
  const addCustomCharacter = useStore((s) => s.addCustomCharacter)
  const deleteCustomCharacter = useStore((s) => s.deleteCustomCharacter)
  const exportCustomCharacter = useStore((s) => s.exportCustomCharacter)
  const importCustomCharacters = useStore((s) => s.importCustomCharacters)
  const [category, setCategory] = useState<ObjectCategory>('mannequin')
  const [deleteTarget, setDeleteTarget] = useState<SceneObject | null>(null)
  const [deleteCharacterTarget, setDeleteCharacterTarget] =
    useState<CustomCharacter | null>(null)
  const [editingTarget, setEditingTarget] = useState<SceneObject | null>(null)
  const customFileRef = useRef<HTMLInputElement>(null)

  if (!project) return null
  const selected = project.objects.find((object) => object.id === selectedObjectId) ?? null
  const selectedPreset = selected ? getObjectPreset(selected.variant) : null
  const presets = presetsForCategory(category)
  const hasMannequin = project.objects.some(
    (object) => object.kind === 'mannequin' && object.visible,
  )

  const patch = (value: Partial<SceneObject>) => {
    if (selected) patchObject(selected.id, value)
  }
  const setScale = (value: number) => {
    const scale = Math.min(1000, Math.max(0.01, Number(value) || 0.01))
    patch({ scale: { x: scale, y: scale, z: scale } })
  }

  return (
    <>
      <Section
        title="对象库"
        action={<span className="badge soft">{project.objects.length} 个对象</span>}
      >
        <div className="object-categories">
          {OBJECT_CATEGORIES.map((item) => (
            <button
              key={item.id}
              className={`chip ${category === item.id ? 'active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="object-library">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className="object-card"
              onClick={() => addObject(preset.id)}
              title={`添加${preset.label}`}
            >
              <span
                className={`object-glyph ${preset.kind}`}
                style={{ background: preset.color }}
              >
                {preset.kind === 'mannequin' ? '人' : preset.label.slice(0, 1)}
              </span>
              <span className="object-card-text">
                <b>{preset.label}</b>
                <small>
                  {preset.kind === 'mannequin'
                    ? `${preset.height.toFixed(2)}m`
                    : preset.category}
                </small>
              </span>
              <span className="object-add">+</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="我的角色"
        action={
          <button className="mini-btn" onClick={() => customFileRef.current?.click()}>
            导入角色
          </button>
        }
      >
        {customCharacters.length === 0 ? (
          <p className="note">
            选中人偶 → 对象参数 → 「编辑角色」→ 保存到我的角色。系统自带人偶固定不可删除，这里只管理自定义角色。
          </p>
        ) : (
          <div className="custom-list">
            {customCharacters.map((character) => (
              <div className="custom-row" key={character.id}>
                <button
                  className="custom-row-main"
                  onClick={() => addCustomCharacter(character.id)}
                  title="添加到场景"
                >
                  <span
                    className="object-glyph mannequin"
                    style={{ background: character.color }}
                  >
                    人
                  </span>
                  <span className="custom-row-text">
                    <b>{character.name}</b>
                    <small>
                      {getObjectPreset(character.baseVariant).label} ·{' '}
                      {Object.keys(character.joints).length} 个关节
                    </small>
                  </span>
                  <span className="object-add">+</span>
                </button>
                <button
                  className="mini-btn"
                  onClick={() => exportCustomCharacter(character.id)}
                >
                  导出
                </button>
                <button
                  className="mini-btn danger"
                  onClick={() => setDeleteCharacterTarget(character)}
                >
                  删除
                </button>
              </div>
            ))}
            <p className="note">系统自带角色在对象库里，固定不可删除。</p>
          </div>
        )}
        <input
          ref={customFileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) await importCustomCharacters(file)
          }}
        />
      </Section>

      <Section
        title="AI 辅助导出"
        action={<span className="badge soft">Part ID</span>}
      >
        <p className="note">
          按当前预览机位，导出所有可见人偶的部件 ID 色图和逐部件 mask，可用于 AI
          替换、分割或训练标注。颜色只做索引，AI 替换请以 mask 和 parts.json 为准。
        </p>
        <button
          className="btn btn-primary sm"
          disabled={!hasMannequin}
          onClick={() => window.dispatchEvent(new Event('whitestage:export-part-masks'))}
        >
          导出部件 ID 色 / Mask
        </button>
        <p className="note">
          包含 part-id.png、masks/*.png、parts.json、README.txt；被遮挡或画面外的部件 mask
          为空。
        </p>
      </Section>

      <Section title="场景对象" action={selected ? <span className="badge accent">已选中</span> : null}>
        {project.objects.length === 0 ? (
          <p className="note">还没有对象，从上方对象库添加一个人偶或道具。</p>
        ) : (
          <div className="object-list">
            {project.objects.map((object) => {
              const preset = getObjectPreset(object.variant)
              return (
                <div
                  key={object.id}
                  className={`object-row ${object.id === selectedObjectId ? 'active' : ''}`}
                  onClick={() => selectObject(object.id)}
                >
                  <span className="object-dot" style={{ background: object.color }} />
                  <span className="object-row-main">
                    <b>{object.name}</b>
                    <small>
                      {preset.label}
                      {object.kind === 'mannequin' ? ` · ${object.height.toFixed(2)}m` : ''}
                    </small>
                  </span>
                  <button
                    className={`mini-btn object-visibility ${object.visible ? '' : 'off'}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      patchObject(object.id, { visible: !object.visible })
                    }}
                    title={object.visible ? '隐藏' : '显示'}
                  >
                    {object.visible ? '隐藏' : '显示'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {selected && selectedPreset ? (
        <>
          <Section
            title="对象参数"
            action={<span className="badge soft">{selectedPreset.label}</span>}
          >
            {selected.kind === 'mannequin' ? (
              <div className="char-edit-bar">
                <button
                  className="btn btn-primary sm"
                  onClick={() => setEditingTarget(selected)}
                >
                  编辑角色
                </button>
                <span>
                  {selected.joints ? '当前是自定义关节姿势' : '逐关节调整，保存到「我的角色」'}
                </span>
              </div>
            ) : null}

            <Field label="名称">
              <input
                className="text-input"
                value={selected.name}
                maxLength={30}
                onChange={(event) => patch({ name: event.target.value })}
              />
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
                      onChange={(value) =>
                        patch({ position: { ...selected.position, [axis]: value } })
                      }
                    />
                  </div>
                ))}
              </div>
            </Field>

            <SliderField
              label="朝向 Y"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation.y}
              unit="°"
              onChange={(value) => patch({ rotation: { ...selected.rotation, y: value } })}
            />

            {selected.kind === 'mannequin' ? (
              <SliderField
                label="身高"
                min={0.6}
                max={2.4}
                step={0.01}
                value={selected.height}
                unit="m"
                onChange={(value) => patch({ height: value })}
              />
            ) : null}

            <Field
              label="整体缩放"
              hint="滑杆覆盖常用范围；右侧输入框可直接输入 0.01–1000×"
            >
              <div className="focal-row">
                <input
                  className="range"
                  type="range"
                  min={0.05}
                  max={20}
                  step={0.01}
                  value={Math.min(20, Math.max(0.05, selected.scale.x))}
                  onChange={(event) => setScale(Number(event.target.value))}
                />
                <NumField
                  value={selected.scale.x}
                  min={0.01}
                  max={1000}
                  step={0.05}
                  digits={2}
                  onChange={setScale}
                />
              </div>
            </Field>

            <Toggle
              label="允许穿地"
              hint="打开后可以把对象 Y 调到地面以下"
              checked={selected.allowUnderground}
              onChange={() => patch({ allowUnderground: !selected.allowUnderground })}
            />
            <div className="btn-row">
              <button
                className="btn btn-ghost sm"
                onClick={() =>
                  patch({
                    position: { ...selected.position, y: 0 },
                    allowUnderground: false,
                  })
                }
              >
                回到地面
              </button>
              <button
                className="btn btn-ghost sm"
                onClick={() =>
                  patch({
                    position: { ...selected.homePosition },
                    allowUnderground: false,
                  })
                }
              >
                恢复默认位置
              </button>
            </div>

            {selectedPreset.poses.length > 1 && !selected.joints ? (
              <Field label="姿势">
                <select
                  className="text-input select"
                  value={selected.pose}
                  onChange={(event) => patch({ pose: event.target.value })}
                >
                  {selectedPreset.poses.map((pose) => (
                    <option key={pose.id} value={pose.id}>
                      {pose.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label={selected.kind === 'mannequin' ? '训练服' : '颜色'}>
              <div className="object-color-row">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : '#d6d9dd'}
                  onChange={(event) => patch({ color: event.target.value })}
                />
                <span className="object-color-value">{selected.color.toUpperCase()}</span>
              </div>
              <div className="object-swatches">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    className={`object-swatch ${selected.color.toLowerCase() === color ? 'active' : ''}`}
                    style={{ background: color }}
                    onClick={() => patch({ color })}
                    title={color}
                  />
                ))}
              </div>
            </Field>

            {selected.kind === 'mannequin' ? (
              <>
                <Field label="头/手颜色">
                  <div className="object-color-row">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-f]{6}$/i.test(selected.skinColor)
                          ? selected.skinColor
                          : '#eceae4'
                      }
                      onChange={(event) => patch({ skinColor: event.target.value })}
                    />
                    <span className="object-color-value">
                      {selected.skinColor.toUpperCase()}
                    </span>
                  </div>
                  <div className="object-swatches">
                    {SKIN_SWATCHES.map((color) => (
                      <button
                        key={color}
                        className={`object-swatch ${selected.skinColor.toLowerCase() === color ? 'active' : ''}`}
                        style={{ background: color }}
                        onClick={() => patch({ skinColor: color })}
                        title={color}
                      />
                    ))}
                  </div>
                </Field>

                <Field label="鞋子颜色">
                  <div className="object-color-row">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-f]{6}$/i.test(selected.shoeColor)
                          ? selected.shoeColor
                          : '#c9ced5'
                      }
                      onChange={(event) => patch({ shoeColor: event.target.value })}
                    />
                    <span className="object-color-value">
                      {selected.shoeColor.toUpperCase()}
                    </span>
                  </div>
                  <div className="object-swatches">
                    {SHOE_SWATCHES.map((color) => (
                      <button
                        key={color}
                        className={`object-swatch ${selected.shoeColor.toLowerCase() === color ? 'active' : ''}`}
                        style={{ background: color }}
                        onClick={() => patch({ shoeColor: color })}
                        title={color}
                      />
                    ))}
                  </div>
                </Field>

                <div className="btn-row">
                  <button
                    className="btn btn-ghost sm"
                    onClick={() =>
                      patch({ skinColor: selected.color, shoeColor: selected.color })
                    }
                  >
                    全身同色
                  </button>
                  <button
                    className="btn btn-ghost sm"
                    onClick={() => patch({ skinColor: '#eceae4', shoeColor: '#c9ced5' })}
                  >
                    恢复白膜配色
                  </button>
                </div>

                <Toggle
                  label="面部五官"
                  hint="眼睛、眉毛、鼻子、嘴、耳朵；关闭后回到纯白膜头部"
                  checked={selected.faceDetail}
                  onChange={() => patch({ faceDetail: !selected.faceDetail })}
                />

                <p className="note">
                  头部、双手、双脚在模型里分别命名为 head / leftHand / rightHand / leftFoot /
                  rightFoot，方便后续 AI 识别、分割和替换。
                </p>
              </>
            ) : null}

            <Toggle
              label={selected.visible ? '在场景中显示' : '已隐藏'}
              checked={selected.visible}
              onChange={() => patch({ visible: !selected.visible })}
            />

            <div className="btn-row">
              <button className="btn btn-ghost sm" onClick={() => duplicateObject(selected.id)}>
                复制对象
              </button>
              <button
                className="btn btn-danger-ghost sm"
                onClick={() => setDeleteTarget(selected)}
              >
                删除对象
              </button>
            </div>
          </Section>
        </>
      ) : (
        <div className="object-empty">
          <b>选择一个对象</b>
          <p>在场景里点选，或在上面「场景对象」列表里选择；方向键可以微调位置。</p>
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        title="删除对象？"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (deleteTarget) removeObject(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              确认删除
            </button>
          </>
        }
      >
        <p className="modal-text">
          即将删除「<b>{deleteTarget?.name}</b>」。
        </p>
        <div className="warn-box">
          <b>删除后无法恢复。</b>
          如果有镜头锁定在这个对象上，锁定会自动解除。
        </div>
      </Modal>

      <Modal
        open={!!deleteCharacterTarget}
        title="删除自定义角色？"
        onClose={() => setDeleteCharacterTarget(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDeleteCharacterTarget(null)}>
              取消
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (deleteCharacterTarget) {
                  void deleteCustomCharacter(deleteCharacterTarget.id)
                }
                setDeleteCharacterTarget(null)
              }}
            >
              确认删除
            </button>
          </>
        }
      >
        <p className="modal-text">
          即将从「我的角色」删除「<b>{deleteCharacterTarget?.name}</b>」。
        </p>
        <div className="warn-box">
          <b>删除后无法恢复。</b>
          已经放进场景里的实例会保留当前姿势和配色，但不再关联这个自定义角色。
          系统自带人偶不受影响。
        </div>
      </Modal>

      {editingTarget ? (
        <CharacterEditor object={editingTarget} onClose={() => setEditingTarget(null)} />
      ) : null}
    </>
  )
}
