import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './styles.css'

if (import.meta.env.DEV) {
  const show = (msg: string) => {
    let el = document.getElementById('__fatal')
    if (!el) {
      el = document.createElement('div')
      el.id = '__fatal'
      el.style.cssText =
        'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:rgba(170,28,28,.96);color:#fff;font:12px/1.55 ui-monospace,Consolas,monospace;padding:10px 12px;border-radius:8px;white-space:pre-wrap;max-height:34vh;overflow:auto'
      document.body.appendChild(el)
    }
    el.textContent += msg + '\n'
  }
  window.addEventListener('error', (e) => show('ERROR: ' + (e.message || String(e.error))))
  window.addEventListener('unhandledrejection', (e) =>
    show('REJECTION: ' + String((e.reason && e.reason.message) || e.reason)),
  )
}

createRoot(document.getElementById('root')!).render(<App />)
