import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { startMcp, READ_TOOLS, EDITOR_TOOLS, LOCAL_TOOLS } from '../../packages/desktop/src/mcp.mjs';

test('real SDK initialize/list/call; strict read/write tools and error propagation', async () => {
  const sessionId = randomUUID();
  const calls = [];
  const server = await startMcp({ port: 0, token: 'test-token', bridge: {
    list: async () => [{ sessionId, sceneId: 'test-scene' }],
    call: async (id, method, args) => {
      calls.push({ id, method, args });
      if (id !== sessionId) throw new Error('Editor session expired');
      return { items: [], total: 0, limit: args.limit, offset: args.offset };
    },
  } });
  const endpoint = new URL(`http://127.0.0.1:${server.port}/mcp`);
  const client = new Client({ name: 'h3d-test-agent', version: '1.0.0' });
  try {
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { Authorization: 'Bearer test-token', Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(endpoint, { headers: { Authorization: 'Bearer test-token' } })).status, 405);
    await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: 'Bearer test-token' } } }));
    const listing = await client.listTools();
    assert.deepEqual(listing.tools.map(tool => tool.name).sort(), [...Object.keys(LOCAL_TOOLS), ...Object.keys(EDITOR_TOOLS)].sort());
    assert.ok(listing.tools.filter(tool => Object.hasOwn(READ_TOOLS, tool.name)).every(tool => tool.annotations.readOnlyHint));
    assert.equal(listing.tools.find(tool => tool.name === 'h3d_scene_batch').annotations.readOnlyHint, false);
    const sessions = await client.callTool({ name: 'h3d_sessions_list', arguments: {} });
    assert.equal(sessions.structuredContent.sessions[0].sessionId, sessionId);
    const capability = await client.callTool({ name: 'h3d_capabilities', arguments: { id: 'import.local-gltf', includeSchemas: true } });
    assert.equal(capability.structuredContent.total, 1);
    assert.equal(capability.structuredContent.items[0].status, 'available');
    assert.deepEqual(capability.structuredContent.schemas.h3d_model_prepare.inputSchema, listing.tools.find(tool => tool.name === 'h3d_model_prepare').inputSchema);
    assert.equal(calls.length, 0, 'discovery does not invoke the editor bridge');
    const success = await client.callTool({ name: 'h3d_scene_query', arguments: { sessionId, sceneId: 'test-scene', limit: 2 } });
    assert.equal(success.structuredContent.total, 0);
    assert.equal(calls[0].args.offset, 0);
    const unknown = await client.callTool({ name: 'h3d_scene_query', arguments: { sessionId: randomUUID(), sceneId: 'test-scene' } });
    assert.equal(unknown.isError, true);
    const before = calls.length;
    const malformed = await client.callTool({ name: 'h3d_scene_query', arguments: { sessionId, sceneId: 'test-scene', limit: 999 } });
    assert.equal(malformed.isError, true);
    assert.equal(calls.length, before);
    const validBatch = await client.callTool({ name: 'h3d_scene_batch', arguments: { sessionId, sceneId: 'test-scene', expectedRevision: 0, operationId: randomUUID(), label: 'test', operations: [{ type: 'create', ref: 'box', kind: 'box', name: 'box' }] } });
    assert.ok(!validBatch.isError);
    const badBatch = await client.callTool({ name: 'h3d_scene_batch', arguments: { sessionId, sceneId: 'test-scene', expectedRevision: 0, operationId: randomUUID(), label: 'test', operations: [{ type: 'eval', source: 'doAnything()' }] } });
    assert.equal(badBatch.isError, true);
    const write = await client.callTool({ name: 'h3d_scene_save', arguments: { sessionId, sceneId: 'test-scene' } });
    assert.equal(write.isError, true);
    assert.equal(calls.length, before + 1);
  } finally { await client.close(); await server.close(); }
});
