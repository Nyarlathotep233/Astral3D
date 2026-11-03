# H3D Desktop + 本地 MCP：源码分析与实施计划

日期：2026-11-03。状态：**实施中；桌面、只读 MCP、基础对象/材质参数/JS 脚本批量编辑已接通；资源导入、Play/保存工具及完整交付验收未完成**。

分析基线：前端 `refactor/webgpu-renderer` / `8c8b7cf`，后端当前本地源码。
已从上述基线新建 `feature/desktop-mcp`，实现桌面生产页面装载、只读及上述内存编辑 MCP。仅在授权测试场景进行可撤销的内存验收，未保存、未部署。
当前证据及未完成项见 [DESKTOP_MCP_ACCEPTANCE.md](C:/project/3D/Astral3D/Astral3D/DESKTOP_MCP_ACCEPTANCE.md)。后文源码分析和未实现阶段仍是实施约束，不是通过声明。

## 1. 最新范围与交付目标

- **初版即 Electron 客户端**，不是要求用户启动 Vite、安装 Node 或自行运行前端。
- 桌面端装载随安装包发布的现有 Vue 编辑器生产构建，继续使用 WebGPU SDK；不另做一套编辑器。
- 本地 Agent 通过客户端提供的 MCP 端口读取、生成、编辑场景；不部署线上 Agent/MCP，不内置新模型服务。
- 最终业务数据、模型资源及共享展示在服务器；Electron 不携带业务数据库或 Java 服务。
- **当前先本地联调**：复用已有隔离测试后端、数据库、资源。通过后再安排线上发布，发布后再线上联调；不是现在执行部署。
- VPS `http://astral.nyarlathotep.cn/` 仅作为后续目标记录。一次只读首页访问被浏览器导航至 HTTPS 后报 `ERR_CONNECTION_CLOSED`；未取得线上接口、认证、版本证据。随后按用户要求停止访问，已关闭本轮探测页。
- 不合并 `dev`，不改变 GLSL/GIS 的既有迁移边界，不顺带恢复旧渲染链路。

首个完整交付：用户安装并启动客户端 → 打开测试场景 → 本地 Agent 批量搭建/修改 → 编辑器可见、可撤销 → 预览/截图 → 显式保存 → 重开后数据一致。

## 2. 源码核查：已有能力及不能直接照搬的地方

### 2.1 命令和历史

入口：[App.ts](C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/app/App.ts)、[History.ts](C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/app/modules/History.ts)、[Commands.ts](C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/commands/Commands.ts)。

已有新增/删除/重挂父节点、位置/旋转/缩放、普通属性、几何、材质/纹理、脚本等命令；`App.execute/undo/redo` 可复用。

必须注意：

1. `History.execute` 在执行前把命令放入 undo 栈，未提供通用异常回滚；不能把循环调用它称为事务。
2. 可更新命令在 500 ms 内会合并；脚本值命令可忽略时间差合并。Agent 的两个独立操作不能意外合并，也不能吞并人工操作。
3. `SetSceneCommand` 有子命令数组和逆序 undo，但只服务场景导入，没有通用失败恢复，不直接当批量事务用。
4. 新增对象会逐对象触发对象/场景树/选择事件；大批创建可能重复刷新 UI。只合并昂贵 UI 通知，不能关掉材质注册、辅助对象、脚本安装等必要处理。
5. `MoveObjectCommand` 保持世界变换的代码目前被注释。MCP 必须明确 local/world，不把重挂父节点当作天然保持世界位置。
6. 材质参数命令直接修改材质实例，会影响共享它的其他网格；部分命令序列化也未完整保留材质槽。MCP 必须区分“共享材质编辑”和“指定对象材质独立副本”。
7. `App.toJSON()` 会清理脚本表；history 的场景输出被注释。不能把它用作无副作用查询，也不能承诺重启后还能撤销。

### 2.2 已有外部桥接不是 MCP，但可以复用其业务能力

[editorObjectsBridge.ts](C:/project/3D/Astral3D/Astral3D/packages/editor/src/utils/integration/editorObjectsBridge.ts) 已有：

- `H3D_EDITOR_SCENE_QUERY`：返回全场景对象、变换、用户数据和脚本源码。
- `H3D_EDITOR_OBJECT_ADD`：内置预制体或 HTML 面板创建。
- `H3D_EDITOR_SCENE_SAVE`：调用统一保存函数。
- requestId、ready 和来源白名单。

缺口：无分页/字段选择、修改删除/批量工具、会话绑定、请求去重、执行互斥及通用任务状态。ready 前的请求批量并发冲刷；预制体先加入，再检查 parentUuid，父节点错误可能留下已创建对象。

**不直接把旧 postMessage 包装成公网/本地 HTTP。**仅提取确实要共享的查询/创建逻辑，新建类型明确的命令适配层；保留旧父页面协议及来源限制，不顺便重写已有集成。

### 2.3 模型、预制体与复杂场景生成

- [Loader.ts](C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/loader/Loader.ts)：多格式加载，`loadFile` 有 `addToScene=false`；部分 UI 调用 `loadFiles` 会自动加入场景。MCP 应走“加载准备完成后提交”，逐格式验证无提前写入的路径。
- [prefab.ts](C:/project/3D/Astral3D/Astral3D/packages/editor/src/utils/common/prefab.ts)：加载 ZIP、重建对象、重映射对象/几何/材质/纹理 UUID、重绑脚本，再通过 `AddObjectWithScriptsCommand` 加入场景。
- [prefabRegistry.ts](C:/project/3D/Astral3D/Astral3D/packages/editor/src/views/editor/components/extraPane/resource/builtin/prefabRegistry.ts)：**当前内置预制体仅登记 tower-crane**，不是已经有通用建筑/设备资产库。
- [assetsInfo.ts](C:/project/3D/Astral3D/Astral3D/packages/editor/src/http/api/assetsInfo.ts)：已有资产列表/分类标签接口。查询资产使用真实接口和实际字段，不让 Agent 编造资源 ID 或地址。

`instantiatePrefab` 目前加载与入场耦合，需要最小拆出 prepare，再交给批量命令提交。当前 UUID 重映射不自动改写脚本源码字符串及任意 userData 内的对象引用；不做猜测式替换。重复实例、骨骼动画、材质共享和脚本参数要单独回归。

### 2.4 保存

[saveSceneToService.ts](C:/project/3D/Astral3D/Astral3D/packages/editor/src/utils/common/saveSceneToService.ts) 流程：

`await viewer.ready / assertRenderable → sceneVersion + 1 / rendererVersion → 封面获取上传 → Package.pack / 分包上传 → fetchUpdateScene → 回填服务器记录`。

- 已有同页面 `savingPromise` 去重、真实错误返回、失败恢复版本号和版本归属。
- [SaveToService.vue](C:/project/3D/Astral3D/Astral3D/packages/editor/src/components/header/right/SaveToService.vue) 有现成保存确认；旧外部 bridge 直接调底层函数，不能据此认定用户已授权 Agent 无确认覆盖线上场景。
- [Package.ts](C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/loader/Package.ts) 保存场景、相机、控件、脚本、渲染/CSM/后处理/天气配置，并分包处理资源；**不能以 App.toJSON 替代完整保存格式**。
- 保存会跨 await 读取活场景和项目状态。只防重复点击，没有防 Agent 在打包期间修改场景；大场景需要一致快照或受控的短时写入边界。
- 当前失败只回退 sceneVersion/rendererVersion，已修改的封面和 ZIP 元数据并非完整回滚。接入前需要针对这一真实缺口补测试和最小修复，保留用户场景内容。
- 本地后端已修复“失败时按请求路径删除资源目录”问题，但成功清理仍存在，不能假定服务器保留全部历史版本。
- 本地 [Astral3DScenesController.java](C:/project/3D/Astral3D/astral-service/astral-business/src/main/java/com/astral/business/scenes/controller/Astral3DScenesController.java) 更新走 `updateById`，没有看到此入口使用 expectedVersion 条件更新。客户端预读版本**不能保证**跨设备并发保存不覆盖。

### 2.5 三种预览应分开

1. **编辑视窗截图**：[Viewer.getViewportImage](C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/viewer/Viewer.ts) 等待初始化、后处理并完成渲染；适合 Agent 检查静态构图。当前是渲染画布，不等于包含所有 CSS2D/CSS3D/HTML 覆盖内容。
2. **资源预览**：[AssetPreview.ts](C:/project/3D/Astral3D/Astral3D/packages/editor/src/core/AssetPreview.ts) 和 SDK Preview，适合查看候选模型/材质，不应改主场景。
3. **运行预览**：[EditorPlayMode.vue](C:/project/3D/Astral3D/Astral3D/packages/editor/src/views/editor/layouts/viewport/EditorPlayMode.vue) 把当前场景打包到内存，再送到独立 iframe；有 sessionId、进度、取消、开始/错误事件。需要提取可调用控制器，不能让 MCP 靠点按钮。

运行预览会执行场景脚本。**场景副本不是安全沙箱，也不代表没有外部网络副作用。**静态截图不隐式启动 Play。HTML 面板加载也可能执行代码，不能笼统承诺“打开场景绝不执行任何脚本”。

## 3. Electron 首期架构

```text
本机 Agent
  │ MCP Streamable HTTP（仅回环地址）
  ▼
Electron 主进程：MCP、会话/请求管理、窗口生命周期
  │ 定义明确的 IPC / preload 桥，不暴露 Node 或任意 IPC
  ▼
随包 Vue 编辑器 → 场景操作适配层 → 现有 App / Commands / Viewer / Package
  │ /api、/file/static 与现有业务 WebSocket
  ▼
当前：已有本地隔离业务服务
后续：明确发布、核验后的 VPS 业务服务与线上查看端
```

### 3.1 安装与启动

- 新增桌面 workspace，复用 editor/SDK 生产构建。先在当前 Windows 环境完成安装包验收；其他平台不宣称支持，发布平台矩阵另确认。
- 用户无需 Node、pnpm、Java、数据库；本地业务服务只是本轮开发测试设施，不装进客户客户端。
- 开发调试可以连接 Vite；**安装包必须脱离 Vite 和本机源码路径独立启动**，不默认打开 DevTools/远程调试端口。
- 主进程负责 MCP 启停、单实例、端口占用真实反馈；不为首版提前拆出常驻 daemon/多进程调度系统。
- MCP 端口可配置并持久记录，启动失败不偷偷换端口。具体默认端口实施时检查占用后确定。
- 需要一个很小的客户端连接入口，提供当前端点、连接状态和复制 Agent 配置；只承载 MCP 使用必需信息，不另建 AI 聊天页面。文案/位置实施前确认。
- 首期本地安装包，正式分发前再核对代码签名；不把自动升级服务器、云端 Agent 或客户端账户体系加入本轮。

### 3.2 页面、接口和资源地址

- 推荐使用标准、安全的自定义协议（例如 `h3d://app/`）加载随包静态页面，避免直接 `file://`；**先做协议适配小样验证，不假定现有资源路径已兼容**。
- 保留现有 `/api`、`/file/static` 语义，只代理到配置的业务服务及明确路由；不是可由工具参数指定目标的任意网络代理。
- 校验 Worker、WASM、HDR、字体、纹理、分包、下载导出、IndexedDB、预览 iframe 的 origin/postMessage，尤其现有代码直接拼接 `window.location.origin`。
- 大文件上传/下载采用可控流式转发，验证 multipart、Content-Type、错误状态及重定向；不把整个大模型额外复制到 MCP JSON。
- 本地测试服务允许 loopback HTTP。后续 VPS HTTPS、证书和 WebSocket 要实测，不通过关闭 webSecurity、忽略证书错误或全局放行 CORS 解决。
- 当前 Axios 请求拦截器未显示完整 token 注入逻辑；线上登录是否来自反向代理/宿主页面尚未确认。**不能把“复用现有登录”写成已经成立的事实**；后续按实际部署验证，不新增假登录或绕过认证。

### 3.3 权限隔离

- `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`，保留 webSecurity；主进程校验 IPC sender、顶层 frame、消息形状、当前会话。
- preload 只提供有限请求/回执通道，不暴露 fs、shell、完整 ipcRenderer、任意 executeJavaScript 或任意网络请求。
- MCP 仅监听 `127.0.0.1`，配置独立连接凭据；校验 Host/Origin，凭据不放 URL、不交给场景脚本、不写日志。具体认证按目标 Agent 支持方式联调，不能只靠端口隐蔽。
- 浏览器内的场景脚本/HTML/工具返回文本视为不可信内容；不能由这些内容自动授予本机文件权限、自动启动外部程序或授权服务器保存。
- Play iframe 不注入桌面特权桥；HTML 面板现有 Proxy/with 不是可信安全边界。需验证恶意脚本无法借父窗口的有限桥获得额外系统能力。
- 原生文件能力只做已授权的模型导入/导出，限定路径或文件句柄，不提供任意文件读取工具。首批可先用已有远端/内置资源，按实际需求补本地导入。

## 4. MCP 工具：少量入口，结构化操作

以下为**拟议协议**，不是现有业务接口/数据库字段；名字可在实现时统一。单会话对应一个实际编辑窗口，不默认选“最近打开”的任意场景。

| 工具族 | 首批能力 | 主要复用 |
| --- | --- | --- |
| 会话 | 列出/绑定窗口，读取加载状态、场景 ID、实际渲染 API、能力和限制 | editor 生命周期、viewer.ready |
| 查询 | 分页场景树、按 UUID/类型/名称查找、指定对象/材质详情、按需脚本源码、可选包围盒 | App.scene、现有桥接序列化 |
| 资源 | 分页搜索实际资产、列内置模型/预制体、查看资源详情/预览 | assetsInfo、builtin registry、Preview |
| 批量编辑 | 基础几何、组、灯光/相机、资源/预制体实例化、复制、删除、变换、层级、材质/纹理、普通 JS 脚本及参数 | Commands、Loader、Prefab |
| 观察 | 聚焦对象、设置观察相机、静态视窗截图；必要时提供不含整个桌面的视窗合成截图 | controls、getViewportImage、Electron capture |
| 历史 | 查询历史顶端、撤销/重做明确的批次 | History |
| 运行预览 | 显式 start/stop/status、读取本次预览错误；不自动点击运行 | Play Mode |
| 保存 | 显式请求保存、读取结果/回读状态 | saveSceneToService、fetchGetOneScene |
| 任务 | 查询/取消长任务，返回已完成批次及失败项 | 新增薄任务队列 |

- 不导出通用 `eval`/shell 工具。普通 JS 脚本编辑通过现有脚本命令，写入不等于运行；不新增 GLSL 编辑入口。
- 不把全部脚本、用户数据、材质 JSON、网格顶点每次返回给模型。默认摘要/分页，按需取字段，截图使用 MCP 图像内容而非巨大 JSON 字符串。
- 截图结果标明 capture 类型、相机和场景修订；渲染失败返回真实错误，不能返回上一帧图片冒充成功。
- `sessionId`、`sceneRevision`、`operationId`、`jobId` 是本地协议元数据，不写进业务场景表。sceneRevision 与服务器 sceneVersion 是两回事。
- 现有场景 ID、场景根 UUID、对象 UUID、资源 ID 各自使用，不混用；名称可重复，不以名称作为可靠修改目标。

## 5. 复杂场景批量生成：实施核心

### 5.1 数据契约

建议批量请求由 `sessionId + sceneId + expectedRevision + operationId + label + operations[]` 组成。

- 操作使用明确类型，例如 create、instantiate、transform、reparent、material、script、remove，不开放任意对象属性路径写入。
- 同批新对象可用局部 `ref` 引用；提交回传 ref→UUID 映射。UUID 由编辑器生成，不让 Agent 硬猜。
- 多次出现的同一资产先准备一次，再按**明确资源共享策略**复制；不能默默改成 InstancedMesh，改变对象身份、拾取、脚本和保存语义。
- 变换明确 local/world，旋转数值按现有 Euler 弧度及 order；不猜模型真实米制单位。对无法无损表达的重挂父节点/非均匀缩放情形给出具体失败，不近似后假报成功。
- 材质修改明确共享材质或仅指定对象/槽；普通 userData 和脚本参数保持实际字段，不发明业务数据。
- 参数化排列可用单一资源 + 明确 transforms 数组；需要栅格/路径等生成器时采用明确规则、种子，不在服务端随机猜布局。

### 5.2 两阶段执行，不直接循环 App.execute

1. **准备**：校验类型、目标引用和层级循环，加载资源/纹理，准备对象与逆操作；不提前加入场景、不执行脚本、不上传业务数据。
2. **提交前核对**：检查目标窗口/场景仍相同、相关状态未在异步准备期间变化。人工编辑继续允许；变化后返回冲突让 Agent 重读，不覆盖人工修改。
3. **提交**：一个有界批次通过一个不合并的复合命令进入 History；顺序执行，逆序撤销。一批最终只做必要次数的树/选择刷新。
4. **失败**：复合命令及 History 提供异常安全，恢复已执行子命令、历史栈和信号开关；必须包含“当前命令部分执行后抛错”的测试，不能只 undo 之前的命令。
5. **回执**：返回创建/修改/删除对象 UUID、资源引用、提交后的 revision、历史项和错误。不得把“收到请求”当作“场景修改成功”。

最小新增预计为 BatchCommand + History 中异常安全提交点 + 编辑器操作适配层。之所以不能只加 HTTP 包装，是现有多命令提交不具备失败原子性、批次历史边界与资源预加载隔离。

### 5.3 大任务分批及恢复边界

- 单批数量/载荷/准备内存要有限；限制通过 100/1,000 个普通对象及真实预制体测试确定，不提前承诺万能数量。
- 长任务拆成有名字的批次，准备阶段有进度并可取消；每个成功批次独立可撤销。**不声称跨多个已提交批次的整项任务原子**。
- 提交临界段不插入人工事件；不能为了“不卡”在半个事务中任意 await。若单批同步提交过慢，减小明确批次并如实回报，不私下删对象或降画质。
- 取消在安全批次边界生效，返回已完成批次，不能把已执行外部脚本或已成功服务器保存声称已回滚。
- 操作 ID 在当前会话内去重，重复请求不重复创建；同 ID 不同内容报冲突。连接断开不意味着取消，先查结果再重试。
- 重启/刷新会话后，不承诺旧请求去重和历史恢复；状态未知明确返回未知，不能盲目重放保存或生成操作。
- 用户随后做了人工修改，Agent 不能通过反复 undo 去回滚自己更早的任务；先确认历史顶端，不回退无关操作。
- revision 必须覆盖人工命令、撤销/重做及涉及的项目设置；异步准备还需对触及对象做状态比对，不能只拿 history 长度当并发控制。
- 首版不引入 CRDT、协同编辑服务器、通用程序化建模语言或 GPU 粒子重写。

## 6. 保存、预览和数据安全

### 6.1 保存策略

- Agent 编辑默认只影响当前编辑会话，保存是独立动作，不随每一批编辑自动上传。
- 首版建议**沿用现有保存确认**，不新增一套审批工作流、不假定已批准无确认覆盖。可把确认封装为 UI 和 MCP 共用入口；是否改为会话级授权由用户决定。
- 同一会话的 MCP 写操作和保存串行；手工保存/旧 bridge 的既有入口也必须纳入同一保存状态，不能靠 MCP 队列假装已防住所有并发。
- 首选在短时一致性边界内取得完整 Package 快照，再异步压缩/上传；先核对当前分包实现改动量。若只能让打包期间暂缓场景编辑，要明确说明并确认交互，不擅自增加永久按钮禁用/业务校验。
- 保存途中又编辑的修订不能被错误标为“已保存”。记录本次 savedRevision，回读 sceneVersion/ZIP 等实际结果；MCP 不重复拼一套保存字段。
- 修复失败时本次保存改动的元数据恢复，保持原场景内容和错误；不会用新截图/旧缓存替换失败资源。
- 上传后响应丢失可能是“服务器已成功，本地未知”。先回读核对，不能自动再次递增版本或宣称肯定失败。服务端缺少幂等/条件更新时明确限制，不能用前端逻辑冒充跨客户端事务保证。
- 不删除上传失败遗留文件。清理必须基于引用检查并经授权；不新增整库备份或资源复制。

### 6.2 预览策略

- 批量生成后先静态截图/对象计数核验，再按需要显式运行预览。
- Play Mode 的内存包直接复用，无需“先线上保存才能看效果”；提取可调用生命周期，不重写另一个运行时。
- 新建场景使用现有创建接口会写业务服务；本地开发限定已有测试项目，不把“新建空场景”当只读工具。
- CSS 标签/HTML 面板的视觉结果单列，画布截图不能替代。合成截图只截编辑视窗，不读用户桌面其他窗口。
- 保留主编辑器数据与预览副本分离；测试对象变换、脚本运行错误、停止后的 iframe/监听/资源释放。

## 7. 拆分实施与验收

| 阶段 | 改动与交付 | 通过条件 |
| --- | --- | --- |
| A 桌面小样 | 新 workspace、main/preload、安全协议及业务代理、现有编辑器生产构建装载 | 停止 Vite 后安装包能启动；本地列表/资源/场景/截图/Play 正常；核验实际渲染 API；无不必要本机特权 |
| B 只读 MCP | SDK/Streamable HTTP、连接凭据、窗口绑定、查询/资产/截图 | 实际 Agent 能连接；分页/UUID 正确；未 ready、断连、错误窗口、缺权限真实失败；零业务写请求 |
| C 批量命令 | prepare/commit、BatchCommand、History 异常安全、任务和去重 | 多级父子引用、批量生成/编辑/撤销/重做一致；失败无半批残留；人工修改不被覆盖 |
| D 资源与复杂编辑 | 模型/预制体准备、资源共享/克隆、材质槽、脚本参数、灯光/相机 | 真实资源组装复杂场景；UUID/层级/材质/纹理/脚本引用完整；错误材质无白模替换 |
| E 保存与运行 | 共用保存确认/结果、元数据失败恢复、一致性边界、Play 控制 | 已有测试项目保存重开一致；失败保留输入及其他项目资源；截图与 Play 状态真实 |
| F 本地安装包验收 | 完整 Agent 用例、无开发依赖启动、连接配置与退出清理、15 分钟稳定性 | 用户不需终端起前端；进程/端口可释放；完整报告可复测；不触及原库或线上 |
| G 后续线上发布/联调 | 单独安排发布兼容的 WebGPU 查看端及必要业务修复，再连接 VPS | 先确认部署范围/版本/鉴权/HTTPS/测试场景，再实测在线分享；本轮不执行 |

已从 WebGPU 基线 `8c8b7cf` 新建 `feature/desktop-mcp`；未合并、未推送。

拟改动位置：

- 新桌面包：`C:/project/3D/Astral3D/Astral3D/packages/desktop/`，main/preload/MCP/安装构建；包名使用 H3D。
- 编辑适配：`C:/project/3D/Astral3D/Astral3D/packages/editor/src/utils/integration/`，类型契约、会话、操作和任务；不让桌面端依赖 Vue 私有组件状态。
- 必需 SDK 改动：`C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/commands/` 和 `C:/project/3D/Astral3D/Astral3D/packages/sdk/lib/core/app/modules/History.ts`。
- 复用/最小拆分上述 prefab、saveSceneToService、EditorPlayMode 文件。只有确认 Package 不足以提供一致快照时才扩大打包改造，并先说明范围。
- 新测试：`C:/project/3D/Astral3D/Astral3D/tests/desktop-mcp/`。首期不新增服务端业务字段/接口。

### 7.1 必测清单

1. **安装体验**：无 Node/Vite 环境；首次启动、重启、端口冲突、单实例、关闭客户端、丢失 renderer；服务不可达时错误真实。
2. **安全**：无凭据/错误来源/恶意 Host、伪造 IPC、子 iframe、路径穿越、任意代理目标、场景脚本访问 Node；均不获得额外权限。
3. **批量**：100/1,000 普通对象、真实塔吊预制体与子层级、同批新父节点引用、失败注入、去重、取消、断连、人工插入修改；不预设性能通过线，先记录延迟/内存/对象数。
4. **数据**：对象/资源 UUID、父子顺序、local/world 变换、多材质槽、共享/独立材质、纹理、普通脚本及参数；克隆骨骼/动画不交叉污染。
5. **历史**：一批一条、逆序 undo/redo、异常不污染栈、不合并人工命令；失败中途信号恢复，刷新后不虚报历史仍在。
6. **保存**：真实成功回读和重新解包；封面/子 ZIP 失败、服务器失败、响应丢失；核对其他场景文件仍存在。破坏性故障注入只在微型专用夹具中，不再对完整 upload 目录执行。
7. **视觉和运行**：同场景主视窗、资产预览、Play、截图；CSS 覆盖内容单列；实际 GPU API 与运行错误检查；自动检查之外保留人工体验。
8. **稳定性**：按用户要求 15 分钟，含多次资源预览、批次提交/撤销、Play 开关、尺寸变化；不额外追加长时压力测试。

本地验收继续参照 [LOCAL_WEBGPU_ENVIRONMENT.md](C:/project/3D/Astral3D/Astral3D/LOCAL_WEBGPU_ENVIRONMENT.md)，复用 `astral_webgpu_acceptance_20261031`、现有测试资源及测试项目。新增客户端 userData/构建缓存/测试产物后，记录真实位置和清理办法；不预先复制数据库/资源/工作树。历史场景只读，真实保存使用授权测试项目。

## 8. 尚待确认，但不阻止本地只读小样的事项

- 首批客户平台是否只 Windows，以及最先对接的本地 Agent 客户端（决定连接配置、认证和图片展示的实际兼容测试）。
- 首版保存是否沿用每次确认；未确认前按现有确认行为设计，不擅自允许无确认线上覆盖。
- MCP 入口已确认并实现为 Electron 原生菜单「MCP → 连接信息 / 复制配置」；保存一致性若涉及短时暂停人工编辑，另行确认。
- 后续线上部署：当前查看端 SDK/格式、业务认证、HTTPS、后端资源清理修复和版本字段迁移状态；本地结果不能替代线上证据。
- 不支持多客户端同时覆盖同一场景的强并发保证。若确有需求，需要单独确认服务端条件更新/幂等改造，不能暗中扩展本轮后端契约。

## 9. 官方技术依据与验证边界

- [MCP Streamable HTTP（2025-11-25）](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)：本地端点、Origin 校验、回环绑定、认证及连接断开语义。采用正式 SDK，锁定经验证版本；应用层 job 不假装是 MCP 标准 Tasks。
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)：上下文隔离、沙箱、IPC sender 校验、限制导航及自定义协议建议。
- [Electron contextIsolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)：只暴露有限桥接函数，不能暴露完整 IPC。
- [Electron protocol](https://www.electronjs.org/docs/latest/api/protocol)：标准/安全协议、相对资源、存储及 session 注册；不启用 bypassCSP。

已进入本地 Electron/MCP 实施；不能把局部只读验证当作整个计划完成，也不能把本地结果等同于线上通过。上述线上首页失败仅说明当次浏览器访问失败，不据此判断服务器整体不可用。
