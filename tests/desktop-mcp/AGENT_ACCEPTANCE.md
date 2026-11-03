# 双客户端验收入口

这不是完整阶段 6 验收。当前先提供同一只读任务，真实写入/导出/保存任务须随对应能力完成后补齐。

## 运行

1. 启动现有本地副本服务和最新源码 Electron，不建新库/profile。
2. 在客户端打开已授权蓝色方块测试场景 `db24d798905d186dfb61505f9396d5b8`，等待 ready。历史项目不改。
3. 原生菜单「MCP → 复制配置」。配置含凭据，不粘贴到聊天或提交仓库。
4. 仓库根目录 PowerShell 顺序运行：

```powershell
./tests/desktop-mcp/run-agent-readonly.ps1 -Client codex
./tests/desktop-mcp/run-agent-readonly.ps1 -Client dsh
```

同一任务文本 `agent-readonly-task.txt`，不变更业务参数。Codex 用每次 CLI 配置覆盖和 bearer_token_env_var；DSH 用随包 MCP 插件的 --patch overlay 和临时进程环境请求头。均不修改全局 profile、模型设置或源码。Codex 参数依据本机 CLI help 及[官方 MCP 配置说明](https://learn.chatgpt.com/docs/extend/mcp)；DSH 依据本机 0.2.1-rc.2 随包 `dsh-mcp-client/README.zh.md`。

DSH headless 必须在启动环境已有 `DEEPSEEK_API_KEY` 或用户已配置的可用路由。不要把密钥写到任务、patch 或日志；不要为通过测试擅自读取其他 profile 的凭据、切换服务。2026-11-03 初次实跑为 MISSING_CREDENTIAL，模型未调用工具，待用户配置后复测。

## 本次实际结果与缺口

- Codex fresh/ephemeral 会话实际 9 次 H3D MCP 调用，无 command_execution：会话、状态×2、对象查询、详情、资源、预制体、截图、错误场景查询。错误场景失败后正确绑定仍可用，revision 97 未变；4 个运行时对象、WebGPU、15 条服务资源、1 个内置预制体。
- 图片 PNG 传输成功；模型描述为蓝色方块/网格/视图立方体，与独立截图一致。不是 HTML/CSS 合成截图，也不是全功能视觉理解证明。
- 原 batch schema 被 Codex 忽略：`failed to build tool spec: invalid type: map, expected a string`。同质向量由 tuple 改为 length(3) number array，保持 [x,y,z] 及服务端长度/有限值校验；不新增 Codex 专用接口。正式 Electron 主进程重启后的客户端复测仍待完成，不能仅凭 schema 单测记为修复验收通过。
- 本轮日志 token 汇总：input 219285、cached input 188672、output 1152；含客户端原有上下文，不代表 H3D 净 token 成本。事件没有逐调用耗时，未编造分项性能。仅 1 轮只读，不能替代 100/1000 对象各 3 轮。
- 客户端日志还出现其他既有 MCP 的启动/退出告警，不将其误记为 H3D 成功或静默改全局配置。
- 当前日志在 `.codex-logs/desktop-mcp/codex-readonly.jsonl` 与 `dsh-readonly.jsonl`；可复跑覆盖同名证据，重要结果先另行明确归档，不复制业务数据。

验收以调用日志、独立状态/截图、保存重载等共同判定，不以 exit=0 或 Agent 自述代替。未实现的保存/Play/导出/管理操作不让 Agent 用 Shell/CDP 代做。

## DSH 桌面客户端接续（未通过）

用户已打开 DeepSeek Harness 桌面客户端并授权直接操作。已通过原生 UI 定位其插件配置页；此后 Windows 锁屏，暂停输入并请用户解锁。没有把旧对话截图当作当前模型成功调用 MCP 的证据，也没有提取桌面登录凭据给 CLI 使用。

解锁后先核对实际 MCP 配置入口，在新会话运行同一 `agent-readonly-task.txt`，不修改原 haolink 对话、全局模型或权限策略。若遇登录/权限确认交由用户处理。桌面客户端能登录并不证明 headless CLI 已有模型凭据；两条验证路径分别记录。

此次新增预制体工具需在最新主进程中验证；当前源码/单元通过不等于 Codex 或 DSH 已实际使用。100/1000 对象三轮、完整保存/导出和独立包验收仍待实现后执行。
