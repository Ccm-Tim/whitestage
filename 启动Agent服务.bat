@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 白膜预演台 Agent 服务
echo 正在启动本地 Agent 桥接：http://127.0.0.1:8787
echo Token: whitestage-local
echo.
node scripts\agent-bridge.mjs
pause
