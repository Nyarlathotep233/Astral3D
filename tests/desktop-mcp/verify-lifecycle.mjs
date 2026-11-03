// Uses the native menu configuration on stdin; never persists the credential.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input).mcpServers.h3d;
const [mode, sceneId, file] = process.argv.slice(2);
assert.ok(['before', 'reloaded', 'closed'].includes(mode));
const client = new Client({ name: 'h3d-lifecycle-acceptance', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } }));
  const sessions = (await client.callTool({ name: 'h3d_sessions_list', arguments: {} })).structuredContent.sessions;
  const current = sessions.find(item => item.sceneId === sceneId && item.state === 'ready');
  if (mode === 'before') {
    assert.ok(current);
    const unauthenticated = await fetch(config.url);
    assert.equal(unauthenticated.status, 401);
    const invalidOrigin = await fetch(config.url, { headers: { ...config.headers, Origin: 'https://untrusted.example' } });
    assert.equal(invalidOrigin.status, 403);
    // Node fetch may normalize Host; use HTTP directly to send the actual hostile header.
    const invalidHostStatus = await new Promise((resolve, reject) => {
      const req = request(config.url, { headers: { ...config.headers, Host: 'untrusted.example' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject); req.end();
    });
    assert.equal(invalidHostStatus, 403);
    await writeFile(file, JSON.stringify({ sceneId, sessionId: current.sessionId, authChecked: true, originChecked: true, hostChecked: true }, null, 2));
  } else {
    const evidence = JSON.parse(await readFile(file, 'utf8'));
    const oldSession = mode === 'reloaded' ? evidence.sessionId : evidence.reloadedSessionId;
    assert.ok(oldSession);
    const result = await client.callTool({ name: 'h3d_scene_query', arguments: { sessionId: oldSession, sceneId } });
    assert.equal(result.isError, true, 'Stale session must fail');
    if (mode === 'reloaded') {
      assert.ok(current);
      assert.notEqual(current.sessionId, oldSession);
      evidence.reloadRejectedOldSession = true;
      evidence.reloadedSessionId = current.sessionId;
    } else {
      assert.equal(current, undefined);
      evidence.closeRejectedOldSession = true;
      evidence.remainingWindows = sessions.length;
    }
    await writeFile(file, JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify({ mode, passed: true }));
} finally { await client.close(); }
