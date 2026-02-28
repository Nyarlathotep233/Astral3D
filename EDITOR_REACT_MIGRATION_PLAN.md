# Astral3D Editor React 迁移总计划

## 1. 总目标

- 将 `packages/editor` 的 UI 框架从 Vue3 替换为 React。
- 非 UI 逻辑尽量原封复用：`@astral3d/engine`、接口层、业务工具函数、数据结构优先不改。
- 样式不做 1:1 还原，功能行为优先。
- 长期迭代：每个小阶段结束后，必须有回归、记录、独立 commit。

## 2. 迁移原则（强约束）

- 只替换 UI 层：`Vue Component / Pinia / Vue Router / Vue I18n` -> React 对应方案。
- 非 UI 逻辑复用优先级高于重写；必要改造仅做适配层。
- 每个功能点至少 1 条“最小回归用例”。
- 每个阶段必须满足验收标准后再进入下一阶段。
- 每个阶段完成后更新本文件并提交 commit。

## 3. 阶段拆分与验收标准

### S0：基线冻结与回归基座

- 目标：固化 Vue 基线行为，并统一回归入口。
- 最小回归：
- `创建项目`：校验 `/api/editor3d/scenes/add` 成功与项目卡片可见。
- `复杂编辑+保存`：校验对象编辑行为与 `/api/editor3d/scenes/update/*` 成功。
- 验收标准：本地一键命令可执行回归并输出标准化结果。

### S1：React 工程骨架接入（editor-react）

- 目标：创建 `packages/editor-react`，接入 workspace，打通构建与主路由。
- 最小回归：
- 主路由 `/`、`/preview/:id`、`/editor/:id` 可访问。
- `build` 成功，产物可部署。
- 验收标准：`editor-react:dev` 与 `editor-react:build` 均可用。

### S2：Home 页面迁移

- 目标：迁移项目列表、创建项目、进入项目主流程。
- 最小回归：
- `S2-home-create-project-success`
- `S2-home-list-load-success`
- 验收标准：Home 可替代 Vue 版完成“创建并进入编辑器”。

### S3：Preview 页面迁移

- 目标：迁移预览页并复用 `Viewer + Package.unpack`。
- 最小回归：
- `S3-preview-scene-load-success`
- `S3-preview-empty-scene-hdr-success`
- 验收标准：`/preview/:id` 核心浏览流程可用。

### S4：Editor 主框架迁移

- 目标：迁移编辑器主布局与初始化流程（`App/Viewer/sceneInfo`）。
- 最小回归：
- `S4-editor-open-success`
- `S4-editor-scene-load-complete-signal`
- 验收标准：React 编辑器可打开并加载已有场景。

### S5：核心编辑能力迁移（按域拆子阶段）

- 目标：分域迁移场景树、资源、对象属性、材质、粒子、动画、脚本等。
- 最小回归：每个子模块至少 1 条用例。
- 验收标准：关键生产链路在 React 版闭环可用。

### S6：联调增强与稳定性

- 目标：补齐 websocket、插件、上传链路、异常处理。
- 最小回归：上传、保存、重连等关键链路。
- 验收标准：主流程无阻断级问题，错误可观测可恢复。

### S7：发布切换准备

- 目标：构建优化、部署方案、灰度切换与回滚预案。
- 最小回归：发布前全量回归。
- 验收标准：React 版可作为默认网页入口发布。

## 4. 阶段细化策略（Rolling Refinement）

- 不一次性细化全部大阶段。
- 在开始某个阶段 `Sx` 前，先细化该阶段为 `Sx.1 / Sx.2 / ...`。
- 每个子任务必须明确：范围边界、最小回归、退出标准。
- `Sx` 完成并提交后，再细化下一阶段。

## 5. 当前执行分解（Active: S0）

### S0.1 回归目录与入口标准化

- 目标：建立 `tests/regression` 目录规范与统一运行入口。
- 最小回归：脚本发现与 dry-run 成功。
- 退出标准：单命令可触发基线回归任务。

### S0.2 接入现有 Playwright 基线用例

- 目标：纳入现有 `create-project` 与 `complex-scene-edit` 脚本。
- 最小回归：
- `S0-create-project-success`
- `S0-complex-edit-save-success`
- 退出标准：两条用例输出统一 JSON 结果。

### S0.3 增加断言与失败诊断

- 目标：统一 pass/fail 判定和失败原因输出。
- 最小回归：注入 1 条预期失败并可定位到步骤/API。
- 退出标准：失败报告可直接用于定位问题。

### S0.4 文档化与基线冻结

- 目标：补充执行说明，记录基线路径与结果。
- 最小回归：新成员仅按文档可跑通。
- 退出标准：S0 记录更新并提交。

## 6. Definition of Done（每阶段）

- 功能开发完成并通过自测。
- 新增/更新本阶段最小回归并执行通过。
- 更新本文件“阶段执行记录”。
- 输出阶段总结（完成项/遗留项/风险）。
- 提交独立 commit（不混入无关变更）。

## 7. 回归策略

- 分层：E2E（Playwright）+ 逻辑单测（Vitest）。
- 命名：`Sx-模块-动作-期望`。
- 最小要求：
- 每个功能点至少 1 条自动化用例。
- 每个阶段至少 2 条 E2E（主成功链路 + 1 条异常链路）。

## 8. commit 规范

- 分支建议：`feat/editor-react-sx-*`
- 提交模板：
- `feat(editor-react): Sx <阶段名> - <完成内容>`
- `test(editor-react): Sx <回归用例更新>`
- `docs(editor-react): Sx <记录与验收更新>`

## 9. 阶段执行记录

| 日期 | 阶段 | 目标摘要 | 最小回归结果 | 风险/遗留 | Commit |
| --- | --- | --- | --- | --- | --- |
| 2026-02-28 | S0（规划） | 建立迁移总计划、验收标准、回归与提交流程 | N/A（规划阶段） | 待开始 S0.1 | 26b706c |

## 10. 下一步（立即执行）

- 先执行 `S0.1`：标准化回归目录与统一入口。
- 完成 S0 后再进入 S1（创建 `packages/editor-react` 骨架）。
