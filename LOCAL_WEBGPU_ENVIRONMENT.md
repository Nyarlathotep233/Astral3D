# 本地 WebGL / WebGPU 共用服务台账

更新：2026-11-01。此文件保存在原前端仓库，创建新环境前先核对并复用以下资源。
仅本地开发验证，未合并、未部署。不要因为本台账列出了路径就自动删除数据。

## 工作目录与服务

| 用途 | 位置 / 分支 | 端口 |
| --- | --- | --- |
| 原前端仓库、WebGPU | `C:/project/3D/Astral3D/Astral3D`，`refactor/webgpu-renderer` | HTTPS 8090 |
| WebGL 工作树（从 dev 的 eddfcd4 创建） | `C:/project/3D/Astral3D/Astral3D-webgl`，`test/webgl-shared-service` | HTTPS 8091 |
| 原后端仓库 | `C:/project/3D/Astral3D/astral-service`，`feature/scene-renderer-version` | HTTP 8080，仅本机 |

两个前端的 `/api` 和 `/file/static` 代理均指向 `http://127.0.0.1:8080`。
WebGL 工作树拥有独立依赖和 SDK 构建，不共享 WebGPU 的 Three 实例或 dist。
启动前先检查端口及 `git worktree list`，不要重复创建工作树、依赖副本或服务。

## 数据库和资源副本

- 原数据库：`astral3d_new`。原资源目录：`C:/project/3D/Astral3D/astral-service/static`。
- 当前测试库：`astral_webgpu_acceptance_20261031`，已复制原库数据，**不是空库**。
- 当前测试资源：`C:/project/3D/Astral3D/Astral3D/.codex-logs/service-acceptance-20261031/static`。
  最初复制 383 个文件；测试保存会增加/更新副本内的文件。
- 两个前端必须共用上述测试库和测试资源。原仓库的 `application-dev.yml` 仍保留用户原有修改；
  本地运行通过命令行覆盖 datasource URL、uploadDir、currentAbPath、temporaryFolder，未改写该配置文件。
- 测试库已执行 V5，增加可空的 `rendererVersion`。不把历史空值批量改成 WebGL。
- 用户曾提出改连原库，随后确认继续使用副本。切换未实际执行：本次没有对原库运行 V5 或测试写入。
- 此副本是复制时的快照，不会自动同步原库后续修改。不要不经确认覆盖它来“刷新”。

## 已有备份与证据（请复用，不重复复制）

以下路径均相对于原前端仓库 `C:/project/3D/Astral3D/Astral3D`：

| 路径 | 用途 |
| --- | --- |
| `.codex-logs/service-acceptance-20261031/original-db-snapshot.sql` | 初次隔离前的原库备份 |
| `.codex-logs/service-acceptance-20261031/original-assets-sha256.json` | 初次原资源校验清单 |
| `.codex-logs/service-acceptance-20261031/isolation.json` | 初次复制来源与目标记录 |
| `.codex-logs/service-acceptance-20261031/before-renderer-version-test-db.sql` | 测试库增加版本字段之前的备份，包含前一轮验收保存数据 |
| `.codex-logs/shared-service-original-20261031/before-migration.sql` | 本轮拟切换原库前创建的原库备份；最终没有切换 |
| `.codex-logs/shared-service-original-20261031/static-before` | 同次原资源完整备份，448 个文件 |
| `.codex-logs/shared-service-original-20261031/assets-before.json` | 同次资源校验清单 |
| `.codex-logs/three-r176` | 画面对比使用的旧 Three 测试依赖，不是另一个前端环境 |

SQL 和资源备份可能含业务敏感数据，仅保留本地，不提交 Git、不上传。
`.codex-logs` 的忽略通过当前仓库 `.git/info/exclude` 配置，不代表换机器后也自动忽略。

本轮按文件长度统计：WebGL 工作树（含依赖与构建）约 4.88 GiB；
`service-acceptance-20261031` 恢复后约 0.673 GiB；`shared-service-original-20261031` 约 0.72 GiB。
此前记录的 0.15 GiB 是副本 upload 目录被失败测试误删后的异常状态，不是完整副本大小。
这些是逻辑文件大小，pnpm 硬链接等因素使其不等于实际新增磁盘占用。

## 启动时复用已有资源

前端分别在各自仓库执行以下命令，只在对应端口未运行时启动：

```powershell
$env:VITE_PROXY_URL = 'http://127.0.0.1:8080'
# WebGPU 原仓库
npm --prefix packages/editor run dev -- --host 127.0.0.1 --port 8090 --strictPort
# WebGL 工作树中执行，不能与上一行在同一终端同时运行
npm --prefix packages/editor run dev -- --host 127.0.0.1 --port 8091 --strictPort
```

后端使用 JDK 8，原配置中的凭据保持不变，但必须显式覆盖数据和资源目标：

```powershell
# 工作目录 C:/project/3D/Astral3D/astral-service
$testRoot = 'C:/project/3D/Astral3D/Astral3D/.codex-logs/service-acceptance-20261031'
& 'C:/Program Files/Eclipse Adoptium/jdk-8.0.482.8-hotspot/bin/java.exe' -jar astral-web/target/astral-web.jar `
  --server.address=127.0.0.1 --server.port=8080 `
  '--spring.datasource.url=jdbc:mysql://127.0.0.1:3306/astral_webgpu_acceptance_20261031?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai' `
  "--astral.uploadDir=$testRoot/static" "--dev.currentAbPath=$testRoot" "--dev.temporaryFolder=$testRoot/static/tmp"
```

不要直接使用原配置裸启动来“重启测试服务”：它仍指向原库，Flyway 会作用于实际连接的库。
后台启动时使用 `Start-Process -WindowStyle Hidden` 并保存 PID/日志；端口和参数比历史 PID 更可靠。
重建 JAR 前停止对应测试进程（Windows 文件锁）；使用 `mvn -DskipTests '-Dmaven.jar.forceCreation=true' package`
避免仅更新业务模块后继续复用旧可执行 JAR。11 月 1 日修复后运行 PID 为 74244，仅供排查，不应盲目复用/终止。

## 本轮验收和兼容边界

- `rendererVersion` 是创建或最后成功保存的**前端版本归属**（`webgl` / `webgpu`），不是实时 GPU API 检测。
  WebGPU 默认渲染器发生官方回退时，版本标记仍为 WebGPU。
- 两版列表都显示存储值；仅打开不改变标记；历史 null 显示“未标记”。没有增加跨版本打开拦截或自动跳转。
- 已创建且保留两个副本库验收场景，请直接复用：
  - WebGL：`bc52c36f7366da9e7633defb08e7b0f6`，`WebGL共用服务验收-20261031`。
  - WebGPU：`db24d798905d186dfb61505f9396d5b8`，`WebGPU共用服务验收-20261031`。
  两个均保存至 V6，最终各自归属与名称一致；包含明确添加的蓝色标准材质方块，没有业务模拟数据。
- 新建、保存、刷新、列表标记回读、标准材质跨版本打开/保存通过；UUID、材质 UUID、位置和颜色保持。
  连续保存后封面可正常读取。两端列表读取同一套场景记录。
- 只读旧“塔吊”场景 `52158b45adb578d2c975ace6d9d6f981`：两端均加载 110 个网格，
  实际 API 分别为 WebGL2 / WebGPU，无运行异常；仍为 V7、未标记，未保存。
- 旧 `Earth_CityLights_Shader` 场景 `d5647581fbec271cd29e8f3bd23942cf`：WebGPU 明确拒绝不支持的 GLSL，
  保留原材质和场景对象，未保存。不宣称任意旧 GLSL、所有历史 GIS 或所有 WebGPU 节点格式双向兼容。
- 临时改变同一标签页 hash 不会可靠重建编辑器；验收切换 URL 后使用整页刷新，正常列表入口会新开标签页。
  不在地址已变但场景未重新加载时保存。本轮此情况只发生在上述验收场景中，未触及历史场景。
- 副本文件缺失暴露了旧保存流程未检查封面响应/空文件的问题（最初归因于服务重启不准确）；两版均增加真实失败检查，
  不自动生成替代封面。浏览器实测 HTTP 404 时保存失败、版本标记/版本号不变且保留输入。
- 自动检查：两版各 16 个保存/回滚/封面异常用例；后端 null/webgl/webgpu 三种回滚用例通过；
  缺失 ZIP 的真实更新请求失败后数据库版本、标记和 ZIP 地址不变；旧客户端省略版本字段更新时，已有标记保持。
- WebGPU Vue 类型检查通过。旧 WebGL 全量 Vue 类型检查仍在未修改文件中报错（几何/粒子/侧栏等），
  本轮涉及文件没有类型错误；不把旧版全量类型检查称为通过。两版前端构建和后端构建通过。
- 原库完整 dump 与原资源 SHA 校验均与本轮备份一致：
  `.codex-logs/shared-service-original-20261031/integrity-after.json`。
- 浏览器截图与详细回读记录位于 `.codex-logs/shared-list-webgl.png`、`shared-list-webgpu.png`、
  `shared-service-readback.json`、`shared-service-cross-open.json`、`shared-service-cross-save.json`、
  `shared-service-list-final.json`、`shared-service-final.json`。诊断中的旧/失败记录不是最终通过证据。

手测：分别打开 `https://localhost:8090/#/`、`https://localhost:8091/#/`，核对相同场景卡片的标记。
从列表新窗口进入对应验收场景，修改方块后保存、刷新，检查标记、版本、方块和封面。
历史场景只读查看。标记仅提示版本，不保证跨版本兼容，勿用旧版覆盖含新节点材质的项目。

## 2026-11-01 副本资源误删修复

上轮缺失 ZIP 的测试路径是 `upload/renderer-version-intentional-missing.zip`。
后端校验失败后把其父目录 `upload` 当作“本次新上传目录”递归删除。测试当时只核对数据库标记/版本/ZIP
字符串未变，没有核对全量文件，导致漏报。原数据库和原资源未受影响。

- 已删除失败回滚中按请求路径清理新 ZIP 父目录及封面的逻辑；该接口无法证明请求路径的独占归属。
  失败后的孤立上传文件保留，未来只能经明确授权和引用核查后清理。成功保存的原有清理流程未改。
- `tools/SceneAssetRollbackCheck.java` 在独立小型临时目录通过真实控制器更新链路复现，修复前失败、修复后通过。
  与现有 null/webgl/webgpu 标记回滚测试一并通过。不再用真实副本 upload 根目录做破坏性错误测试。
- 复用已有 `shared-service-original-20261031/static-before`，按初始 383 个文件的哈希匹配，补回 217 个缺失文件；
  其余 166 个文件完全一致，未覆盖现存文件、未重建数据库、未创建新的完整副本。
- 本轮恢复记录：`.codex-logs/scene-recovery-20261101.json`；原库/原资源不变校验：
  `.codex-logs/scene-audit-original-integrity-20261101.json`。
- **9600ea… 的测试 V5 是复制后才生成的版本，不在初始备份中，其 ZIP/封面未恢复。**
  V3 文件已精确补回，但没有擅自把数据库 V5 改成 V3，也没有拿 V3 冒充 V5。已询问用户是否明确回退该测试记录。
- 逐场景检查详见 `SCENE_OPEN_AUDIT_20261101.md`。不能用上一轮少量场景检查或浏览器缓存代表全量可用。
- 诊断脚本/截图/JSON 位于 `.codex-logs/scene-audit-20261101*`；回滚测试的微型临时目录位于
  `.codex-logs/rollback-regression-scratch`，编译文件复用 `.codex-logs/renderer-rollback-classes`。
  均不是新建业务环境，清理仍需用户确认。

## 复用与清理

1. 先核对工作树、监听端口、运行进程的实际 datasource 和资源路径；不要只看配置文件。
2. 历史场景只读验收；保存测试使用明确命名的验收场景，不覆盖历史场景。
3. 复用现有副本时不要再次导入原库 SQL，否则会覆盖测试成果。
4. 清理须先经用户确认、停止对应服务，并确认不再需要其中尚未提交代码和验收数据。
5. WebGL 目录是 Git worktree，使用 `git worktree remove` 管理，不直接递归删除。
6. 数据库副本、测试资源、SQL 备份、完整资源备份是不同项，应分别确认保留/删除。
   不删除原数据库或原 `astral-service/static`。不要仅删除测试资源而保留仍引用它的运行服务。
7. 未来长时间测试默认 15 分钟，不为本轮再创建长时间测试环境。
