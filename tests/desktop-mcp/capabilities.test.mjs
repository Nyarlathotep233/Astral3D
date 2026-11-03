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

test('vector schemas use homogeneous arrays while retaining exactly three finite numbers', () => {
  const schema = discoverCapabilities({ id: 'object.transform', includeSchemas: true }, tools).schemas.h3d_scene_batch.inputSchema;
  const operation = tools.h3d_scene_batch.schema.shape.operations.element;
  const transform = { type: 'transform', target: { ref: 'box' }, space: 'local', position: [1, 2, 3] };
  assert.ok(operation.safeParse(transform).success);
  for (const position of [[1, 2], [1, 2, 3, 4], [1, '2', 3], [1, Infinity, 3]]) assert.ok(!operation.safeParse({ ...transform, position }).success);
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'array') assert.ok(!Array.isArray(value.items), 'no tuple-style items in public tool schemas');
    for (const child of Object.values(value)) walk(child);
  };
  walk(schema);
});

test('prefab sources and embedded execution confirmation use one strict cross-client contract', () => {
  const schema=tools.h3d_import_prepare.schema;
  const args={sessionId:'98a01537-8fe6-42f2-bbb8-5cbb3d5f8a39',sceneId:'test',jobId:'6c1cd15a-1ed2-4d05-9eee-4824ddbb0fa5',source:{type:'builtin-prefab',key:'tower-crane'}};
  assert.equal(schema.parse(args).confirmEmbeddedContent,false);
  assert.equal(schema.parse({...args,confirmEmbeddedContent:true}).confirmEmbeddedContent,true);
  assert.ok(schema.safeParse({...args,source:{type:'local-prefab',filePath:'C:/Downloads/model.h3dprefab.zip'}}).success);
  for(const source of [{type:'builtin-prefab',key:'tower-crane',url:'https://other'},{type:'local-prefab'},{type:'script',code:'run()'}])assert.ok(!schema.safeParse({...args,source}).success);
  assert.ok(!schema.safeParse({...args,resolvedLocal:{url:'file:///private'}}).success);
});
