import { useEffect, useState, type ReactNode } from 'react'
import { round } from '../core/math'

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-title">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="field-body">
        {children}
        {hint ? <div className="field-hint">{hint}</div> : null}
      </div>
    </div>
  )
}

interface NumFieldProps {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  disabled?: boolean
  digits?: number
}

export function NumField({ value, onChange, step = 0.1, min, max, suffix, disabled, digits = 2 }: NumFieldProps) {
  const [text, setText] = useState(String(round(value, digits)))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(round(value, digits)))
  }, [value, focused, digits])

  const commit = () => {
    const parsed = Number(text)
    if (Number.isFinite(parsed)) {
      let next = parsed
      if (min !== undefined) next = Math.max(min, next)
      if (max !== undefined) next = Math.min(max, next)
      onChange(next)
      setText(String(round(next, digits)))
    } else {
      setText(String(round(value, digits)))
    }
  }

  return (
    <div className={`num-wrap ${disabled ? 'is-disabled' : ''}`}>
      <input
        className="num-input"
        value={text}
        disabled={disabled}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setFocused(true)
          e.currentTarget.select()
        }}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setText(String(round(value, digits)))
            e.currentTarget.blur()
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const next = round(value + delta, digits)
            onChange(next)
            setText(String(next))
          }
        }}
      />
      {suffix ? <span className="num-suffix">{suffix}</span> : null}
    </div>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="slider-field">
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-val">
          {round(value, 1)}
          {unit ? <em>{unit}</em> : null}
        </span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: () => void; hint?: string }) {
  return (
    <button type="button" className={`toggle-row ${checked ? 'on' : ''}`} onClick={onChange}>
      <span className="toggle-text">
        <span>{label}</span>
        {hint ? <em>{hint}</em> : null}
      </span>
      <span className="switch">
        <i />
      </span>
    </button>
  )
}

export function Readout({ children }: { children: ReactNode }) {
  return <div className="readout">{children}</div>
}
