import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CAPABILITIES, discoverCapabilities } from '../../packages/desktop/src/capabilities.mjs';
import { EDITOR_TOOLS, LOCAL_TOOLS } from '../../packages/desktop/src/mcp.mjs';
import { renderCoverage } from './render-coverage.mjs';

const tools = { ...EDITOR_TOOLS, ...LOCAL_TOOLS };
const root = path.resolve(import.meta.dirname, '../..');
test('capability inventory references actual sources, tests and registered tools', () => {
  assert.equal(new Set(CAPABILITIES.map(item => item.id)).size, CAPABILITIES.length);
  for (const item of CAPABILITIES) {
    for (const key of ['gui', 'implementation']) assert.ok(existsSync(path.join(root, item[key])), `${item.id}: ${key}`);
    for (const file of item.tests) assert.ok(existsSync(path.join(import.meta.dirname, file)), `${item.id}: ${file}`);
    for (const name of item.tools) assert.ok(tools[name], `${item.id}: ${name}`);
    if (item.status === 'planned') assert.deepEqual(item.tools, [], 'not implemented is not advertised as callable');
    else assert.ok(item.tools.length && item.tests.length);
  }
  assert.equal(readFileSync(path.join(root, 'H3D_MCP_CAPABILITY_MATRIX.md'), 'utf8'), renderCoverage());
});

test('discovery pages, filters, rejects unknown keys and returns schemas only on request', () => {
  const first = discoverCapabilities({ limit: 3 }, tools);
  const second = discoverCapabilities({ offset: 3, limit: 3 }, tools);
  assert.equal(first.total, CAPABILITIES.length);
  assert.equal(first.schemas, undefined);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 6);
  const planned = discoverCapabilities({ group: 'export', includeSchemas: true }, tools);
  assert.ok(planned.items.every(item => item.status === 'planned'));
  assert.deepEqual(planned.schemas, {});
  assert.throws(() => discoverCapabilities({ id: 'invented' }, tools), /Unknown capability/);
  assert.throws(() => discoverCapabilities({ group: 'invented' }, tools), /Unknown capability group/);
  assert.throws(() => discoverCapabilities({ limit: 1000 }, tools));
  assert.throws(() => discoverCapabilities({ code: 'execute()' }, tools));
  const batch = discoverCapabilities({ id: 'object.primitives', includeSchemas: true }, tools);
  assert.ok(batch.schemas.h3d_scene_batch.inputSchema.properties.operations);
});
