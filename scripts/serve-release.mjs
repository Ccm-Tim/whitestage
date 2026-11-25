#!/usr/bin/env node
/**
 * WhiteStage 正式版静态服务器
 * - 只绑定 127.0.0.1
 * - 端口默认 5175，可用 APP_PORT 修改
 * - app/ 目录为 Vite 构建产物
 */
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const APP_DIR = path.join(ROOT, 'app')
const HOST = '127.0.0.1'
const PORT = Number(process.env.APP_PORT || 5175)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

function safePath(urlPath, root) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const resolved = path.resolve(root, `.${decoded}`)
  return resolved.startsWith(root) ? resolved : null
}

async function sendFile(req, res, filePath) {
  const info = await stat(filePath).catch(() => null)
  if (!info || !info.isFile()) return false
  const ext = path.extname(filePath).toLowerCase()
  const cache =
    filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-store'
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': cache,
  })
  if (req.method === 'HEAD') {
    res.end()
  } else {
    createReadStream(filePath).pipe(res)
  }
  return true
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end('Method Not Allowed')
    return
  }

  const pathname = new URL(req.url || '/', `http://${HOST}:${PORT}`).pathname
  let filePath = safePath(pathname, APP_DIR)
  if (!filePath) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  if (pathname === '/' || pathname === '') {
    filePath = path.join(APP_DIR, 'index.html')
  } else if (!path.extname(filePath)) {
    filePath = path.join(APP_DIR, 'index.html')
  }

  if (await sendFile(req, res, filePath)) return
  if (await sendFile(req, res, path.join(APP_DIR, 'index.html'))) return
  res.writeHead(404)
  res.end('Not Found')
})

server.listen(PORT, HOST, () => {
  console.log('')
  console.log('  WhiteStage 正式版')
  console.log(`  地址: http://${HOST}:${PORT}`)
  console.log('  仅监听本机；关闭此窗口即停止。')
  console.log('')
})

server.on('error', (err) => {
  console.error('[serve-release]', err.message)
  process.exitCode = 1
})
