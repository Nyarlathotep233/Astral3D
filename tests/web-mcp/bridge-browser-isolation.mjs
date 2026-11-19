// Real Chrome tabs + MCP SDK + running bridge/API. No editor internals or mocked pages.
// Creates dedicated empty projects and retains their IDs for manual inspection.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const bridgeRequire = createRequire(new URL('../../packages/mcp-bridge/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StreamableHTTPClientTransport } = await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const editorUrl = process.env.EDITOR_URL || 'https://localhost:8090';
const apiUrl = process.env.API_URL || 'http://127.0.0.1:8080/api';
const output = path.resolve('.git/codex-runtime/web-mcp-isolation');
await mkdir(output, { recursive: true });
const evidence = { checks: [], projects: [], browserErrors: [], downloads: 0 };
const pairings = [], artifacts = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
const pages = [];
const mark = message => { evidence.checks.push(message); console.log(message); };

async function createProject(label) {
  const response = await fetch(`${apiUrl}/editor3d/scenes/add`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '', sceneName: `MCP双页隔离-${label}-${new Date().toISOString()}`, sceneType: '其他', sceneIntroduction: 'Dedicated browser pairing isolation acceptance project', sceneVersion: 1, zip: '', coverPicture: '', hasDrawing: 0, projectType: 0 }),
  });
  const data = await response.json();
  assert(response.ok && data.code === 200 && data.result?.id, JSON.stringify(data));
  evidence.projects.push({ tab: label, sceneId: data.result.id });
  return data.result.id;
}

async function tool(pair, name, args = {}, errorCode) {
  const response = await pair.client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
  const data = response.structuredContent || JSON.parse(response.content.find(item => item.type === 'text').text);
  if (errorCode) {
    assert.equal(response.isError, true, `${name} unexpectedly succeeded`);
    assert.equal(data.error?.code, errorCode, JSON.stringify(data));
  } else assert(!response.isError, `${name}: ${JSON.stringify(data)}`);
  return data;
}

async function poll(action, predicate, label, timeout = 60000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await action();
    if (predicate(last)) return last;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`${label}: ${JSON.stringify(last)}`);
}

async function pairPage(page, sceneId, label) {
  await page.getByRole('button', { name: '连接 Agent', exact: true }).click();
  const created = page.waitForResponse(response => response.url().endsWith('/agent/sessions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '授权连接此页面', exact: true }).click();
  const response = await created;
  assert.equal(response.status(), 201);
  const pairing = await response.json();
  const client = new Client({ name: `h3d-browser-isolation-${label}`, version: '1.0.0' });
  const pair = { ...pairing, client, page };
  pairings.push(pair);
  await client.connect(new StreamableHTTPClientTransport(new URL(pair.mcpUrl), { requestInit: { headers: { Authorization: `Bearer ${pair.agentToken}` } } }));
  await page.getByRole('button', { name: 'Agent 已连接', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await poll(() => tool(pair, 'h3d_sessions_list'), data => data.sessions[0]?.sceneId === sceneId && data.sessions[0]?.sceneState === (sceneId === null ? 'inactive' : 'ready') && data.sessions[0]?.connected, `Tab ${label} must be ready`);
  pair.status = await tool(pair, 'h3d_scene_status', { sessionId: pair.sessionId });
  assert.equal(pair.status.sceneId, sceneId);
  return pair;
}

async function http(pair, endpoint, { token = pair.agentToken, method = 'GET', json } = {}) {
  const response = await fetch(new URL(endpoint, pair.mcpUrl), { method, headers: { Authorization: `Bearer ${token}`, ...(json === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: json === undefined ? undefined : JSON.stringify(json) });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

async function pageHttp(page, endpoint, { token, method = 'GET', json, body, headers = {} } = {}) {
  return page.evaluate(async ({ endpoint, token, method, json, body, headers }) => {
    const response = await fetch(endpoint, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: json === undefined ? body : JSON.stringify(json) });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, body: parsed };
  }, { endpoint, token, method, json, body, headers });
}

try {
  let pairingPostsB = 0;
  for (const label of ['A', 'B']) {
    const sceneId = await createProject(label);
    const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(60000);
    page.on('pageerror', error => evidence.browserErrors.push({ tab: label, message: error.message }));
    page.on('download', () => evidence.downloads++);
    if (label === 'B') page.on('request', request => { if (request.url().endsWith('/agent/sessions') && request.method() === 'POST') pairingPostsB++; });
    await page.goto(`${editorUrl}/#/editor/${sceneId}`, { waitUntil: 'domcontentloaded' });
    await pairPage(page, sceneId, label);
  }
  const [a, b] = pairings;
  assert.notEqual(a.sessionId, b.sessionId);
  assert.notEqual(a.agentToken, b.agentToken);
  assert.notEqual(a.browserToken, b.browserToken);
  for (const own of [a, b]) {
    const listed = await tool(own, 'h3d_sessions_list');
    assert.equal(listed.sessions.length, 1);
    assert.equal(listed.sessions[0].sessionId, own.sessionId);
    assert.equal(listed.sessions[0].connected, true);
  }
  mark('Two real tabs authorize separate pairings; each MCP token lists only its own connected page');

  await tool(a, 'h3d_scene_status', { sessionId: b.sessionId }, 'SESSION_FORBIDDEN');
  await tool(b, 'h3d_scene_status', { sessionId: a.sessionId }, 'SESSION_FORBIDDEN');
  for (const method of ['GET', 'DELETE']) {
    const denied = await http(a, `/agent/sessions/${b.sessionId}`, { method });
    assert.equal(denied.status, 403); assert.equal(denied.body.error.code, 'SESSION_FORBIDDEN');
  }
  mark('Cross-page MCP calls and HTTP session reads/revocation are denied');

  const contents = 'This temporary file belongs only to paired tab B.\n';
  const prepared = await pageHttp(b.page, '/agent/uploads', { token: b.browserToken, method: 'POST', json: { name: 'tab-b.txt', size: Buffer.byteLength(contents), contentType: 'text/plain' } });
  assert.equal(prepared.status, 201);
  const upload = prepared.body;
  assert.equal((await pageHttp(b.page, upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: contents })).status, 200);
  const completed = await pageHttp(b.page, `/agent/uploads/${upload.uploadId}/complete`, { token: b.browserToken, method: 'POST' });
  assert.equal(completed.status, 200);
  const artifact = completed.body; artifacts.push({ pair: b, artifactId: artifact.artifactId });
  assert.deepEqual(await http(b, artifact.url), { status: 200, body: contents });
  for (const endpoint of [`/agent/artifacts/${artifact.artifactId}`, artifact.url]) {
    const denied = await http(a, endpoint); assert.equal(denied.status, 403); assert.equal(denied.body.error.code, 'ARTIFACT_FORBIDDEN');
    const browserDenied = await pageHttp(a.page, endpoint, { token: a.browserToken }); assert.equal(browserDenied.status, 403);
  }
  await tool(a, 'h3d_upload_complete', { uploadId: upload.uploadId }, 'ARTIFACT_FORBIDDEN');
  await tool(a, 'h3d_artifact_release', { artifactId: artifact.artifactId }, 'ARTIFACT_FORBIDDEN');
  await tool(a, 'h3d_import_prepare', { sessionId: a.sessionId, source: { artifactId: artifact.artifactId } }, 'ARTIFACT_FORBIDDEN');
  mark('Tab B uploads real bytes; A agent/browser tokens cannot read metadata, download, finalize, release or import B artifact');

  await a.page.getByRole('button', { name: 'Agent 已连接', exact: true }).click();
  const revoked = a.page.waitForResponse(response => response.url().endsWith(`/agent/sessions/${a.sessionId}`) && response.request().method() === 'DELETE');
  await a.page.getByRole('button', { name: '断开并撤销授权', exact: true }).click();
  assert.equal((await revoked).status(), 200);
  await a.page.getByRole('button', { name: '授权连接此页面', exact: true }).waitFor();
  assert.equal((await http(a, `/agent/sessions/${a.sessionId}`)).status, 401);
  assert.equal((await http(a, '/mcp', { method: 'POST', json: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} } })).status, 401);
  assert.equal((await http(a, `/agent/sessions/${a.sessionId}`, { token: a.browserToken })).status, 401);
  const unaffected = await tool(b, 'h3d_scene_status', { sessionId: b.sessionId });
  assert.equal(unaffected.documentEpoch, b.status.documentEpoch);
  assert.equal((await tool(b, 'h3d_sessions_list')).sessions[0].connected, true);
  await b.page.getByRole('button', { name: 'Agent 已连接', exact: true }).waitFor();
  mark('UI revocation immediately invalidates both A tokens while B stays connected and callable');

  await b.page.reload({ waitUntil: 'domcontentloaded' });
  await b.page.getByRole('button', { name: '连接 Agent', exact: true }).waitFor();
  await poll(() => tool(b, 'h3d_sessions_list'), data => data.sessions[0]?.connected === false, 'Old B session must be offline', 10000);
  const offline = await tool(b, 'h3d_scene_status', { sessionId: b.sessionId }, 'EDITOR_OFFLINE');
  assert.equal(offline.error.outcome, 'not_started');
  assert.equal(pairingPostsB, 1, 'Refreshing must not silently authorize the new document');
  assert.deepEqual(await http(b, artifact.url), { status: 200, body: contents });
  mark('Refresh requires fresh page authorization; old pairing is offline and retains only bridge-local access during the disconnect grace period');

  const fresh = await pairPage(b.page, b.status.sceneId, 'B-refreshed');
  assert.notEqual(fresh.sessionId, b.sessionId);
  assert.notEqual(fresh.agentToken, b.agentToken);
  assert.notEqual(fresh.status.documentEpoch, b.status.documentEpoch);
  assert.equal(pairingPostsB, 2);
  await tool(b, 'h3d_scene_status', { sessionId: fresh.sessionId }, 'SESSION_FORBIDDEN');
  await tool(b, 'h3d_scene_batch', { sessionId: fresh.sessionId, sceneId: fresh.status.sceneId, documentEpoch: fresh.status.documentEpoch, expectedRevision: fresh.status.revision, operationId: crypto.randomUUID(), operations: [{ type: 'create', kind: 'mesh', ref: 'forbidden', name: 'forbidden-old-pairing-write' }] }, 'SESSION_FORBIDDEN');
  assert.equal((await tool(fresh, 'h3d_scene_query', { sessionId: fresh.sessionId, name: 'forbidden-old-pairing-write' })).total, 0);
  assert.equal((await http(fresh, artifact.url)).status, 403, 'New pairing must not inherit old pairing artifacts');
  assert.equal((await tool(fresh, 'h3d_sessions_list')).sessions[0].connected, true);
  mark('Fresh B pairing gets a new session/document epoch; the old token cannot read or mutate it, and old artifacts are not inherited');

  await a.page.goto(`${editorUrl}/#/`, { waitUntil: 'domcontentloaded' });
  const home = await pairPage(a.page, null, 'A-home');
  assert.equal(home.status.sceneId, null, 'Home status must accurately identify no active project');
  const binding = status => ({ sessionId: home.sessionId, sceneId: status.sceneId, documentEpoch: status.documentEpoch, expectedRevision: status.revision, operationId: crypto.randomUUID() });
  const created = await tool(home, 'h3d_project', { ...binding(home.status), action: 'create', name: `MCP首页绑定-${new Date().toISOString()}` });
  assert(created.scene?.id);
  evidence.projects.push({ tab: 'A-home-created', sceneId: created.scene.id });
  const stillHome = await tool(home, 'h3d_scene_status', { sessionId: home.sessionId });
  assert.equal(stillHome.sceneId, null);
  await tool(home, 'h3d_project', { ...binding(stillHome), action: 'open', id: created.scene.id });
  const ready = await poll(() => tool(home, 'h3d_scene_status', { sessionId: home.sessionId }), data => data.sceneId === created.scene.id && data.sceneState === 'ready', 'Home-created project must open');
  mark('Home scene_status null sceneId is accepted by revision-bound MCP project create/open');

  // Hold the target lookup while the human edits the current project. The
  // revision was valid when the call began, even with explicit discard.
  const targetLookup = `**/api/editor3d/scenes/get/${a.status.sceneId}`;
  let reached, resume;
  const waiting = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  await a.page.route(targetLookup, async route => { reached(); await gate; await route.continue(); }, {times:1});
  const racedOpen = tool(home, 'h3d_project', {...binding(ready), action:'open', id:a.status.sceneId, discardChanges:true}, 'REVISION_CONFLICT');
  try {
    await Promise.race([waiting, racedOpen]);
    await a.page.evaluate(async () => {
      const source = await fetch('/src/utils/integration/agentState.ts').then(response => response.text());
      const engineUrl = source.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)[1];
      const {App, SetValueCommand} = await import(engineUrl);
      App.execute(new SetValueCommand(App.scene, 'name', 'human edit during open'));
    });
  } finally { resume(); }
  await racedOpen;
  const edited = await tool(home, 'h3d_scene_status', {sessionId:home.sessionId});
  assert.equal(edited.sceneId, ready.sceneId);
  assert(edited.revision > ready.revision);
  assert.equal(await a.page.evaluate(() => window.viewer.scene.name), 'human edit during open');
  mark('Navigation rejects an intervening human edit during the target lookup');
  const edit = await tool(home, 'h3d_scene_batch', { ...binding(edited), operations: [{ type: 'create', kind: 'mesh', ref: 'preserved', name: 'keep-unsaved-change' }] });
  assert(edit.revision > ready.revision);
  await tool(home, 'h3d_project', { ...binding(ready), action: 'open', id: a.status.sceneId, discardChanges: true }, 'REVISION_CONFLICT');
  const preserved = await tool(home, 'h3d_scene_status', { sessionId: home.sessionId });
  assert.equal(preserved.sceneId, created.scene.id);
  assert.equal(preserved.documentEpoch, ready.documentEpoch);
  assert.equal(preserved.revision, edit.revision);
  assert.equal(preserved.dirty, true);
  assert.equal((await tool(home, 'h3d_scene_query', { sessionId: home.sessionId, name: 'keep-unsaved-change' })).total, 1);
  await tool(home, 'h3d_project', { ...binding(preserved), action: 'open', id: a.status.sceneId, discardChanges: true });
  await poll(() => tool(home, 'h3d_scene_status', { sessionId: home.sessionId }), data => data.sceneId === a.status.sceneId && data.sceneState === 'ready', 'Current revision may explicitly discard and open');
  mark('Stale open with discardChanges:true is rejected without losing unsaved changes; current revision opens successfully');
  assert.equal(evidence.downloads, 0);
  evidence.refresh = { oldSession: b.sessionId, newSession: fresh.sessionId, oldPageError: offline.error.code, ownArtifactAvailableDuringGrace: true };
  evidence.ok = true;
} catch (error) {
  evidence.ok = false; evidence.failure = error.stack || String(error); process.exitCode = 1;
  for (let index = 0; index < pages.length; index++) await pages[index].screenshot({ path: path.join(output, `failure-tab-${index + 1}.png`) }).catch(() => {});
  console.error(error);
} finally {
  for (const item of artifacts) await tool(item.pair, 'h3d_artifact_release', { artifactId: item.artifactId }).catch(() => {});
  for (const pair of pairings) {
    await http(pair, `/agent/sessions/${pair.sessionId}`, { method: 'DELETE' }).catch(() => {});
    await pair.client.close().catch(() => {});
  }
  await browser.close();
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: evidence.ok, checks: evidence.checks.length, projects: evidence.projects, output }));
}
