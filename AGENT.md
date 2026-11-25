# WhiteStage 本地 Agent 控制 / AI 接口

最后更新：M4。

## 端口

| 用途 | 地址 |
| --- | --- |
| 应用 Web UI | `http://127.0.0.1:5175` |
| 本地 Agent 桥接 | `http://127.0.0.1:8787` |

全部只绑定 `127.0.0.1`，默认不对外网开放。

## 启动

直接双击 `启动.bat`，会同时：

1. 启动 Agent 桥接：`node scripts/agent-bridge.mjs`
2. 启动 Vite：`http://127.0.0.1:5175`
3. 打开浏览器

也可以单独运行 `启动Agent服务.bat`，或者手动：

```bash
node scripts/agent-bridge.mjs
```

默认 Token：`whitestage-local`。

可用环境变量修改：

```powershell
$env:AGENT_PORT=8787
$env:AGENT_TOKEN="换一个本地 token"
node scripts/agent-bridge.mjs
```

> 如果改了 Agent Token，需要让页面里的 Agent 设置使用同一个 Token；当前 UI 使用默认值，修改环境变量后建议保持默认或自行调整源码设置。

## 工作方式

```text
外部 Agent
   │  POST /rpc
   ▼
本地桥接 :8787
   │  GET /poll  ← 浏览器页面每 220ms 轮询
   ▼
WhiteStage 页面
   │  POST /result
   ▼
桥接返回给外部 Agent
```

浏览器页面不需要额外开服务，只要 `启动.bat` 起的页面保持打开，Agent 就能控制。

## 健康检查

```powershell
curl.exe http://127.0.0.1:8787/health
```

返回中的 `appOnline` 表示当前是否有 WhiteStage 页面在轮询。

## 调用命令

统一入口：

```http
POST http://127.0.0.1:8787/rpc
Content-Type: application/json
x-agent-token: whitestage-local
```

Body：

```json
{
  "method": "app.status",
  "params": {}
}
```

示例：

```powershell
curl.exe -s http://127.0.0.1:8787/rpc `
  -H "content-type: application/json" `
  -H "x-agent-token: whitestage-local" `
  -d "{\"method\":\"app.status\"}"
```

创建工程并添加人偶：

```powershell
curl.exe -s http://127.0.0.1:8787/rpc -H "content-type: application/json" -H "x-agent-token: whitestage-local" -d "{\"method\":\"app.createProject\",\"params\":{\"name\":\"Agent 测试\"}}"

curl.exe -s http://127.0.0.1:8787/rpc -H "content-type: application/json" -H "x-agent-token: whitestage-local" -d "{\"method\":\"object.add\",\"params\":{\"presetId\":\"man-adult\"}}"
```

截图（返回 dataURL）：

```powershell
curl.exe -s http://127.0.0.1:8787/rpc -H "content-type: application/json" -H "x-agent-token: whitestage-local" -d "{\"method\":\"editor.screenshot\",\"params\":{\"maxWidth\":1280}}"
```

## 当前命令

| method | 说明 |
| --- | --- |
| `app.status` | 当前视图、工程、选中状态 |
| `app.listProjects` | 本地工程历史 |
| `app.getProject` | 当前工程 JSON |
| `app.createProject` | 新建工程 `{name}` |
| `app.openProject` | 打开工程 `{id}` |
| `app.save` | 保存 |
| `app.closeProject` | 返回开始页 |
| `project.patch` | 改工程名 / stage / output / ui |
| `camera.list` / `camera.add` / `camera.select` / `camera.update` / `camera.remove` | 机位管理 |
| `camera.setTarget` / `camera.unlock` | 目标锁定 |
| `object.list` / `object.add` / `object.addCustom` / `object.select` / `object.update` / `object.remove` / `object.duplicate` | 对象管理 |
| `stage.update` | 网格、白地、阴影、雾效 |
| `preview.update` | 预览窗位置 / 尺寸 / 机位 |
| `output.update` | 画幅 / 分辨率 / 帧率 |
| `background.setSolid` | 纯色背景 |
| `background.board.active` | 选中的背景板 `{id}` |
| `background.board.updateItem` | 更新某张板 `{id, patch}` |
| `background.board.remove` | 删除某张板 `{id}` |
| `background.board.align` | 按宽度横向拼接 |
| `background.board.update` | 更新背景板 `{patch}`，如 `{curve:180, feather:0.15}` |
| `background.board.lock` | 锁定 / 解锁 `{locked}` |
| `background.board.sort` | 按文件名序号排序 |
| `background.board.fallback` | 背景板底色 `{color}` |
| `tool.set` | select / translate / rotate / scale |
| `timeline.list` | 关键帧列表 / 当前帧 / 播放状态 |
| `timeline.addKeyframe` | 当前帧记录 / 更新关键帧 |
| `timeline.removeKeyframe` | 删除 `{frame}`，省略则当前帧 |
| `timeline.setPlayhead` | 跳到 `{frame}` |
| `timeline.play` / `timeline.pause` | 播放 / 暂停 |
| `timeline.setDuration` | 时间线长度 `{frames}` |
| `timeline.setAutoKey` | 自动关键帧 `{enabled}` |
| `timeline.clear` | 清空关键帧 |
| `editor.focus` | 聚焦选中对象 |
| `editor.screenshot` | 当前预览截图 |
| `history.undo` / `history.redo` | 撤销 / 重做 |
| `history.status` | 撤销 / 重做栈状态 |
| `agent.ping` | 连通性 |

`object.update` 的 `patch` 支持当前对象字段，例如：

```json
{
  "method": "object.update",
  "params": {
    "id": "对象 id",
    "patch": {
      "position": { "x": 0, "y": 0, "z": 1 },
      "scale": { "x": 2, "y": 2, "z": 2 },
      "allowUnderground": true
    }
  }
}
```

返回：

```json
{ "ok": true, "result": ... }
```

失败：

```json
{ "ok": false, "error": "..." }
```

## AI 接口（预留）

页面「场景 → AI 接口（预留）」可保存：

- 服务商（OpenAI 兼容 / 自定义）
- Base URL
- 模型
- API Key

当前版本只保存在本机 IndexedDB，**不会发起网络请求**。

预留代码：

- `src/ai/types.ts`
- `src/ai/client.ts`

未来接入聊天 / 图片 / 文件上传时，AI 返回的工具调用直接转给 `src/agent/commands.ts` 的 `executeAgentCommand`，因此 AI 和外部 Agent 共用同一套控制能力。

## 安全说明

- 桥接只监听 `127.0.0.1`；不要把它暴露到公网。
- 默认 Token 是本地开发用；多人环境请修改 `AGENT_TOKEN`。
- API Key 只保存在本机 IndexedDB，但本机浏览器用户仍可读取；不要在不信任的电脑上填写。
- `/rpc` 能修改工程、对象、机位，等同于本地操作权限。
- 页面关闭后 `/rpc` 会返回 503。

## 当前限制

- 需要 WhiteStage 页面保持打开；页面关闭后没有可控制实例。
- 文件上传 / 全景图片导入还没有 Agent 命令，后续会补 dataURL/文件接口。
- 时间线、视频导出、多机位分屏尚未完成，相关命令要等对应模块。
- 一个页面只接受一个本地 Agent 命令队列；多 Agent 共享同一队列。
