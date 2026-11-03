// Read-only live check. Pipe the native menu's copied MCP configuration on stdin.
// No credential, script source or complete business scene is written to the evidence file.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input).mcpServers.h3d;
const sceneId = process.argv[2];
const output = process.argv[3];
if (!sceneId || !output) throw new Error('Expected sceneId and evidence directory arguments');
const client = new Client({ name: 'h3d-local-acceptance-agent', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } }));
  const tools = await client.listTools();
  assert.ok(tools.tools.filter(tool => ['h3d_sessions_list','h3d_capabilities','h3d_scene_status','h3d_scene_query','h3d_object_details','h3d_assets_list','h3d_prefabs_list','h3d_viewport_capture','h3d_operation_status'].includes(tool.name)).every(tool => tool.annotations.readOnlyHint));
  const capabilityResponse = await client.callTool({ name: 'h3d_capabilities', arguments: { id: 'import.local-gltf', includeSchemas: true } });
  assert.ok(!capabilityResponse.isError);
  assert.ok(capabilityResponse.structuredContent.schemas.h3d_model_prepare);
  const list = await client.callTool({ name: 'h3d_sessions_list', arguments: {} });
  const session = list.structuredContent.sessions.find(item => item.sceneId === sceneId && item.state === 'ready');
  assert.ok(session, 'Expected scene must be open and ready');
  const binding = { sessionId: session.sessionId, sceneId };
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: { ...binding, ...args } });
    assert.ok(!response.isError, JSON.stringify(response.content));
    return response;
  };
  const status = (await call('h3d_scene_status')).structuredContent;
  const query = (await call('h3d_scene_query', { limit: 5 })).structuredContent;
  const details = query.items.length ? (await call('h3d_object_details', { uuids: [query.items[0].uuid] })).structuredContent : { objects: [] };
  const assets = (await call('h3d_assets_list', { limit: 2 })).structuredContent;
  const prefabs = (await call('h3d_prefabs_list')).structuredContent;
  const capture = await call('h3d_viewport_capture');
  const image = capture.content.find(item => item.type === 'image');
  assert.ok(image);
  const wrongScene = await client.callTool({ name: 'h3d_scene_query', arguments: { ...binding, sceneId: 'not-the-open-scene' } });
  assert.equal(wrongScene.isError, true);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'viewport.png'), Buffer.from(image.data, 'base64'));
  const evidence = {
    date: new Date().toISOString(), toolCount: tools.tools.length, sceneId, capability: capabilityResponse.structuredContent.items[0].id,
    renderingAPI: status.renderingAPI, state: status.state, writable: status.writable,
    objectCount: query.total, pageCount: query.items.length,
    detailsCount: details.objects.length, assetCount: assets.total, prefabCount: prefabs.items.length,
    capture: JSON.parse(capture.content.find(item => item.type === 'text').text),
    wrongSceneRejected: true,
  };
  await writeFile(path.join(output, 'read-only.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { await client.close(); }
