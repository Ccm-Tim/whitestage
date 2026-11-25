#!/usr/bin/env node
/**
 * 生成便携版：在标准 release 里加入当前 Node 运行时，
 * 不要求目标电脑安装 Node.js。
 */
import { execSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const RELEASE_ROOT = path.join(ROOT, 'release')
const STANDARD = path.join(RELEASE_ROOT, 'WhiteStage')
const OUT = path.join(RELEASE_ROOT, 'WhiteStage-portable')
const RUNTIME = path.join(OUT, 'runtime')

function collect(dir, prefix = '') {
  const files = {}
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(full).isDirectory()) Object.assign(files, collect(full, rel))
    else files[rel] = new Uint8Array(readFileSync(full))
  }
  return files
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const name of readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    if (statSync(from).isDirectory()) copyDir(from, to)
    else writeFileSync(to, readFileSync(from))
  }
}

function copyFile(src, dest) {
  writeFileSync(dest, readFileSync(src))
}

console.log('[portable] 先构建标准发布版...')
execSync('node scripts/package-release.mjs', { cwd: ROOT, stdio: 'inherit' })

console.log('[portable] 复制标准版并加入 Node 运行时...')
execSync(
  `powershell -NoProfile -Command "if (Test-Path -LiteralPath '${OUT}') { Remove-Item -LiteralPath '${OUT}' -Recurse -Force }"`,
  { cwd: ROOT, stdio: 'inherit' },
)
copyDir(STANDARD, OUT)
mkdirSync(RUNTIME, { recursive: true })
copyFile(process.execPath, path.join(RUNTIME, 'node.exe'))
writeFileSync(
  path.join(RUNTIME, 'README.txt'),
  'Node.js runtime bundled for WhiteStage portable release.\nNode.js is licensed under the MIT license.\nhttps://nodejs.org/\n',
  'utf8',
)

const launcherPath = path.join(OUT, '启动.bat')
const launcher = readFileSync(launcherPath, 'utf8').replace(
  'set "NODE=node"',
  'set "NODE=%~dp0runtime\\node.exe"',
)
writeFileSync(launcherPath, launcher, 'utf8')

const agentPath = path.join(OUT, '启动Agent服务.bat')
const agent = readFileSync(agentPath, 'utf8').replace(
  'node scripts\\agent-bridge.mjs',
  '"%~dp0runtime\\node.exe" scripts\\agent-bridge.mjs',
)
writeFileSync(agentPath, agent, 'utf8')

writeFileSync(
  path.join(OUT, '便携版说明.txt'),
  `WhiteStage 便携版

- 已内置 Node.js 运行时，目标电脑不需要安装 Node。
- 双击「启动.bat」即可。
- 应用：http://127.0.0.1:5175
- 本地 Agent：http://127.0.0.1:8787
- 如仍打不开，双击「诊断.bat」查看 Node / 文件 / 端口状态。
`,
  'utf8',
)

console.log('[portable] 写入 zip...')
const files = collect(OUT, 'WhiteStage-portable')
const zipped = zipSync(files, { level: 6 })
const zipPath = path.join(RELEASE_ROOT, 'WhiteStage-v0.1.2-portable.zip')
writeFileSync(zipPath, zipped)
console.log('')
console.log(`[portable] 目录: ${OUT}`)
console.log(`[portable] 压缩包: ${zipPath} (${(zipped.byteLength / 1024 / 1024).toFixed(1)} MB)`)
console.log('[portable] 完成')
