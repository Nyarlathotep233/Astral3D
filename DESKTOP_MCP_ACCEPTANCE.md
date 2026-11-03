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

## 阶段 C1：内存批量命令（2026-11-03）

A/B 基础已提交 `01ffd55`。以下为后续阶段，不改变上述历史验收的能力范围。

- 新增 `h3d_scene_batch` / `h3d_history` / `h3d_operation_status`；共 10 个工具。当前支持组、单位方块/平面、半径 0.5 球；局部变换（Euler 弧度）、名称/可见性/阴影属性，以及无脚本子树删除。
- 同批新父节点通过 ref 引用；一次批次一条不可合并历史。expectedRevision 防覆盖、operationId 去重；同 ID 不同请求失败，结果留在当前会话，刷新后不假装还能恢复。
- AtomicBatchCommand 对当前部分执行步骤也执行逆操作；History 只在事务成功后更新栈，undo/redo 和通知失败恢复已有栈。普通手工命令合并行为不改。
- 只允许撤销/重做指定的历史顶端批次，不穿过人工编辑。历史为 session-local；含批次时不输出不可重放的部分 history JSON，场景 Package 保存内容不受此影响。
- 复用现有保存状态：正在保存时 MCP 不插入新写操作，不新增 UI 保存禁用条件。
- 10 项自动测试通过，含 1000 步纯事务、当前步骤部分写入后抛错、undo/redo/History 通知失败恢复、严格 MCP 写入 schema。
- Electron 真实客户端中仅对 `db24d798905d186dfb61505f9396d5b8` 执行内存验收，未保存。100 / 1000 对象批次都恢复到原来 4 个运行时对象；核对 UUID 父节点、修改、去重、修订冲突、历史顶端保护、撤销/重做、准备失败无残留。
- 注入目标网格 updateMatrixWorld 一次性异常：位置已复制后再抛错；真实 MCP 返回失败，位置、此前创建对象、历史栈与原对象摘要全部恢复。探针触发后立即恢复原函数。
- 初次记录的 100 / 1000 对象创建请求往返约 526 / 5497 ms（包括 IPC/CPU/编辑器通知，**不是 GPU 帧耗时**）；仍需减少大批量重复 UI 刷新，不能把核心通过当作性能优化已完成。
- 证据 `.codex-logs/desktop-mcp/write-100.json`、`write-1000.json/.png`、`write-partial-failure.json`；不包含凭据，无新环境副本。
- C1 尚不包含资源导入、材质、脚本、重挂层级、异步任务取消或保存。脚本子树删除明确失败，不静默删除脚本；后续阶段再接通。
- 本阶段源码 Electron 加载重新构建的生产页面，旧 `release/win-unpacked` 仍是 A/B 只读包，**不要把旧 exe 当作本阶段版本**。

手测：启动当前源码 Electron → 打开上述蓝色方块验收场景 → 原生菜单复制 MCP 配置 → 执行 `verify-write.mjs`（100 或 1000）→ 核对批次历史、截图及最终对象恢复。不要保存历史项目；真实服务保存仍未在本阶段执行。

### 首页卡片行高修复

实际原因：定高、可滚动 Grid 的自动行高在溢出隐藏的卡片上被压缩，首行约 280px，后续行约 22px。
最小修复仅增加 `grid-auto-rows: max-content`，保留现有列宽、卡片内容和滚动容器。
重新生产构建并整页刷新 Electron 后，1424×895 下所有卡片约 389px，容器 scrollHeight 2437px；实际滚动后后续卡片内容和操作按钮可见。
截图 `.codex-logs/desktop-mcp/home-fixed.png`、`home-fixed-scrolled.png`，几何测量 `home-layout.json`。上方历史缺陷记录仍保留，不表示当前源码仍未修复。

## 复测

启动本地副本业务服务和客户端，在客户端打开上述测试场景，点击原生 MCP 复制配置：

```powershell
Get-Clipboard -Raw | node tests/desktop-mcp/verify-live.mjs 9600ea7d95189faa4acfa697c0a93d68 .codex-logs/desktop-mcp/live-source
```

这里只读，不调用 App.toJSON、不创建对象、不保存。历史场景继续只读；后续写入限已授权测试项目。

## 阶段 D1：材质参数与 JS 脚本内存编辑（2026-11-03）

- 在既有 batch 中增加 material、script-add/update/remove，不新增另一条写入或保存链路。
- 材质显式选择槽与 shared/object：共享编辑保留 UUID；对象独立编辑克隆该槽，纹理引用保持不变。撤销恢复原材质 UUID、槽引用与材质注册计数，重做复用同一克隆。
- JS 源码、名称、参数按原字段修改；保留脚本数组/对象身份、原本缺省的 params。编辑不执行源码，不开放 eval/Shell/GLSL。主编辑器既有 enableScript=false，未新增自动运行。
- 可删除带脚本对象，撤销恢复其脚本和层级。删除时先完成对象移出，再通知脚本删除，避免脚本通知抛错后逆操作重复注册仍在场的对象。
- 13 项自动测试通过，新增多材质槽/共享引用、脚本身份与缺省字段、脚本删除通知一次性失败后的对象/材质计数恢复。Vue 类型检查、编辑器生产构建通过。
- 真实 Electron + MCP 在蓝色方块验收场景通过：创建、红色材质修改、脚本增改删、带脚本对象删除/恢复、undo/redo、共享材质编辑；最终摘要与初始一致，仍只有原来的 1 个业务网格。
- 截图已目视确认蓝色原对象与红色新增对象；脚本探针未运行，实际 WebGPU，未捕获未处理 JS 异常，观测到的业务写请求为零。全部测试改动已撤销，**没有保存/上传**。
- 证据：`.codex-logs/desktop-mcp/material-script.json`、`material-script.png`、`material-script-browser.json`。重建期间曾过早打开页面得到 Resource request failed；等待构建完成后重新加载通过，未新增资源兜底。
- 本阶段仍是源码 Electron + 生产页面；旧解包 exe 未更新。资源导入、纹理编辑、Play/保存工具、安装验收仍未完成，不称完整 MCP 编辑交付。

手测：当前源码 Electron → 蓝色方块验收场景 → 复制 MCP 配置 → `Get-Clipboard -Raw | node tests/desktop-mcp/verify-material-script.mjs .codex-logs/desktop-mcp/material-script.json`。核对红色截图、历史中一批一项及最终恢复；不要保存。开发者手工验收及服务保存重载仍是后续门禁。

D1 结束前再次执行 100 对象批次回归通过（往返约 426 ms，不是 GPU 耗时），恢复到原 4 个运行时对象；未处理 JS 错误为空，脚本探针仍未执行。正常关闭两扇测试窗口后 8098 / 9231 释放，只保留既有 8080 副本服务。

## 历史 D2 草案：目录授权（已被用户取消，非当前行为）

- 已确认采用「原生目录选择 + 相对路径」；不开放任意磁盘读取。原生菜单支持选择/查看/撤销，授权仅保存在主进程内存。
- 新增 h3d_model_prepare / h3d_model_job、批次 insert-model。准备、取消与单次消费独立于场景；未成功解析不插入；仍无自动保存或上传。
- 目录和依赖逐次 realpath 检查，测试覆盖绝对路径、路径穿越、URL 编码、Windows junction 越界、非模型文件、撤销/重授后旧 URL 失效。测试只使用自行创建的微型 OS 临时目录，结束已移除，不涉及业务资源目录。
- 准备器复用 SDK GLTFLoader，独立 decoder 生命周期避免取消/清理误销毁其他加载器；不替换既有 UI 导入路径。缺失纹理/越界依赖作为失败，不接受 GLTFLoader 可能返回的残缺材质结果。
- 15 项自动测试、SDK 构建、Vue 类型检查、编辑器及桌面生产构建通过。日志 desktop-import-sdk-build.log / desktop-import-typecheck.log / desktop-import-editor-build.log。
- 可见 Electron 中已验证新增原生菜单、蓝色方块页面实际 WebGPU；未捕获页面未处理异常。真实 MCP 在尚未选择目录时明确拒绝准备请求，场景摘要和 revision 均未改变，证据 desktop-mcp/local-import-ungranted.json。
- **尚未完成正向真实文件导入验收**：测试窗口已打开，等待用户在原生菜单点选授权目录。测试源拟使用仓库现有 public/static/model，不复制模型、不新建业务库/profile。用户允许只读使用该目录，权限点选本身交由用户完成。
- 后续运行 tests/desktop-mcp/verify-local-import.mjs：验证木凳 GLB 的准备/取消、单次入场、UUID/层级、截图及 undo/redo，全部撤回、不保存。多文件 glTF 缺失依赖、撤销授权后的实际运行行为、复杂骨骼/动画仍需进一步浏览器验收；不能以单元测试替代。

## 新计划阶段 0：绝对路径 GLB/glTF（2026-11-03）

- 用户取消目录授权/白名单；原生菜单现只有连接信息/复制配置，已实际观察确认。绝对路径可来自工作区外目录，正常 ../ 依赖和目录链接不被当作越权。
- 真实源码 Electron 加载生产构建：内置木凳 GLB 及由它生成的多文件 glTF（../buffers/stool.bin）均通过准备不入场、取消、去重、单次提交、位置/缩放/命名、材质独立修改、贴图引用保持、撤销重做及最终恢复。
- 缺失 buffer / 贴图都返回 failed，场景摘要、revision 未变；没有白模或缺贴图对象入场。阶段证据 local-import.json/.png、local-import-gltf.json/.png、local-import-errors.json、local-import-browser.json。
- 截图已目视确认原蓝色方块和带纹理木凳；实际 WebGPU，观测期无未处理 JS 异常、无业务写请求。预期的缺失资源日志保留，不记为“无错误日志”。
- 15 项测试通过；SDK/编辑器/桌面构建与 Vue 类型检查通过。全部场景操作仅内存，已撤销，无保存/上传。
- 新增 create-import-fixtures.mjs 只从既有木凳生成微型测试派生文件，放在 .codex-logs/desktop-mcp/import-fixtures；不复制数据库、完整模型库或 profile。
- 手测：源码客户端打开蓝色方块验收场景 → 原生菜单复制配置 → verify-local-import.mjs（默认 GLB 或传 glTF 绝对路径）→ verify-import-errors.mjs。旧独立 exe 未更新；全部格式、骨骼/动画、服务保存及双 Agent 完整验收仍未完成。

## 新计划阶段 1A：能力目录与按需参数（2026-11-03）

- 新增 h3d_capabilities，未打开编辑窗口也可调用。120 项目录中 available 11、partial 4、planned 105；这是按描述范围划分的实现状态，**不是完成率，也不是完整功能验收**。
- 目录记录 GUI/源码共享入口、正式 MCP 操作、副作用、撤销、测试入口及限制；JSON 同源生成 H3D_MCP_CAPABILITY_MATRIX.md，自动测试检查路径、工具引用和生成文件一致。
- 仅按需返回正式 Zod 定义生成的 JSON Schema；与 tools/list 的 schema 实测一致。不另造一份参数契约，不把 planned 广告为可调用工具。
- 17 项桌面测试及桌面生产构建通过，含真实 SDK Streamable HTTP 初始化、发现、调用、校验错误及无窗口能力发现。
- 当前运行的 Electron 仍是上一构建；自动重启命令被执行环境拦截，已给出用户手动重启命令。新目录的实际 Electron 进程验证待重启，不以 SDK 服务测试代替。
- 阶段 1 的批次资源恢复、通用任务/确认语义尚在推进，不将此子提交称为阶段 1 完成。

## 新计划阶段 1B：子树资源注册失败恢复（2026-11-03）

- 修复实际缺口：子树注册/注销到一半失败，不能再对整棵子树做普通逆操作，否则未访问的共享材质会被扣计数或重复登记。
- SDK App.addObject/removeObject 共用局部登记事务：只记录目标子树涉及的材质计数、几何、相机、辅助对象、动画及 HTML 位置，不对每个对象复制全场景。失败恢复后明确报错；MCP 当前步骤不重复逆操作，之前已完成步骤仍正常回滚。
- 使用真实 App 方法的故障测试覆盖添加/删除、共享材质、相机辅助对象、动画 clips、新建及既有 mixer；持续观察者故障明确返回 recoveryFailed。MCP 另测已恢复步骤不重复扣资源。
- 生产页面已重新加载最新编辑器构建（Electron 主进程仍旧）。真实木凳导入/材质/撤销重做回归和 100 对象批次通过，最终恢复原 4 个运行时对象。100 对象往返 594 ms，是 MCP/CPU/通知总往返，非 GPU 帧耗时。
- 浏览器实际注入一次 material 注册中断，两个共享 mesh 的 glTF 导入失败；对象、历史及资源登记快照完全一致，job 未消费、原请求重试仍失败，可取消准备资源。证据 registration-failure.json、registration-browser.json、registration-import.json/.png、registration-batch100.json/.png；无未处理 JS 异常，实际 WebGPU、脚本未运行。此项是主验收方故障回归，**不是 Agent 自主验收**。
- SDK/编辑器构建和项目原有 tsc 检查通过。仓库没有 vue-tsc 可执行项，未声称完成独立 Vue 模板类型检查。23 项桌面测试通过；最后补的既有 mixer cache 回收分支有真实 Three.js 单元覆盖，需随下一生产重建继续回归。
- 手测入口：源码客户端 `h3d://app/#/editor/db24d798905d186dfb61505f9396d5b8`，确认只有原蓝色方块；复制 MCP 配置，运行 verify-local-import.mjs 和 verify-write.mjs，观察新增对象和历史后最终恢复。不要保存。
- 故障复测：生成 import-fixtures；browser-harness 在该测试 tab 执行 registration-probe.py（H3D_PROBE_PHASE=arm），再运行 verify-registration-failure.mjs；最后 phase=check，确认真实状态恢复并移除探针。仅微型夹具，不针对共享上传目录。开发者手工验收及完整保存重载仍未完成，不合并。

## 双 Agent 提前探测及 schema 兼容修正（未完成阶段 6）

- Codex 已用正式 MCP 实跑只读任务（9 次 H3D 调用，未使用 Shell/CDP 改场景），读回与独立浏览器结果一致。发现 batch 工具 schema 被客户端拒绝，不能声称已具备正常编辑能力。
- 最小修正：三维向量由 JSON Schema 的 tuple items 改为等价的固定长度 number array，同一工具定义供所有客户端使用；数值、长度、参数名及业务含义不变。23 项单测通过，主进程重启后的真实客户端复测待完成。
- DeepSeek Harness 0.2.1-rc.2 已真实调用 headless CLI + 临时 MCP overlay，但模型路由缺 DEEPSEEK_API_KEY，未发生模型工具调用，明确标记未通过。未读取其他凭据或改全局配置；已请用户配置。
- 两客户端共用 tests/desktop-mcp/agent-readonly-task.txt；运行脚本、配置和完整边界见该目录 AGENT_ACCEPTANCE.md。该只读初测不能替代最终完整双 Agent 验收。
