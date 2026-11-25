#!/usr/bin/env node
/**
 * 生成 WhiteStage 正式发布包：
 *   release/WhiteStage/      可直接运行的目录
 *   release/WhiteStage-v0.1.zip
 *
 * 发布包只需要 Node.js，不需要 npm install / Vite。
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
const DIST = path.join(ROOT, 'dist')
const RELEASE_ROOT = path.join(ROOT, 'release')
const OUT = path.join(RELEASE_ROOT, 'WhiteStage')
const APP = path.join(OUT, 'app')

function collect(dir, prefix = '') {
  const files = {}
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    const info = statSync(full)
    if (info.isDirectory()) {
      Object.assign(files, collect(full, rel))
    } else {
      files[rel] = new Uint8Array(readFileSync(full))
    }
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

function normalizeBatLineEndings(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      normalizeBatLineEndings(full)
      continue
    }
    if (!name.toLowerCase().endsWith('.bat')) continue
    const text = readFileSync(full, 'utf8').replace(/\r?\n/g, '\r\n')
    writeFileSync(full, text, 'utf8')
  }
}

console.log('[package] 清理 dist 并重新构建...')
execSync(
  `powershell -NoProfile -Command "if (Test-Path -LiteralPath '${DIST}') { Remove-Item -LiteralPath '${DIST}' -Recurse -Force }"`,
  { cwd: ROOT, stdio: 'inherit' },
)
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

console.log('[package] 组装 release/WhiteStage ...')
execSync(
  `powershell -NoProfile -Command "if (Test-Path -LiteralPath '${OUT}') { Remove-Item -LiteralPath '${OUT}' -Recurse -Force }"`,
  { cwd: ROOT, stdio: 'inherit' },
)
mkdirSync(path.join(OUT, 'scripts'), { recursive: true })
copyDir(DIST, APP)
copyFile(path.join(ROOT, 'scripts', 'agent-bridge.mjs'), path.join(OUT, 'scripts', 'agent-bridge.mjs'))
copyFile(path.join(ROOT, 'scripts', 'serve-release.mjs'), path.join(OUT, 'scripts', 'serve-release.mjs'))
copyFile(path.join(ROOT, 'README.md'), path.join(OUT, 'README.md'))
copyFile(path.join(ROOT, 'AGENT.md'), path.join(OUT, 'AGENT.md'))
copyFile(path.join(ROOT, 'ACCEPTANCE.md'), path.join(OUT, 'ACCEPTANCE.md'))

writeFileSync(
  path.join(OUT, '启动.bat'),
  `@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 白膜预演台 WhiteStage
set "NODE=node"
rem PORTABLE_NODE
echo 正在检查运行环境...
"%NODE%" -v >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 没有检测到 Node.js。
  echo 这个发布版需要 Node.js 才能启动本地服务。
  echo 请安装 Node.js LTS（https://nodejs.org/），安装后重新双击本文件。
  echo 也可以使用 WhiteStage-v0.1-portable.zip 便携版，无需安装 Node。
  echo.
  pause
  exit /b 1
)
echo 正在启动 WhiteStage...
echo 应用端口 5175    本地 Agent 端口 8787
start "WhiteStage Agent 8787" /min "%NODE%" scripts\\agent-bridge.mjs
start /b "" "%NODE%" scripts\\serve-release.mjs
echo 等待本地服务就绪...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 40;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5175/' -TimeoutSec 1; if($r.StatusCode -eq 200){ $ok=$true; break } } catch {}; Start-Sleep -Milliseconds 250 }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo.
  echo [错误] 本地服务没有启动成功。
  echo 请双击「诊断.bat」检查 Node、文件和端口 5175。
  echo 常见原因：5175 被占用，或压缩包没有完整解压。
  echo.
  pause
  exit /b 1
)
if not defined WHITESTAGE_NO_BROWSER start "" http://127.0.0.1:5175
echo.
echo 服务已启动：http://127.0.0.1:5175
echo 关闭此窗口会停止本地 Web 服务。
echo.
pause
`,
  'utf8',
)

writeFileSync(
  path.join(OUT, '诊断.bat'),
  `@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title WhiteStage 诊断
echo ===== WhiteStage 诊断 =====
echo.
echo [Node 版本]
if exist "%~dp0runtime\\node.exe" (
  set "NODE=%~dp0runtime\\node.exe"
) else (
  set "NODE=node"
)
"%NODE%" -v
if errorlevel 1 echo [失败] 没有找到 Node，请安装 Node.js 或使用 portable 版。
echo.
echo [关键文件]
if exist "app\\index.html" (echo OK app\\index.html) else (echo 缺少 app\\index.html，压缩包可能没解压完整)
if exist "scripts\\serve-release.mjs" (echo OK scripts\\serve-release.mjs) else (echo 缺少 scripts\\serve-release.mjs)
if exist "scripts\\agent-bridge.mjs" (echo OK scripts\\agent-bridge.mjs) else (echo 缺少 scripts\\agent-bridge.mjs)
echo.
echo [端口 5175]
netstat -ano | findstr ":5175"
if errorlevel 1 echo 5175 当前没有监听。
echo.
echo [端口 8787]
netstat -ano | findstr ":8787"
if errorlevel 1 echo 8787 当前没有监听。
echo.
pause
`,
  'utf8',
)

writeFileSync(
  path.join(OUT, '启动Agent服务.bat'),
  `@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title WhiteStage Agent 8787
node scripts\\agent-bridge.mjs
pause
`,
  'utf8',
)

writeFileSync(
  path.join(OUT, '版本说明.txt'),
  `WhiteStage 白膜预演台 · 本地版 v0.1（M6 收尾阶段）

启动：
  双击「启动.bat」。
  应用：http://127.0.0.1:5175
  本地 Agent：http://127.0.0.1:8787（默认 Token whitestage-local）

已具备：
  - 本地工程、历史、自动保存、.wsp 导入导出
  - 纯色 / 图片 / 360 / 180 / 星球背景
  - 多图背景板：横向 / 0–360° 曲面、接缝羽化、文件名排序、整板锁定
  - 人偶、道具、对象移动缩放、穿地、目标锁定
  - 角色编辑器、自定义角色库、手部武器
  - 多机位分屏、实时景深
  - 时间线关键帧、播放、自动关键帧、吸附
  - WebM / MP4 / MOV / FLV / PNG 序列视频导出
  - 撤销 / 重做
  - 本地 Agent 8787 + AI 配置预留

已知限制：
  - MOV 使用 H.264/ISO 兼容封装，严格 QuickTime 工具可能要求转码
  - FLV 为单路 H.264、无音频
  - 所有视频导出均无音频
  - 景深是屏幕空间近似
  - 需要 Node.js 与 Chrome / Edge（WebGL2 / WebCodecs）

验收：
  1. 双击启动.bat，确认应用与 Agent 窗口运行
  2. 新建工程，添加人偶与背景，做一次关键帧动画
  3. 导出视频（WebM / MP4）并播放
  4. 刷新页面，确认自动保存恢复
  5. 用 POST http://127.0.0.1:8787/rpc 调 app.status
`,
  'utf8',
)

console.log('[package] 写入 zip ...')
normalizeBatLineEndings(OUT)
const files = collect(OUT, 'WhiteStage')
const zipped = zipSync(files, { level: 6 })
const zipPath = path.join(RELEASE_ROOT, 'WhiteStage-v0.1.zip')
writeFileSync(zipPath, zipped)
console.log('')
console.log(`[package] 目录: ${OUT}`)
console.log(`[package] 压缩包: ${zipPath} (${(zipped.byteLength / 1024 / 1024).toFixed(1)} MB)`)
console.log('[package] 完成')
