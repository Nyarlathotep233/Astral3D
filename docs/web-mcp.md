# H3D Web MCP

本地 Agent 通过标准 MCP HTTP 连接服务端桥接器，桥接器只将指令转发给已授权的编辑器页面。场景编辑、材质编译和预览都在浏览器中执行。最终用户只需要浏览器和支持 HTTP MCP 的 Agent；桥接器由项目部署方与现有 Java 后端一起运行。

## 启动与连接

开发环境：

```powershell
pnpm install
pnpm sdk:build
pnpm editor:dev
# 另一个终端运行服务端桥接器
pnpm mcp:dev
```

现有 Java API 需正常运行。默认编辑器 `https://localhost:8090`，桥接器只监听 `127.0.0.1:8098`。Vite 已代理 `/agent` 的 HTTP/WebSocket 与 `/mcp`。

前后端需一同更新。后端启动时 Flyway 会应用 V4 保存回执表、V5 上传路径字段扩容和 V6 旧版分包上传登记表。旧版编辑器并发上传同一项目、同一版本的同名文件时，内容相同可以重试，内容不同会返回 409。遇到冲突时请保留本地编辑，重新打开最新项目后再合并修改。开发验收使用独立的本地开发库。

1. 打开项目或首页，点击顶部“连接 Agent”。
2. 点击“授权连接此页面”，复制 MCP 地址和令牌。
3. 在 Agent 中配置 HTTP MCP 地址与 Bearer 令牌。Codex 可使用：

```powershell
$env:H3D_AGENT_TOKEN = '<页面显示的令牌>'
codex mcp add h3d --url http://127.0.0.1:8098/mcp --bearer-token-env-var H3D_AGENT_TOKEN
```

令牌只授权当前页面；多个标签页分别配对。页面刷新后必须重新授权，新配对使用新的 sessionId 和令牌，旧令牌不能控制新页面。刷新关闭的旧配对会进入默认 2 分钟的断线宽限，并在下一次清理时失效；宽限期间仍可使用桥接器本地接口，例如查看旧会话状态或下载自己的临时文件，但不能执行页面操作。短暂网络中断会自动重连，但不会重放未确认的操作。点击“断开并撤销授权”则立即撤销配对和两个令牌。不要把令牌写入场景脚本、公开仓库或资源 URL。

Agent 客户端还会执行自己的工具审批策略。首次写入时按客户端提示授权；在配置为 `approval_policy="never"` 的 Codex 会话中，原本需要审批的写调用会被拒绝。自动验收使用 Codex 的 `--approve-for-me` 正式审查流程，不修改用户全局配置。配置项见 [Codex 官方配置参考](https://developers.openai.com/codex/config-reference/)。

## Agent 操作方式

先调用 `h3d_sessions_list`，再读取 `h3d_capabilities` 或 `h3d_help`。返回值包含编辑器实际支持的操作形状、几何参数、材质种类、脚本上下文及示例。工具列表由 `common/agent-contracts` 注册，编辑器能力由各功能模块报告。

写操作使用最新 `h3d_scene_status` 中的 `sceneId`、`documentEpoch`、`revision`，加上本次唯一的 `operationId`。批量编辑中的新对象用 `ref` 引用；之后使用返回的 UUID。

```json
{
  "sessionId": "从 sessions_list 获取",
  "sceneId": "当前项目 ID",
  "documentEpoch": "当前文档代次",
  "expectedRevision": 0,
  "operationId": "每次新操作生成一个 UUID",
  "label": "添加建筑",
  "operations": [
    {"type":"create","kind":"mesh","ref":"building","name":"建筑","geometry":{"type":"box","parameters":{"width":5,"height":12,"depth":4}},"position":[0,6,0]},
    {"type":"material-create","target":{"ref":"building"},"kind":"MeshPhysicalMaterial","values":{"color":"#68a9d5","metalness":0.2,"roughness":0.25}}
  ]
}
```

支持的工作流：

| 范围 | 能力 |
| --- | --- |
| 对象与几何 | 层级、创建/克隆/删除、局部/世界变换、重设父级、灯光、相机、实例、参数几何、自定义缓冲几何、曲线/挤出、形状、粒子、Billboard、HTML、3D Tiles |
| 材质与渲染 | Three.js 内置材质、编辑器内置 Shader、自定义 GLSL、类型化 uniform、纹理/采样参数、HDR/EXR、背景/环境、渲染器、后处理、天气、阴影 |
| 行为 | 脚本源码与参数、动画片段/轨道/关键帧、播放/暂停/定位、真实预览与结构化诊断 |
| 资源 | 文件/多文件上传、离线解析、导入作业、原子插入、资源库、永久资源发布、CAD/BIM 现有转换接口 |
| 项目 | 列表、创建、模板、打开、重命名、显式保存、删除、项目包导入为新项目 |
| 检查与输出 | 分页查询、对象/材质/脚本/动画详情、编辑器与运行视口截图、撤销/重做、操作结果查询、13 种导出格式 |

标准交换格式保留能力不同：GLB/GLTF 不保留 H3D JavaScript 和任意 GLSL。完整保留编辑器内容应使用项目 JSON/ZIP 或 Prefab。Standalone 打包已声明的场景资源；脚本运行时动态构造的外部网络请求仍需相应服务。

## 观察播放中的场景

调用 `h3d_play` 启动预览，等 `action:"status"` 返回 `state:"running"`。用 `h3d_runtime_scene_query` 查播放场景树，支持按名称、类型、直接父对象 UUID 筛选和分页。返回项包含运行对象的 UUID 和局部变换。脚本创建的对象也可查询。默认跳过标为 `ignore` 的辅助子树，可传 `includeTransient:true` 查看。后续分页和采样带上首次返回的 `runId`，以便识别播放重启。

例如，在灵梦场景查询 `name:"Reimu"`，取角色、像素面片和阴影的 UUID，然后调用 `h3d_runtime_sample`。

```json
{
  "sessionId": "<当前配对>",
  "runId": "<本次播放>",
  "uuids": ["<角色 UUID>", "<像素面片 UUID>", "<阴影 UUID>"],
  "count": 31,
  "intervalMs": 200,
  "fields": ["transform", "animation", "materials"],
  "materialProperties": ["opacity", "color"]
}
```

省略 `count` 可读当前快照。每个 `samples[]` 元素包含同一时刻的对象状态和页面单调时钟 `timestampMs`，可用同一 `runId` 跨请求接续观测。世界坐标、四元数和缩放位于 `worldPosition/worldQuaternion/worldScale`。动画包括剪辑的播放时间（秒）、纹理的 UV 偏移和重复、帧相关 uniform 及脚本公开的帧标记。几何 UV 最多读前 12 个顶点。具体帧编号取决于场景使用的动画实现。内置材质参数位于 `materials[].parameters`，自定义 shader 参数位于 `materials[].uniforms`，可用 `uniformNames` 点名读取。

每次可观察 1–20 个 UUID、1–101 个样本，采样间隔 50–1000 毫秒，单次窗口最多 10 秒。间隔受浏览器调度影响，应以实际时间戳计算。返回材质最多 16 个槽位、剪辑最多 32 个，同时提供各自总数。缩小 `fields`、对象数或样本数可以控制结果大小。对象消失会在对应快照中标记 `missing:true`。停止或重启播放会使正在进行的采样失败。

运行 `node tests/web-mcp/reimu-runtime-mcp.mjs` 可在保留的灵梦项目复验。浏览器负责打开页面和配对，场景树、运动与材质数值全部取自 MCP 响应，结果在 `.git/codex-runtime/reimu-runtime-mcp`。

## 本地文件导入

1. `h3d_upload_prepare` 声明文件名/字节数，或 `files:[{path,size,mimeType}]` 与 `entryPath`。
2. Agent 使用自己的 HTTP/文件工具，把本地文件 bytes PUT 到返回的 URL，使用返回的专用上传 headers。无需浏览器下载器。
3. `h3d_upload_complete` 得到 `artifactId`。
4. `h3d_import_prepare {source:{artifactId}}` 开始解析；用 `h3d_import_job {action:"status",jobId}` 查询。
5. ready 后通过 `h3d_scene_batch` 的 `insert-model` 操作插入。准备失败或取消不会改变场景。

支持 OBJ/MTL、glTF/bin/贴图等相对路径文件组合。准备任务最多 16 个，120 秒超时，并与页面/文档代次绑定。已插入任务只能通过历史记录撤销，不能重复消费。

临时文件一小时后过期，每个 bundle 上限 512 MiB，桥接器总预留空间上限 2 GiB。用 `h3d_artifact_release` 释放不再使用的临时文件。

普通模型和纹理会在场景保存时序列化。Tiles、HTML、CAD 等保持 URL 引用的内容应先使用 `h3d_assets {action:"publish-files",artifactId}`，再使用返回的永久 `entryUrl/baseUrl`。资源库可用 `publish` 发布。不要将临时 artifact URL 当作永久场景资源。

CAD 使用已有转换器。BIM 转换需要部署方的 Revit 服务；未连接时明确返回 `DEPENDENCY_UNAVAILABLE`，不创建永远等待的转换记录。

## 编辑、保存与恢复

一次 batch 对应一条历史记录。失败会逆序恢复已执行步骤；恢复失败会报告 `recoveryRequired` 并阻止继续写入。撤销/重做必须指定位于历史栈顶部的 batchId，避免覆盖期间的人工编辑。

保存必须显式调用 `h3d_project {action:"save",...}`。Java API 使用数据库行锁、版本条件更新和持久 `operationId` 回执。同一个旧版本的两个保存只有一个成功；重启后重复请求也不会再次递增版本。旧资源在提交后清理，备份/清理失败通过回执 warnings 报告。

连接断开或超时返回 unknown 时，先调用 `h3d_operation_status`。它可读取页面的操作结果和数据库中的保存回执。不要生成新的 operationId 后盲目重放同一个未确认写入。

预览运行前，作者场景快照写入 IndexedDB。脚本错误提供 runId、对象 UUID、脚本名、阶段和堆栈。刷新后的恢复入口可恢复运行前场景，恢复时不执行脚本。同源 iframe 无法强制中断同步无限循环；这类异常需要刷新页面后恢复。

当前面向可信团队部署。配对令牌并未给原有 Java API 补全账号、租户或项目所有权体系。远程部署应放在团队访问控制之后；Nginx 路由已在 `deploy/nginx/vhosts/astral3d.conf` 配置。桥接器设置：

```text
H3D_MCP_PUBLIC_URL=https://你的编辑器域名
H3D_MCP_ALLOWED_ORIGINS=https://你的编辑器域名
H3D_MCP_HOST=127.0.0.1
H3D_MCP_PORT=8098
```

多实例部署需要同一配对的 MCP 和 WebSocket 请求落到同一个 bridge 进程。当前没有跨实例会话路由。

## 验证与手测

```powershell
pnpm mcp:test
node tests/web-mcp/bridge-load.mjs --sessions 1000 --active 100 --rounds 10
# 浏览器测试需要可 require 的 Playwright；可设置 PLAYWRIGHT_MODULE_PATH
node tests/web-mcp/editor-e2e.mjs
node tests/web-mcp/bridge-browser-isolation.mjs
node tests/web-mcp/project-files-browser.cjs
node tests/web-mcp/material-runtime-browser.cjs
node tests/web-mcp/objects-export-browser.cjs
node tests/web-mcp/import-browser.cjs
node tests/web-mcp/complex-runtime-browser.cjs
node tests/web-mcp/geometry-replace-browser.cjs
node tests/save-confirmation-loading.cjs
```

`editor-e2e.mjs` 会在真实后端创建专用验收项目，并保留用于检查。`RUN_CODEX=1` 额外启动真实 Codex 客户端，令牌仅通过子进程环境变量传入；可设置 `CODEX_BINARY` 为已安装客户端路径。截图与结果保存在 `.git/codex-runtime/web-mcp-e2e`。不需要迅雷或其他外部下载器。

最后执行博丽神社/灵梦创作验收。完整提示词位于 `tests/web-mcp/prompts/reimu-shrine.txt`，明确只允许 Codex 使用当前 Astral 页面的 Web MCP 创建对象、材质、脚本并保存，禁止另建 Three.js/HTML 项目。运行方式见 `tests/web-mcp/codex-scene-browser.md`。验收记录包括保存重载一致性、实际预览截图，以及角色换位、像素帧和地面阴影的连续采样。

本轮最后执行的灵梦验收已通过，保留项目 `4472ab06c54f8f7a93635f28e75915c1`：67 个作者场景对象、591 个实例，保存版本 3；24 秒内采集 113 次运行快照，观察到 6 种实际像素角色 UV 帧状态和 5 片移动落叶，无浏览器错误或下载。保存重载与离线运动分析结果分别记录在 `.git/codex-runtime/reimu-shrine-final/result.json` 和 `runtime-analysis.json`。

最终场景的补充检查记录在同目录 `ground-controls.json`：真实预览中鼠标拖拽旋转和滚轮缩放均改变相机；向下射线确认三个落脚位置的草地表面高度约为 0。角色落地时根节点高度 0.034，阴影平面高度 0.039；使用独立测得的 `--ground-y 0` 重新分析，阴影通过 0.05 单位的贴地容差检查。该检查只读取已保存场景并操作临时预览相机，不写入项目。

`bridge-browser-isolation.mjs` 使用两个真实浏览器标签页和 MCP SDK，验证页面/文件隔离、单页撤销、刷新重新配对、首页创建/打开项目及过期 revision 的丢弃请求被拒绝；只创建和修改专用验收项目，结果记录在 `.git/codex-runtime/web-mcp-isolation/result.json`，不触发浏览器下载。

合并前开发者手测路径（仓库 AGENTS 要求）：

1. 在 `https://localhost:8090/#/editor/{sceneId}` 打开一个测试项目，授权本地 Agent，生成带层级、脚本、GLSL 材质与动画的场景。
2. 观察视口变化；人工再修改对象，确认旧 revision 指令被拒绝。检查撤销/重做、连接撤销和不同标签页隔离。
3. 运行脚本，故意引入错误并查看诊断；刷新后用恢复入口恢复作者场景。
4. 显式保存、刷新并检查脚本/材质/动画；打开第二标签页，验证旧版本保存冲突。
5. 导出项目 ZIP，再导入为新项目；确认原项目未改变。用 HTTP 静态服务打开 Standalone 验证场景与外部依赖。
