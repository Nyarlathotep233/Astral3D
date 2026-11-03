import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPABILITIES } from '../../packages/desktop/src/capabilities.mjs';

export function renderCoverage() {
  const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const counts = Object.fromEntries(['available', 'partial', 'planned'].map(status => [status, CAPABILITIES.filter(item => item.status === status).length]));
  const lines = [
    '# H3D MCP 能力覆盖矩阵', '',
    '> 由 `node tests/desktop-mcp/render-coverage.mjs` 从 `packages/desktop/src/capabilities.json` 生成。目录不是验收结论。', '',
    `当前 ${CAPABILITIES.length} 项：available ${counts.available}，partial ${counts.partial}，planned ${counts.planned}。`, '',
    '- available：所描述操作已接入；不代表完整保存重载或双 Agent 验收已通过。具体证据见验收记录。',
    '- partial：仅列出的工具操作/参数已接入，不代表整个 GUI 能力。',
    '- planned：尚未接入；源文件/Loader 分支存在不是支持证明。',
    '- GUI 路径和共享实现按当前源码核对；复合能力仍需逐参数、逐格式真实样例验收。',
    '- `tests` 是可复测入口，不表示其最后一次运行结果。结果见 `DESKTOP_MCP_ACCEPTANCE.md`。',
    '- 全部场景内修改目前仍待完整保存重载验收；服务器副作用不伪称可撤销。',
    '- 数据中心、系统设置、已移除 GLSL 创建/路径追踪、停用实验功能不纳入。', '',
    '能力发现：`h3d_capabilities({group?,id?,status?,offset?,limit?,includeSchemas?})`。参数来自正式工具同一份校验定义，默认不返回全部 schema。', '',
    '| 能力 | 状态 | GUI → 共享实现 | MCP / 操作 | 副作用 / 撤销 | 用例入口 | 备注 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const item of CAPABILITIES) lines.push('| ' + [
    `${item.id}: ${item.title}`, item.status, `\`${item.gui}\` → \`${item.implementation}\``,
    [...item.tools, ...item.operations].map(name => `\`${name}\``).join(', ') || '尚未接入',
    `${item.sideEffect} / ${item.undo}`, item.tests.join(', ') || '待补真实用例', item.notes,
  ].map(escape).join(' | ') + ' |');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(fileURLToPath(new URL('../../H3D_MCP_CAPABILITY_MATRIX.md', import.meta.url)), renderCoverage());
}
