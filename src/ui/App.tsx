import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { startAgentClient } from '../agent/client'
import { Editor } from './Editor'
import { StartScreen } from './StartScreen'
import { ToastHost } from './ToastHost'
import { Watermark } from './Watermark'
import { LogoMark } from './Logo'

function BootSplash() {
  return (
    <div className="boot-splash">
      <div className="boot-logo">
        <LogoMark size={54} />
      </div>
      <div className="boot-name">白膜预演台</div>
      <div className="boot-hint">正在读取本地工程…</div>
      <div className="boot-bar">
        <i />
      </div>
    </div>
  )
}

export default function App() {
  const booted = useStore((s) => s.booted)
  const view = useStore((s) => s.view)
  const project = useStore((s) => s.project)
  const agentEnabled = useStore((s) => s.agentEnabled)
  const agentUrl = useStore((s) => s.agentUrl)
  const agentToken = useStore((s) => s.agentToken)
  const setAgentStatus = useStore((s) => s.setAgentStatus)

  useEffect(() => {
    void useStore.getState().boot()
  }, [])

  useEffect(() => {
    if (!booted || !agentEnabled) {
      setAgentStatus('idle')
      return
    }
    return startAgentClient({
      url: agentUrl,
      token: agentToken,
      onStatus: setAgentStatus,
    })
  }, [booted, agentEnabled, agentUrl, agentToken, setAgentStatus])

  if (!booted) return <BootSplash />
  return (
    <>
      {view === 'editor' && project ? <Editor /> : <StartScreen />}
      {view === 'editor' && project ? null : <Watermark placement="start" />}
      <ToastHost />
    </>
  )
}
