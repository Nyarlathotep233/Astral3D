# Electron / MCP 本地实施记录

日期：2026-11-03。分支 `feature/desktop-mcp`，基线 `8c8b7cf`。
**部分实现，不是完整 Agent 编辑场景交付。** 未合并、未部署，未执行场景保存。

## 已实现

- Electron main/preload、自定义安全来源 `h3d://app`、现有编辑器生产页面、固定业务代理。
- 原生菜单「MCP → 连接信息 / 复制配置」，随机凭据经 safeStorage 加密保存。
- 仅回环 Streamable HTTP；正式 MCP SDK；Host/Origin/Bearer 校验；严格工具参数。
- 七个只读工具：窗口列表、场景状态、分页对象、UUID 详情、真实资产列表、内置预制体列表、画布截图。
- 明确绑定窗口会话和场景 ID；导航/退出使旧请求失败；截图等待真实帧，不启动脚本运行预览。
- renderer 禁用 Node，启用 contextIsolation、sandbox、webSecurity；未暴露通用 IPC/Shell/FS。
- 打包前重建 SDK 和编辑器；修复原构建配置把整个 process.env 注入浏览器的泄露风险，只保留 NODE_ENV。

## 已验证

- `npm run desktop:test`：5 项通过，含真实 SDK initialize/list/call、错误返回、鉴权/Origin/Host、路径检查、101 对象分页及不修改原数据。
- Vue TypeScript 全量检查通过；生产编辑器构建通过。完整重建/打包复测见下方补充。
- 用户授权显示 Electron 窗口后，通过原生菜单实际复制配置，再以独立 MCP Client 连接。
- 只读打开现有测试副本 `9600ea7d95189faa4acfa697c0a93d68`；实际 backend 为 WebGPU。
- 实际读取 321 个对象（运行时对象计数，不作为持久化内容校验），5 条分页、1 对象详情、资产总数 15、内置预制体 1。
- 实际 PNG 截图 972×674，已目视确认塔吊、天空和地面；错误 sceneId 明确失败。
- 渲染页面 `require` / `process` 均 undefined，来源为安全上下文 `h3d://app`。
- 证据：`.codex-logs/desktop-mcp/live-source/read-only.json`、`viewport.png`、`editor.png`；不含凭据。

## 当前缺口 / 非通过项

- C/D/E：批量命令、失败回滚、撤销重做、资源实例化、材质/脚本编辑、显式保存、Play 工具尚未实施。
- 不宣称已有 Agent 生成复杂场景或保存重载闭环；测试使用官方 SDK Client，不是所有 Agent 产品的兼容验收。
- F 尚未整体通过：安装/卸载、15 分钟混合操作、写操作断连恢复等留待完整功能实现后验收。
- 控制台有既有 THREE 弃用/阴影映射警告、Windows powerPreference 提示，以及 `astral3d.lic` 404；不得伪造许可证或隐藏真实失败。
- 开发启动有 Electron CSP 警告。当前原编辑器依赖动态场景脚本，未通过“禁用脚本”消除警告；正式分发前仍需明确脚本与 CSP 隔离边界。打包后警告不显示不代表风险消失。
- 首页在 1424×895 下第二行及之后卡片明显被压扁，属于实际可见缺陷，不能称整体界面验收通过。本次只记录，未顺带改主页布局。
- CSS/HTML 覆盖层和复杂脚本 Play 兼容尚未全面验收；MCP 截图仅包含渲染画布。简单蓝色方块 Play 已通过下述实测。
- 没有接线上，未验证线上认证、数据格式或任何线上保存。

## 独立打包复测

- SDK、编辑器完整重新构建通过；Vue 类型检查再次通过；5 个测试复跑通过；`git diff --check` 通过。
- 初次重建曾遇到自动生成 `components.d.ts` 的临时写入错误；复跑成功，生成声明未纳入业务改动。
- electron-builder 默认下载过程在显示 100% 后未继续完成。本轮停止该打包进程，显式使用已安装的同版本 `node_modules/electron/dist` 重新打包，未更换 Electron 版本或跳过编辑器构建。
- Windows x64 解包构建已成功：`packages/desktop/release/win-unpacked/H3D Desktop.exe`，含 asar 和 editor 生产资源；日志 `.codex-logs/desktop-package-local-electron.log`。
- 自动启动打包版被工具环境拒绝后，用户于 2026-11-03 手动启动；随后完成下面的真实运行复测。NSIS 安装/卸载仍未验证，不把解包目录称为安装完成。
- 复用 Electron 的手动打包命令（须先完成当前 SDK/editor/desktop build）：

```powershell
# 在 packages/desktop 内运行
./node_modules/.bin/electron-builder.cmd --win dir --publish never --config.electronDist=node_modules/electron/dist
```

### 17:22–17:26 打包版真实运行结果（北京时间）

- 主进程 PID 66144 的实际路径为 `packages/desktop/release/win-unpacked/H3D Desktop.exe`，renderer 参数指向其 `resources/app.asar`；非源码 Electron 启动。
- 本地 8090/8091 均无 Vite 监听。8080 仍是原副本业务服务；8098 MCP 和 9231 临时调试均仅监听 127.0.0.1。
- 原生「连接信息」正确显示 MCP 地址及既有测试 userData；实际点击「复制配置」，独立官方 SDK Client 使用复制结果完成调用。
- 塔吊副本实际 7 工具通过，321 个运行时对象、资产 15、内置预制体 1；972×674 PNG 已目视确认。
- 页面刷新前安装 HTMLCanvas/OffscreenCanvas 监测，本次记录 4 个 `webgpu` 请求，WebGL/WebGL2/experimental-webgl **零次**；主 renderer backend 为 WebGPU。
- 监测期业务请求均为 GET，写请求为零；未执行保存/上传。未捕获未处理 JS 异常，仍有 `astral3d.lic` 404 和平台/THREE 警告；这些不记为无错误通过。
- 无凭据 401，非法 Origin/Host 403。Host 测试使用原生 HTTP request，避免 Node fetch 归一化 Host 导致测试未真正发送预期请求头。
- 整页刷新后 sessionId 更新，旧会话明确失败；关闭场景窗后旧会话失败，主页仍可列出。测试脚本 `tests/desktop-mcp/verify-lifecycle.mjs` 不保存凭据。
- 蓝色方块场景 `db24d798905d186dfb61505f9396d5b8` 的 7 工具也通过；点击实际「运行」后预览状态为运行中，iframe 实际 WebGPU，画面显示方块；点击停止后 iframe 数由 1 变为 0。
- 主页面 require/process 均 undefined；运行 iframe 的 require/process 也 undefined，且无 h3dDesktop 桥。未执行复杂业务脚本安全审计，不扩大结论。
- 验收结束正常关闭客户端：H3D Desktop 进程归零，8098/9231 释放；保留原本地 8080 服务。没有留下临时调试端口。
- 证据目录：`.codex-logs/desktop-mcp/live-packaged`（browser/read-only/lifecycle/exit JSON、截图）；`live-packaged-bluebox`（read-only/play JSON、截图）。没有新建数据库、资源副本或第二套测试 profile。

**结论：独立解包版的桌面启动、只读 MCP、简单运行预览及退出清理通过；首页布局有缺陷，完整批量编辑/保存和安装体验尚未验收。**

## 复测

启动本地副本业务服务和客户端，在客户端打开上述测试场景，点击原生 MCP 复制配置：

```powershell
Get-Clipboard -Raw | node tests/desktop-mcp/verify-live.mjs 9600ea7d95189faa4acfa697c0a93d68 .codex-logs/desktop-mcp/live-source
```

这里只读，不调用 App.toJSON、不创建对象、不保存。历史场景继续只读；后续写入限已授权测试项目。
