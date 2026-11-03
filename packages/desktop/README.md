# H3D Desktop（本地开发小样）

基线：WebGPU。当前源码提供只读 MCP 和基础对象、材质参数与 JS 脚本的内存批量编辑/撤销重做；绝对路径本地 GLB/glTF 导入已通过真实准备、编辑和撤销重做验收。资源库/预制体导入、保存和 Play 工具尚未接入。
Electron 加载随包生产页面，不依赖 Vite，不包含 Java 服务或数据库。

## 构建

仓库根目录安装 workspace 依赖后：

```powershell
npm run editor:build
npm run desktop:build
npm run desktop:start
npm run desktop:test
npm run desktop:package
npm run desktop:installer
```

后两条会先重建 SDK 和编辑器，分别生成 Windows 解包目录和 NSIS 安装包，输出在本目录 `release/`。
初期未代码签名，不作为正式客户发行版。不得以源码模式启动成功代替安装验收。

## 配置和连接

首次启动在 Electron userData 创建 `settings.json`，默认仅连接本地服务：

```json
{
  "serviceUrl": "http://127.0.0.1:8080",
  "socketUrl": "ws://127.0.0.1:8080/api/sys/ws",
  "mcpPort": 8098
}
```

userData 默认在 Windows `%APPDATA%/H3D Desktop`；「MCP → 连接信息」显示实际目录。
测试可显式设置 `H3D_DESKTOP_USER_DATA`；修改设置后重启。非回环业务地址必须 HTTPS/WSS，当前不连接线上。

「MCP → 复制配置」复制带 Authorization 的 Streamable HTTP JSON 配置，供支持该传输和自定义请求头的本地 Agent 使用。
此配置含访问凭据，不要提交仓库或发到公共聊天；磁盘凭据由 Electron safeStorage 加密，渲染页面拿不到凭据。
不同 Agent 配置格式仍需分别验证，不承诺通用 JSON 可直接导入所有客户端。

MCP 只监听 `127.0.0.1`，校验 Host/Origin/凭据。退出所有窗口后停止服务。
先调用 `h3d_sessions_list`，再把实际返回的 sessionId 与 sceneId 一起传入场景工具；无隐式活动窗口。
当前工具：状态、分页对象查询、指定 UUID 详情、资产列表、内置预制体列表、视窗截图，以及 scene_batch/history/operation_status。
写操作必须携带当前 sceneRevision、唯一 operationId；一批为一条历史，只允许操作指定历史顶端批次。修改只在内存，不自动保存。
当前 batch 支持 group/box/sphere/plane、局部变换、名称/可见性/阴影属性和子树删除；另支持 material（显式 slot 与 shared/object 作用域）以及 script-add/update/remove。object 会复制该材质槽而保留纹理引用；shared 会影响所有共享该材质的对象。脚本编辑不启动运行，GLSL 不在支持范围。具体以 tools/list schema 为准，不支持的操作直接失败。
脚本与 userData 是不可信数据，详情默认不返回；截图不启动 Play、不保存，且不包含 CSS/HTML 覆盖层。
工具错误保留真实失败，不返回假成功。没有任意 JS、文件系统或 Shell 执行工具。

## 本地模型导入

无需目录授权或工作区白名单。客户端自行确定文件的绝对路径，Electron 不猜测 Agent 的工作目录。

1. `h3d_model_prepare`：绑定会话、jobId、filePath（绝对路径），在场景外准备 GLB/glTF。
2. `h3d_model_job`：查询 loading/parsing/ready/failed 或取消；取消后晚完成的结果也会丢弃。
3. `h3d_scene_batch` 的 `insert-model`：提交 ready jobId、ref、可选名称/父节点/变换；一份结果只插入一次，通过原批次撤销/重做。

支持正常的跨目录 bin/PNG/JPEG/WebP/KTX2 依赖，不扁平化文件名。不提供任意文件内容读取或 Shell；保留连接鉴权和真实解析失败。无自动保存或上传。
目前 GLB/glTF 已验证；其他 GUI 格式、资源库和预制体导入是后续接入项，不将阶段支持范围当作最终格式白名单。单文件 512 MiB 为当前实现的技术容量边界，超出明确报错；后续格式接入与容量验收时统一评估。

## 本地证据

原仓库根目录 `DESKTOP_MCP_ACCEPTANCE.md` 记录通过项与缺口，`LOCAL_WEBGPU_ENVIRONMENT.md` 记录复用环境和清理边界。
验收脚本 `tests/desktop-mcp/verify-live.mjs` 从 stdin 读取原生菜单复制的配置，不把凭据写入证据。
