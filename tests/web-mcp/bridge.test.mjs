import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { startBridge } from '../../packages/mcp-bridge/src/bridge.mjs';

const require = createRequire(new URL('../../packages/mcp-bridge/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StreamableHTTPClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')));
const { WebSocket } = require('ws');
const origin = 'https://localhost:8090';
const headers = token => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const value = result => result.structuredContent || JSON.parse(result.content.find(item => item.type === 'text').text);

async function setup(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'h3d-bridge-test-'));
  const bridge = await startBridge({ port: 0, uploadDirectory: directory, maxPairingsPerMinute: 200, ...options });
  const cleanups = [];
  t.after(async () => { await Promise.allSettled(cleanups.map(fn => fn())); await bridge.close(); await rm(directory, { recursive: true, force: true }); });
  const pair = async () => {
    const response = await fetch(`${bridge.url}/agent/sessions`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId: 'scene-a', documentEpoch: 'epoch-a', status: { sceneId: 'scene-a', documentEpoch: 'epoch-a', sceneRevision: 0, state: 'ready' } }) });
    assert.equal(response.status, 201); return response.json();
  };
  const browser = async (session, handler = request => ({ echoed: request.args, method: request.method })) => {
    const ws = new WebSocket(`${bridge.url.replace('http:', 'ws:')}/agent/connect`, { origin });
    cleanups.push(() => ws.terminate());
    await once(ws, 'open');
    const ready = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'hello', sessionId: session.sessionId, browserToken: session.browserToken }));
    assert.equal(JSON.parse((await ready)[0]).type, 'ready');
    ws.on('message', async data => {
      const request = JSON.parse(data);
      if (request.type !== 'request') return;
      const result = await handler(request, ws);
      if (result !== undefined && ws.readyState === 1) ws.send(JSON.stringify({ type: 'result', id: request.id, ok: true, result }));
    });
    return ws;
  };
  const client = async session => {
    const client = new Client({ name: 'bridge-integration-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${session.agentToken}` } } }));
    cleanups.push(() => client.close()); return client;
  };
  return { bridge, pair, browser, client };
}

test('only approved page origins create pairing; MCP requires an agent token', async t => {
  const { bridge, pair } = await setup(t);
  for (const badOrigin of [undefined, 'https://evil.invalid']) {
    const response = await fetch(`${bridge.url}/agent/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(badOrigin ? { Origin: badOrigin } : {}) }, body: '{}' });
    assert.equal(response.status, 403);
  }
  const session = await pair();
  for (const token of ['', session.browserToken]) {
    const response = await fetch(`${bridge.url}/mcp`, { method: 'POST', headers: headers(token), body: '{}' }); assert.equal(response.status, 401);
  }
});

test('real SDK discovers tools and can only route to its paired page', async t => {
  const { pair, browser, client } = await setup(t);
  const first = await pair(), second = await pair(); await browser(first); await browser(second);
  const agent = await client(first), tools = await agent.listTools();
  assert.ok(tools.tools.some(tool => tool.name === 'h3d_scene_batch'));
  assert.ok(tools.tools.some(tool => tool.name === 'h3d_upload_prepare'));
  const list = value(await agent.callTool({ name: 'h3d_sessions_list', arguments: {} }));
  assert.deepEqual(list.sessions.map(session => session.sessionId), [first.sessionId]);
  assert.equal(list.sessions[0].connected, true);
  const result = value(await agent.callTool({ name: 'h3d_scene_query', arguments: { sessionId: first.sessionId, sceneId: 'scene-a', documentEpoch: 'epoch-a', name: 'Cube' } }));
  assert.equal(result.method, 'h3d_scene_query'); assert.equal(result.echoed.name, 'Cube');
  const denied = await agent.callTool({ name: 'h3d_scene_status', arguments: { sessionId: second.sessionId } });
  assert.equal(denied.isError, true); assert.equal(value(denied).error.code, 'SESSION_FORBIDDEN');
});

test('runtime sampling uses read-only MCP contracts and rejects oversized windows before dispatch', async t => {
  const { pair, browser, client } = await setup(t);
  const session = await pair();
  await browser(session);
  const agent = await client(session);
  const args = { sessionId: session.sessionId, uuids: ['sprite'] };
  const result = value(await agent.callTool({ name: 'h3d_runtime_sample', arguments: args }));
  assert.equal(result.echoed.count, 1);
  const invalid = await agent.callTool({ name: 'h3d_runtime_sample', arguments: { ...args, count: 101, intervalMs: 1000 } });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /10 seconds/);
  const listed = (await agent.listTools()).tools;
  for (const name of ['h3d_runtime_scene_query', 'h3d_runtime_sample']) {
    assert.equal(listed.find(tool => tool.name === name)?.annotations.readOnlyHint, true);
  }
});

test('concurrent SDK requests correlate out-of-order page results', async t => {
  const { pair, browser, client } = await setup(t); const session = await pair(); const ids = new Set();
  await browser(session, async request => { ids.add(request.id); await new Promise(resolve => setTimeout(resolve, request.args.name === 'slow' ? 30 : 1)); return { name: request.args.name }; });
  const agent = await client(session);
  const results = await Promise.all(['slow', 'fast'].map(name => agent.callTool({ name: 'h3d_scene_query', arguments: { sessionId: session.sessionId, name } })));
  assert.deepEqual(results.map(result => value(result).name), ['slow', 'fast']); assert.equal(ids.size, 2);
});

test('disconnect marks in-flight mutations unknown and reconnect never replays them', async t => {
  const { pair, browser, client } = await setup(t); const session = await pair(); let delivered = 0;
  await browser(session, (_request, ws) => { delivered++; ws.close(); }); const agent = await client(session);
  const result = await agent.callTool({ name: 'h3d_scene_batch', arguments: { sessionId: session.sessionId, sceneId: 'scene-a', documentEpoch: 'epoch-a', expectedRevision: 0, operationId: 'op-one', operations: [{ type: 'create', kind: 'box', ref: 'one' }] } });
  assert.equal(result.isError, true); assert.equal(value(result).error.outcome, 'unknown'); assert.equal(value(result).error.operationId, 'op-one');
  await browser(session, () => { delivered++; return {}; }); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(delivered, 1);
});

test('page recovery and unknown outcome metadata survives the WS-to-MCP error path', async t => {
  const { pair, browser, client } = await setup(t); const session = await pair();
  await browser(session, (request, ws) => {
    ws.send(JSON.stringify({ type: 'result', id: request.id, ok: false, error: {
      code: 'BATCH_RECOVERY_FAILED', message: 'Failed to restore part of the scene', recoveryFailed: true,
      ...(request.args.operationId === 'original-operation' ? { outcome: 'unknown' } : {}), operationId: 'incorrect-page-operation-id', stack: 'private stack must not be forwarded',
    } }));
  });
  const agent = await client(session);
  const result = await agent.callTool({ name: 'h3d_scene_batch', arguments: {
    sessionId: session.sessionId, sceneId: 'scene-a', documentEpoch: 'epoch-a', expectedRevision: 0,
    operationId: 'original-operation', operations: [{ type: 'create', kind: 'box', ref: 'box' }],
  } });
  assert.equal(result.isError, true);
  assert.deepEqual(value(result).error, { code: 'BATCH_RECOVERY_FAILED', message: 'Failed to restore part of the scene', recoveryFailed: true, outcome: 'unknown', operationId: 'original-operation' });
  const withoutOutcome = await agent.callTool({ name: 'h3d_scene_batch', arguments: {
    sessionId: session.sessionId, sceneId: 'scene-a', documentEpoch: 'epoch-a', expectedRevision: 0,
    operationId: 'outcome-not-supplied', operations: [{ type: 'create', kind: 'box', ref: 'box' }],
  } });
  assert.equal(value(withoutOutcome).error.outcome, 'unknown');
  assert.equal(value(withoutOutcome).error.recoveryFailed, true);
});

test('partial editor status updates retain capabilities without overriding connection identity', async t => {
  const { pair, browser, client } = await setup(t); const session = await pair(); const ws = await browser(session);
  const capabilities = { operations: ['create', 'transform'], revision: 1 };
  ws.send(JSON.stringify({ type: 'status', status: { capabilities, sceneRevision: 1 } }));
  ws.send(JSON.stringify({ type: 'status', status: { sceneRevision: 2, sessionId: 'untrusted-id', connected: false } }));
  const acknowledged = once(ws, 'message'); ws.send(JSON.stringify({ type: 'ping' })); await acknowledged;
  const agent = await client(session);
  const current = value(await agent.callTool({ name: 'h3d_capabilities', arguments: {} }));
  assert.deepEqual(current.editorCapabilities, capabilities);
  const listed = value(await agent.callTool({ name: 'h3d_sessions_list', arguments: {} })).sessions[0];
  assert.equal(listed.sceneRevision, 2); assert.equal(listed.sessionId, session.sessionId); assert.equal(listed.connected, true);
});

test('bounded queue refuses excess work without dispatch and timeout reports unknown', async t => {
  const { pair, browser, client } = await setup(t, { maxPendingPerSession: 1, requestTimeoutMs: 80 }); const session = await pair();
  let start; const dispatched = new Promise(resolve => { start = resolve; });
  await browser(session, () => { start(); }); const agent = await client(session);
  const first = agent.callTool({ name: 'h3d_scene_status', arguments: { sessionId: session.sessionId } }); await dispatched;
  const second = await agent.callTool({ name: 'h3d_scene_status', arguments: { sessionId: session.sessionId } });
  assert.equal(value(second).error.code, 'BUSY'); assert.equal(value(second).error.outcome, 'not_started');
  assert.equal(value(await first).error.outcome, 'unknown');
});

test('artifact bundles preserve relative paths and are isolated to both tokens of the owning page', async t => {
  const { bridge, pair, client } = await setup(t); const session = await pair(), other = await pair(); const agent = await client(session);
  const contents = [Buffer.from('{"asset":{"version":"2.0"}}'), Buffer.from([1, 2, 3])];
  const manifest = ['model.gltf', 'textures/pixel.bin'].map((file, index) => ({ path: file, size: contents[index].length, sha256: createHash('sha256').update(contents[index]).digest('hex') }));
  const prepared = value(await agent.callTool({ name: 'h3d_upload_prepare', arguments: { files: manifest, entryPath: 'model.gltf' } }));
  const premature = await agent.callTool({ name: 'h3d_upload_complete', arguments: { uploadId: prepared.uploadId } }); assert.equal(premature.isError, true);
  for (const [index, file] of prepared.files.entries()) { const uploaded = await fetch(file.url, { method: 'PUT', headers: file.headers, body: contents[index] }); assert.equal(uploaded.status, 200); }
  const artifact = value(await agent.callTool({ name: 'h3d_upload_complete', arguments: { uploadId: prepared.uploadId } }));
  assert.equal(artifact.entryPath, 'model.gltf'); assert.equal(artifact.files[1].path, 'textures/pixel.bin');
  for (const token of [session.browserToken, session.agentToken]) {
    const downloaded = await fetch(`${bridge.url}${artifact.files[1].url}`, { headers: headers(token) }); assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), contents[1]);
  }
  const forbidden = await fetch(`${bridge.url}${artifact.url}`, { headers: headers(other.agentToken) }); assert.equal(forbidden.status, 403);
  const traversal = await agent.callTool({ name: 'h3d_upload_prepare', arguments: { name: '../escape', size: 1 } }); assert.equal(traversal.isError, true);
  assert.equal(JSON.stringify(artifact).includes(tmpdir()), false);
});

test('browser export upload HTTP workflow works and revoke invalidates all session access', async t => {
  const { bridge, pair } = await setup(t); const session = await pair();
  const preparedResponse = await fetch(`${bridge.url}/agent/uploads`, { method: 'POST', headers: headers(session.browserToken), body: JSON.stringify({ name: 'scene.json', size: 2, contentType: 'application/json' }) });
  assert.equal(preparedResponse.status, 201); const prepared = await preparedResponse.json();
  const uploaded = await fetch(`${bridge.url}${prepared.uploadUrl}`, { method: 'PUT', headers: prepared.headers, body: '{}' }); assert.equal(uploaded.status, 200);
  const completedResponse = await fetch(`${bridge.url}/agent/uploads/${prepared.uploadId}/complete`, { method: 'POST', headers: headers(session.browserToken) });
  const artifact = await completedResponse.json(); assert.equal(artifact.name, 'scene.json'); assert.ok(artifact.url.startsWith('/agent/'));
  const revoked = await fetch(`${bridge.url}/agent/sessions/${session.sessionId}`, { method: 'DELETE', headers: headers(session.browserToken) }); assert.equal(revoked.status, 200);
  assert.equal((await fetch(`${bridge.url}${artifact.url}`, { headers: headers(session.agentToken) })).status, 401);
  assert.equal((await fetch(`${bridge.url}${prepared.uploadUrl}`, { method: 'PUT', headers: prepared.headers, body: '{}' })).status, 401);
});

test('WebSocket rejects unknown origins and authentication has a deadline', async t => {
  const { bridge } = await setup(t, { authenticationTimeoutMs: 40 });
  const evil = new WebSocket(`${bridge.url.replace('http:', 'ws:')}/agent/connect`, { origin: 'https://evil.invalid' });
  const rejected = await new Promise(resolve => { evil.on('unexpected-response', (_request, response) => { response.resume(); evil.terminate(); resolve(response.statusCode); }); evil.on('error', () => {}); });
  assert.equal(rejected, 403);
  const idle = new WebSocket(`${bridge.url.replace('http:', 'ws:')}/agent/connect`, { origin }); await once(idle, 'open');
  const [code] = await once(idle, 'close'); assert.equal(code, 1008);
});
