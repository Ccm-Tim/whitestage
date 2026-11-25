import { executeAgentCommand } from './commands'

export type AgentConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline'

interface StartOptions {
  url: string
  token: string
  onStatus: (status: AgentConnectionStatus) => void
}

interface AgentCommandEnvelope {
  id: string
  method: string
  params?: Record<string, unknown>
}

/**
 * 本地 Agent 桥接客户端：轮询本地端口 8787 的命令队列。
 * 只有本地 bridge 运行时才会 online；未启动时保持 offline，不影响应用。
 */
export function startAgentClient({ url, token, onStatus }: StartOptions): () => void {
  let stopped = false
  let timer: number | null = null
  let busy = false
  let failures = 0

  const schedule = (delay: number) => {
    if (stopped) return
    timer = window.setTimeout(() => void poll(), delay)
  }

  const poll = async () => {
    if (stopped || busy) return
    busy = true
    try {
      const response = await fetch(
        `${url.replace(/\/$/, '')}/poll?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      )
      if (!response.ok) throw new Error(`poll ${response.status}`)
      const data = (await response.json()) as { commands?: AgentCommandEnvelope[] }
      const commands = Array.isArray(data.commands) ? data.commands : []
      failures = 0
      onStatus('online')
      for (const command of commands) {
        let ok = true
        let result: unknown = null
        let error = ''
        try {
          result = await executeAgentCommand(command.method, command.params ?? {})
        } catch (err) {
          ok = false
          error = err instanceof Error ? err.message : String(err)
        }
        await fetch(`${url.replace(/\/$/, '')}/result?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: command.id, ok, result, error }),
        }).catch(() => {})
      }
      busy = false
      schedule(220)
    } catch {
      busy = false
      failures += 1
      if (failures === 1) onStatus('offline')
      schedule(Math.min(5000, 800 + failures * 500))
    }
  }

  onStatus('connecting')
  schedule(0)
  return () => {
    stopped = true
    if (timer !== null) window.clearTimeout(timer)
    onStatus('idle')
  }
}
