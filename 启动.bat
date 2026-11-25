@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 白膜预演台 WhiteStage

if not exist node_modules (
  echo [1/3] 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败，请检查 Node.js 与网络后重试。
    pause
    exit /b 1
  )
)

echo [2/4] 正在启动本地 Agent 桥接（端口 8787）...
start "WhiteStage Agent 8787" /min cmd /c "node scripts\agent-bridge.mjs"

echo [3/4] 正在启动本地 Web 服务...
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:5175"
echo [4/4] 浏览器将自动打开：http://127.0.0.1:5175
echo.
echo 应用端口：5175    本地 Agent 端口：8787
echo 关闭此窗口即可停止 Web 服务；Agent 在单独窗口运行。
echo.

call npx vite --host 127.0.0.1 --port 5175
pause
