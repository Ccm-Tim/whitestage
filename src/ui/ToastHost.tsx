import { useStore } from '../store/useStore'

export function ToastHost() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span className="toast-dot" />
          {t.text}
        </div>
      ))}
    </div>
  )
}
