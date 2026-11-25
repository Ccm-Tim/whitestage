#!/usr/bin/env node
/**
 * WhiteStage 本地 Agent 桥接服务
 *
 * - 只绑定 127.0.0.1
 * - 端口默认 8787，可用 AGENT_PORT 修改
 * - Token 默认 whitestage-local，可用 AGENT_TOKEN 修改
 *
 * 浏览器端在 src/agent/client.ts 中轮询 /poll 并回传 /result。
 * 外部 Agent 调用 POST /rpc，即可控制当前打开的 WhiteStage 页面。
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const HOST = '127.0.0.1'
const PORT = Number(process.env.AGENT_PORT || 8787)
const TOKEN = process.env.AGENT_TOKEN || 'whitestage-local'
const RPC_TIMEOUT = 30_000

/** @type {{id:string,method:string,params:Record<string,unknown>}[]} */
const queue = []
/** @type {Map<string,{resolve:Function,reject:Function,timer:NodeJS.Timeout}>} */
const pending = new Map()
let lastPoll = 0
let lastCommandAt = 0

function tokenOf(req, url) {
  return req.headers['x-agent-token'] || url.searchParams.get('token') || ''
}

function allowed(req, url) {
  return tokenOf(req, url) === TOKEN
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-agent-token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(payload)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 8 * 1024 * 1024) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

  if (req.method === 'OPTIONS') {
    send(res, 204, '')
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, {
      ok: true,
      name: 'whitestage-agent-bridge',
      port: PORT,
      appOnline: Date.now() - lastPoll < 4000,
      queued: queue.length,
      pending: pending.size,
      lastPoll,
    })
    return
  }

  if (!allowed(req, url)) {
    send(res, 401, { ok: false, error: 'invalid token' })
    return
  }

  if (req.method === 'GET' && url.pathname === '/poll') {
    lastPoll = Date.now()
    const commands = queue.splice(0, queue.length)
    if (commands.length > 0) lastCommandAt = Date.now()
    send(res, 200, { commands })
    return
  }

  if (req.method === 'POST' && url.pathname === '/result') {
    try {
      const body = await readJson(req)
      if (typeof body.id !== 'string') throw new Error('missing id')
      const item = pending.get(body.id)
      if (item) {
        pending.delete(body.id)
        clearTimeout(item.timer)
        item.resolve({
          ok: body.ok !== false,
          result: body.result ?? null,
          error: typeof body.error === 'string' ? body.error : '',
        })
      }
      lastPoll = Date.now()
      send(res, 200, { ok: true })
    } catch (err) {
      send(res, 400, { ok: false, error: String(err?.message || err) })
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/rpc') {
    if (Date.now() - lastPoll > 6000) {
      send(res, 503, {
        ok: false,
        error: 'WhiteStage 页面未连接或未打开，请先启动 启动.bat 并保持页面打开',
      })
      return
    }
    let body
    try {
      body = await readJson(req)
    } catch (err) {
      send(res, 400, { ok: false, error: String(err?.message || err) })
      return
    }
    const method = typeof body.method === 'string' ? body.method : ''
    if (!method) {
      send(res, 400, { ok: false, error: 'missing method' })
      return
    }
    const id = randomUUID()
    const params = body.params && typeof body.params === 'object' ? body.params : {}
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('agent command timeout'))
      }, RPC_TIMEOUT)
      pending.set(id, { resolve, reject, timer })
    })
    queue.push({ id, method, params })
    try {
      const value = await result
      send(res, value.ok ? 200 : 400, value)
    } catch (err) {
      send(res, 504, { ok: false, error: String(err?.message || err) })
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/commands') {
    send(res, 200, {
      ok: true,
      message: '命令表由页面提供；调用 /rpc {"method":"app.status"} 可确认连通性。完整文档见 AGENT.md。',
    })
    return
  }

  send(res, 404, { ok: false, error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log('')
  console.log('  WhiteStage Agent Bridge')
  console.log(`  地址: http://${HOST}:${PORT}`)
  console.log(`  Token: ${TOKEN}`)
  console.log('  仅监听本机；关闭此窗口即停止。')
  console.log('')
})

server.on('error', (err) => {
  console.error('[agent-bridge]', err.message)
  process.exitCode = 1
})
