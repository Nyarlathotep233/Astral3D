// Measures only the bridge with simulated browser handlers, not rendering or Java APIs.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { startBridge } from '../../packages/mcp-bridge/src/bridge.mjs';

const require = createRequire(new URL('../../packages/mcp-bridge/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StreamableHTTPClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')));
const { WebSocket } = require('ws');
const argument = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : Number(process.argv[index + 1]); };
const count = argument('--sessions', 50), rounds = argument('--rounds', 10), active = argument('--active', count);
if(!Number.isInteger(active)||active<1||active>count)throw new Error('--active must be 1..sessions');
if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isInteger(rounds) || rounds < 1 || rounds > 1000) throw new Error('Use --sessions 1..1000 and --rounds 1..1000');
const directory = await mkdtemp(path.join(tmpdir(), 'h3d-bridge-load-'));
const bridge = await startBridge({ port: 0, uploadDirectory: directory, maxSessions: count + 1, maxPairingsPerMinute: count + 1, maxMcpRequests: count * 2, maxPending: count * 2 });
const clients = [], sockets = [], bindings = [], durations = [];
const baselineRss = process.memoryUsage().rss;
let failures = 0;
try {
  for (let i = 0; i < count; i++) {
    const response = await fetch(`${bridge.url}/agent/sessions`, { method: 'POST', headers: { Origin: 'https://localhost:8090', 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId: `scene-${i}`, documentEpoch: 'load-test' }) });
    if (!response.ok) throw new Error(`Pairing failed: ${response.status}`);
    const pairing = await response.json(); bindings.push(pairing);
    const ws = new WebSocket(`${bridge.url.replace('http:', 'ws:')}/agent/connect`, { origin: 'https://localhost:8090' }); sockets.push(ws); await once(ws, 'open');
    const ready = once(ws, 'message'); ws.send(JSON.stringify({ type: 'hello', sessionId: pairing.sessionId, browserToken: pairing.browserToken })); await ready;
    ws.on('message', data => { const message = JSON.parse(data); if (message.type === 'request') ws.send(JSON.stringify({ type: 'result', id: message.id, ok: true, result: { sceneId: `scene-${i}`, sceneRevision: 0, objects: [] } })); });
    const client = new Client({ name: 'h3d-bridge-load', version: '1.0.0' }); clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${pairing.agentToken}` } } }));
  }
  const connectedRss = process.memoryUsage().rss, started = performance.now();
  for (let round = 0; round < rounds; round++) await Promise.all(clients.slice(0,active).map(async (client, i) => {
    const before = performance.now();
    try { const result = await client.callTool({ name: 'h3d_scene_status', arguments: { sessionId: bindings[i].sessionId, sceneId: `scene-${i}`, documentEpoch: 'load-test' } }); if (result.isError) failures++; }
    catch { failures++; }
    durations.push(performance.now() - before);
  }));
  const elapsedMs = performance.now() - started, ordered = durations.toSorted((a, b) => a - b);
  const percentile = p => Number(ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * p))].toFixed(2));
  console.log(JSON.stringify({ scenario: 'loopback MCP SDK clients + simulated WebSocket pages; excludes editor/rendering/backend', node: process.version, sessions: count, active, requests: active * rounds, failures, elapsedMs: Math.round(elapsedMs), requestsPerSecond: Math.round(active * rounds / elapsedMs * 1000), latencyMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) }, processRssMiB: { baseline: Math.round(baselineRss / 1048576), connected: Math.round(connectedRss / 1048576), final: Math.round(process.memoryUsage().rss / 1048576) }, pendingAfterRun: bridge.sessions.pendingCount }, null, 2));
  if (failures || bridge.sessions.pendingCount) process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(client => client.close())); for (const ws of sockets) ws.terminate();
  await bridge.close(); await rm(directory, { recursive: true, force: true });
}
