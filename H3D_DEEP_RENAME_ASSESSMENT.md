# H3D Deep Rename 评估报告

日期：2026-03-19  
状态：仅评估，不执行深层重命名

## 1. 目标定义

本次“深层重命名”按以下口径评估，不仅是界面文案替换，而是将 `Astral/Astral3D/astral3d/@astral3d/3DEditor/astraljs` 等历史标识，系统性替换为 `H3D/Haolink 3D` 体系：

1. UI 文案和品牌资源。
2. 工程技术标识（包名、产物名、命名空间、配置文件名、DOM/CSS id/class）。
3. 数据与协议标识（本地存储 key、导入导出签名、文件后缀、接口路径、上传业务路径）。
4. 文档与外部链接、生态发布信息。

## 2. 影响面快照（基于代码扫描）

扫描范围：`packages/`, `common/`, `tests/`（排除 `node_modules`, `dist`, `.git`）

关键词命中：

| 关键词 | 文件数 | 命中次数 |
|---|---:|---:|
| `@astral3d` | 143 | 149 |
| `astral3d` | 149 | 178 |
| `Astral3D` | 17 | 73 |
| `astral-` | 12 | 31 |
| `3DEditor` | 11 | 16 |
| `astraljs.com` | 5 | 6 |

按目录分布（文件数）：

| 区域 | 文件数 |
|---|---:|
| `packages/editor/src` | 147 |
| `packages/editor`（非 src） | 3 |
| `packages/sdk/lib` | 11 |
| `packages/sdk`（非 lib） | 2 |
| `packages/docs` | 10 |
| `common` | 2 |
| `tests` | 1 |

结论：这是**跨 editor/sdk/build/docs/tests** 的中大型重命名，不是单模块改动。

## 3. 高风险锚点（会影响兼容性/稳定性）

1. 包名与产物生态：
`packages/editor/package.json`, `packages/sdk/package.json`, `common/build/package.json`, `packages/sdk/vite.config.ts`

2. 构建配置输出名：
`common/build/src/plugins/appConfig.ts` 中 `_astral3d.config.js`

3. 本地持久化 key（改错会导致用户配置“丢失”）：
`packages/editor/src/store/modules/globalConfig.ts`
- `astral-theme`
- `astral-locale`
- `astral-main-color`

4. 导入导出协议（改错会导致历史包无法导入）：
`packages/editor/src/components/header/navigation/ImportExport.vue`
- `astral3d-scene-project-package`
- `*.astral3d-project.json`

5. 保存/上传业务路径（依赖后端约定）：
`packages/editor/src/components/header/right/SaveToService.vue`
- `upload/3DEditor/screenshot/...`
- `upload/3DEditor/scene/...`

6. API 路径文字约定：
`/api/editor3d/...`（当前在导入导出需求说明中出现）

7. wasm 和静态资源命名：
`packages/editor/src/utils/wasm/optimize.ts`, `packages/editor/src/plugin/glTFHandler/util.ts`
- `Astral3DEditor.wasm`
- `Astral3DglTFHandler.wasm`

8. SDK 中导出默认文件名：
`packages/sdk/lib/core/tools/Export.ts`（`Astral3DModel.*`, `Astral3DScene.*`）

9. 文档/外链域名与仓库地址：
`packages/docs/**`, `packages/editor/src/views/home/index.vue`, `packages/editor/src/views/editor/layouts/sidebar/SidebarScript.vue`

## 4. 成本评估（人日）

### 方案 A：兼容优先（建议）

目标：用户无感迁移，旧数据/旧包/旧脚本尽量可用。  
手段：新旧标识并存一段时间，做迁移与回退。

| 阶段 | 内容 | 预估 |
|---|---|---:|
| A1 | 品牌层（UI/标题/默认图/文案） | 0.5 - 1 |
| A2 | editor 内部标识迁移（storage key、bundle signature、上传路径适配）+ 兼容代码 | 2 - 4 |
| A3 | sdk/common 构建标识迁移（产物名、全局名、config 文件名）+ 兼容导出 | 3 - 5 |
| A4 | docs/脚本/外链修订 + 回归 | 1 - 2 |
| A5 | 联调与回归（保存、导入导出、预览、插件、历史数据） | 2 - 3 |

合计：**8.5 - 15 人日**（不含后端改造）

若包含后端仓库（接口路由、上传目录、历史数据迁移脚本）：再加 **3 - 8 人日**。

### 方案 B：一次性硬切（不建议）

目标：全量替换，不保留旧标识兼容层。  
风险：旧项目包/旧本地配置/外部依赖极易断裂。

实施：**5 - 9 人日**  
后续缺陷修复与紧急回滚窗口：**4 - 10 人日**

总体风险成本通常高于方案 A。

## 5. 主要风险

1. 历史数据不可读：
改掉签名、本地 key、文件后缀后，旧数据无法自动迁移。

2. 保存链路失败：
`upload/3DEditor` 与后端约定不一致会直接导致保存失败。

3. 生态断裂：
`@astral3d/*` 改名会影响本仓库与外部项目的依赖解析、CI、发布脚本。

4. 线上回滚困难：
如果做硬切，回滚需要同时回滚前端、后端、数据结构与文档入口。

## 6. 推荐策略

1. 先完成“品牌层”改名（已在进行中），保持用户视觉一致性。
2. 深层改名走兼容优先：新旧标识并存至少一个版本周期。
3. 对高风险点先做迁移器：
storage key 迁移、导入导出签名兼容、上传路径双写或后端兼容路由。
4. 制定回归清单后再排期执行，不建议在同一迭代硬切所有标识。

## 7. 建议验收清单（用于未来实施）

1. 旧项目可打开、可保存、可再次打开。
2. 旧导出包可导入，新导出包可导入。
3. 无登录态/有登录态下保存与上传均成功。
4. 首页、编辑器、预览页、插件中心、资源中心品牌一致。
5. 文档链接、帮助入口、脚本文档链接可访问。
6. 构建产物、发布包、CI 流程全部通过。

---

结论：  
“深层重命名”是中大型改造，推荐按兼容优先分阶段执行。当前可以先冻结在“品牌层改名完成”的状态，待排期后再进入 A2-A5。
