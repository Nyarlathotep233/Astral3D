// Prepared harness: run explicitly only after other acceptance checks finish.
// CODEX_SCENE_PROMPT: UTF-8 prompt file; CODEX_SCENE_CASE: safe output directory name.
// SCENE_ID optionally refines an existing dedicated acceptance project.
// CODEX_RUNTIME_SAMPLE_JS optionally names a UTF-8 file containing a read-only
// function expression ({viewer,scene,frameWindow,elapsedMs}) => JSON data.
// The optional function augments the built-in sampler; it does not replace it.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { once } from 'node:events';
import path from 'node:path';

const require = createRequire(import.meta.url);
const bridgeRequire = createRequire(new URL('../../packages/mcp-bridge/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StreamableHTTPClientTransport } = await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
assert(process.env.CODEX_SCENE_PROMPT, 'Set CODEX_SCENE_PROMPT to an authorized scene prompt text file');
const scenePrompt = await readFile(path.resolve(process.env.CODEX_SCENE_PROMPT), 'utf8');
assert(scenePrompt.trim(), 'Scene prompt must not be empty');
const caseName = process.env.CODEX_SCENE_CASE || 'codex-scene';
assert(/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(caseName), 'CODEX_SCENE_CASE must be a simple directory name');
const output = path.resolve('.git/codex-runtime', caseName);
await mkdir(output, { recursive: true });
const editorUrl = process.env.EDITOR_URL || 'https://localhost:8090';
const apiUrl = process.env.API_URL || 'http://127.0.0.1:8080/api';
const sampleSource = process.env.CODEX_RUNTIME_SAMPLE_JS ? await readFile(path.resolve(process.env.CODEX_RUNTIME_SAMPLE_JS), 'utf8') : '';
const integer = (key, fallback, min, max) => { const value = Number(process.env[key] ?? fallback); assert(Number.isInteger(value) && value >= min && value <= max, `${key} must be ${min}..${max}`); return value; };
const minimumObjects = integer('CODEX_SCENE_MIN_OBJECTS', 10, 1, 100000);
const minimumAdded = integer('CODEX_SCENE_MIN_ADDED', process.env.SCENE_ID ? 0 : 10, 0, 100000);
const minimumScripts = integer('CODEX_SCENE_MIN_SCRIPTS', 1, 0, 100000);
const minimumShaders = integer('CODEX_SCENE_MIN_SHADERS', 1, 0, 100000);
const durationMs = integer('CODEX_RUNTIME_SAMPLE_MS', 16000, 15000, 300000);
const intervalMs = integer('CODEX_RUNTIME_SAMPLE_INTERVAL_MS', 500, 100, 5000);
const codexTimeoutMs = integer('CODEX_SCENE_TIMEOUT_MS', 60 * 60 * 1000, 60000, 12 * 60 * 60 * 1000);
const names = key => (process.env[key] || '').split(',').map(value => value.trim()).filter(Boolean);
const requiredMotion = names('CODEX_RUNTIME_REQUIRED_MOTION');
const requiredUv = names('CODEX_RUNTIME_REQUIRED_UV');
const requiredShadow = names('CODEX_RUNTIME_REQUIRED_SHADOW');
const namePattern = process.env.CODEX_RUNTIME_NAME_PATTERN || 'Reimu|Falling.?Leaf|Falling.?Leaves|Leaf|Leaves|Shadow|Sprite|灵梦|落叶';
new RegExp(namePattern, 'i');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const evidence = { case: caseName, startedAt: new Date().toISOString(), checks: [], browserErrors: [], downloads: 0, codex: { events: 0, tools: {}, violations: [], omittedOversizeEvents: 0 } };
const mark = message => { evidence.checks.push(message); console.log(message); };
let browser, page, client, pairing, child, sceneId = process.env.SCENE_ID || '', runtimeStarted = false;
const allPairings = [];

async function call(name, args = {}) {
  const local = ['h3d_sessions_list', 'h3d_capabilities', 'h3d_help', 'h3d_artifact_release'].includes(name) || name.startsWith('h3d_upload');
  const result = await client.callTool({ name, arguments: { ...(local ? {} : { sessionId: pairing.sessionId }), ...args } }, undefined, { timeout: 180000 });
  const data = result.structuredContent || JSON.parse(result.content.find(item => item.type === 'text').text);
  assert(!result.isError, `${name}: ${JSON.stringify(data)}`);
  return data;
}
async function poll(action, predicate, label, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs; let last;
  while (Date.now() < end) { last = await action(); if (predicate(last)) return last; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(`${label}: ${JSON.stringify(last)}`);
}
async function connect() {
  await page.getByRole('button', { name: '连接 Agent', exact: true }).click();
  const response = page.waitForResponse(item => item.url().endsWith('/agent/sessions') && item.request().method() === 'POST');
  await page.getByRole('button', { name: '授权连接此页面', exact: true }).click();
  const created = await response; assert.equal(created.status(), 201);
  pairing = await created.json(); allPairings.push(pairing);
  client = new Client({ name: `h3d-codex-scene-${caseName}`, version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(pairing.mcpUrl), { requestInit: { headers: { Authorization: `Bearer ${pairing.agentToken}` } } }));
  await page.getByRole('button', { name: 'Agent 已连接', exact: true }).waitFor(); await page.keyboard.press('Escape');
  await poll(() => call('h3d_sessions_list'), data => data.sessions[0]?.connected && data.sessions[0]?.sceneId === sceneId && data.sessions[0]?.sceneState === 'ready', 'Editor must be ready');
}
async function binding() { const status = await call('h3d_scene_status'); return { sceneId: status.sceneId, documentEpoch: status.documentEpoch, expectedRevision: status.revision, operationId: crypto.randomUUID() }; }
async function inventory() {
  const objects = []; let offset = 0, total;
  do {
    const result = await call('h3d_scene_query', { offset, limit: 100 });
    total ??= result.total; assert.equal(result.total, total, 'Object count changed during persistence inspection');
    objects.push(...result.items); offset = result.nextOffset;
  } while (offset !== null);
  const scripts = [], shaders = [];
  for (let index = 0; index < objects.length; index += 10) {
    const details = await call('h3d_object_details', { uuids: objects.slice(index, index + 10).map(item => item.uuid), includeScripts: true, includeShaderSource: true });
    for (const object of details) {
      for (const [slot, script] of (object.scripts || []).entries()) scripts.push({ objectUuid: object.uuid, objectName: object.name, slot, name: script.name, sourceBytes: Buffer.byteLength(script.source || ''), sha256: hash(script) });
      for (const material of object.materials || []) if (['ShaderMaterial', 'RawShaderMaterial'].includes(material.type)) {
        assert(material.vertexShader && material.fragmentShader, `Shader source is missing on ${object.name}`);
        shaders.push({ objectUuid: object.uuid, objectName: object.name, slot: material.slot, type: material.type, sha256: hash({ vertexShader: material.vertexShader, fragmentShader: material.fragmentShader, uniforms: material.uniforms, defines: material.defines, glslVersion: material.glslVersion }) });
      }
    }
  }
  const sort = items => items.sort((left, right) => `${left.objectUuid}:${left.slot}`.localeCompare(`${right.objectUuid}:${right.slot}`));
  return { count: total, objectUuids: objects.map(item => item.uuid).sort(), scripts: sort(scripts), shaders: sort(shaders) };
}
async function capture(filename, target = 'editor') {
  const result = await call('h3d_viewport_capture', { target, width: 1440, height: 900 });
  assert(result.url && result.artifactId, 'Capture must expose an authorized binary artifact');
  const response = await fetch(new URL(result.url, pairing.mcpUrl), { headers: { Authorization: `Bearer ${pairing.agentToken}` } });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert(bytes.length > 100, 'Capture is empty');
  await writeFile(path.join(output, filename), bytes);
  await call('h3d_artifact_release', { artifactId: result.artifactId });
  return { filename, target, bytes: bytes.length, width: result.width, height: result.height, sha256: hash(bytes) };
}

// Keep event metadata and short text, never megabytes of image/base64 tool output.
function compact(value, depth = 0) {
  if (depth > 7) return '[nested content omitted]';
  if (typeof value === 'string') {
    const safe = pairing ? value.replaceAll(pairing.agentToken, '[token omitted]').replaceAll(pairing.browserToken, '[token omitted]') : value;
    return safe.startsWith('data:image/') ? `[image omitted: ${safe.length} chars]` : safe.length > 3000 ? `${safe.slice(0, 3000)}…[${safe.length} chars]` : safe;
  }
  if (Array.isArray(value)) return value.slice(0, 30).map(item => compact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(data|base64|image_url)$/i.test(key) ? '[binary omitted]' : compact(item, depth + 1)]));
}
async function runCodex(prompt) {
  const transcript = createWriteStream(path.join(output, 'codex-events.compact.jsonl'));
  const journal = createWriteStream(path.join(output, 'authoring-journal.jsonl'));
  const stderr = createWriteStream(path.join(output, 'codex-stderr.compact.log'));
  let transcriptError; for (const stream of [transcript, journal, stderr]) stream.on('error', error => { transcriptError = error; });
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--json', '--approve-for-me', '-c', `mcp_servers.h3d.url="${pairing.mcpUrl}"`, '-c', 'mcp_servers.h3d.bearer_token_env_var="H3D_AGENT_TOKEN"', '-c', 'mcp_servers.h3d.tool_timeout_sec=180', '-'];
  if (process.env.CODEX_SCENE_REFERENCE_IMAGE) args.splice(1, 0, '--image', path.resolve(process.env.CODEX_SCENE_REFERENCE_IMAGE));
  child = spawn(process.env.CODEX_BINARY || 'codex', args, { cwd: process.cwd(), env: { ...process.env, H3D_AGENT_TOKEN: pairing.agentToken }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const decoder = new StringDecoder('utf8'); let pending = '', skipping = false, stderrBytes = 0;
  function line(text) {
    if (!text.trim()) return;
    let event; try { event = JSON.parse(text); } catch { transcript.write(JSON.stringify({ type: 'unparsed', text: compact(text) }) + '\n'); return; }
    evidence.codex.events++;
    const item = event.item || {};
    if (event.type === 'item.completed' && item.type === 'mcp_tool_call') {
      const key = `${item.server || '?'}:${item.tool || item.name || '?'}`;
      evidence.codex.tools[key] = (evidence.codex.tools[key] || 0) + 1;
      if (item.server && item.server !== 'h3d') evidence.codex.violations.push({ type: item.type, server: item.server, tool: item.tool });
      if (item.server === 'h3d' && ['h3d_scene_batch','h3d_history','h3d_project'].includes(item.tool)) {
        // Keep complete scene edits (including shader/script and pixel data),
        // separate from the compact log. This journal has no image tool output.
        journal.write(JSON.stringify({tool:item.tool,arguments:item.arguments,result:item.result,error:item.error})
          .replaceAll(pairing.agentToken,'[token omitted]').replaceAll(pairing.browserToken,'[token omitted]')+'\n');
      }
    }
    if (event.type === 'item.completed' && ['command_execution', 'file_change', 'web_search', 'image_generation'].includes(item.type)) evidence.codex.violations.push({ type: item.type });
    transcript.write(JSON.stringify(compact(event)) + '\n');
  }
  child.stdout.on('data', chunk => {
    let decoded = decoder.write(chunk);
    if (skipping) { const end = decoded.indexOf('\n'); if (end < 0) return; decoded = decoded.slice(end + 1); skipping = false; }
    pending += decoded;
    let end; while ((end = pending.indexOf('\n')) >= 0) { const next = pending.slice(0, end); pending = pending.slice(end + 1); if (next.length <= 32 * 1024 * 1024) line(next); else { evidence.codex.omittedOversizeEvents++; transcript.write('{"type":"oversize-event-omitted"}\n'); } }
    if (pending.length > 32 * 1024 * 1024) { pending = ''; skipping = true; evidence.codex.omittedOversizeEvents++; transcript.write('{"type":"oversize-event-omitted"}\n'); }
  });
  child.stderr.on('data', chunk => { if (stderrBytes >= 128 * 1024) return; const text = compact(chunk.toString('utf8')); stderrBytes += Buffer.byteLength(text); stderr.write(text); });
  child.stdin.on('error', () => {}); child.stdin.end(prompt);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child?.kill(); }, codexTimeoutMs); timeout.unref();
  let exitCode;
  try { [exitCode] = await once(child, 'close'); }
  finally {
    clearTimeout(timeout); pending += decoder.end(); if (pending && !skipping) line(pending);
    await Promise.all([transcript,journal,stderr].map(stream=>new Promise(resolve=>stream.end(resolve)))); child = undefined;
  }
  evidence.codex.exitCode = exitCode; evidence.codex.timedOut = timedOut;
  if (transcriptError) throw transcriptError;
  assert(!timedOut, 'Codex scene authoring exceeded the configured timeout');
  assert.equal(exitCode, 0, 'Codex child did not finish successfully');
  assert.equal(evidence.codex.violations.length, 0, 'Codex used a tool outside the authorized h3d MCP scope');
  assert(Object.values(evidence.codex.tools).reduce((sum, count) => sum + count, 0) > 0, 'No completed real MCP tool calls were observed');
}

async function sampleRuntime(elapsedMs) {
  return page.evaluate(({ elapsedMs, namePattern, sampleSource }) => {
    const frameWindow = document.querySelector('.play-mode-runtime iframe')?.contentWindow;
    const viewer = frameWindow?.viewer, scene = viewer?.scene;
    if (!scene) throw new Error('Actual preview iframe scene is unavailable');
    const pattern = new RegExp(namePattern, 'i'), objects = [];
    const round = value => Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : null;
    const vector = value => value?.toArray?.().map(round) || null;
    const frameValues = value => Object.fromEntries(Object.entries(value || {}).filter(([key, data]) => /frame|sprite|animationState/i.test(key) && ['number', 'string', 'boolean'].includes(typeof data)).slice(0, 20));
    scene.traverse(object => {
      if (!pattern.test(object.name) || objects.length >= 200) return;
      const materials = (Array.isArray(object.material) ? object.material : object.material ? [object.material] : []).map(material => ({
        opacity: round(material.opacity), frame: frameValues(material.userData),
        maps: ['map', 'alphaMap'].filter(key => material[key]).map(key => ({ key, offset: vector(material[key].offset), repeat: vector(material[key].repeat), rotation: round(material[key].rotation), frame: frameValues(material[key].userData) })),
        frameUniforms: Object.fromEntries(Object.entries(material.uniforms || {}).filter(([key]) => /frame|uvOffset|uvRepeat|spriteIndex/i.test(key)).map(([key, entry]) => [key, typeof entry.value === 'number' ? round(entry.value) : vector(entry.value)])),
      }));
      objects.push({ uuid: object.uuid, name: object.name, visible: object.visible,
        position: vector(object.position), worldPosition: vector(object.getWorldPosition(object.position.clone())),
        scale: vector(object.scale), worldScale: vector(object.getWorldScale(object.scale.clone())),
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(round),
        uv: Array.from(object.geometry?.attributes?.uv?.array || []).slice(0, 24).map(round), frame: frameValues(object.userData), materials });
    });
    const custom = sampleSource ? new Function(`return (${sampleSource});`)()({ viewer, scene, frameWindow, elapsedMs }) : undefined;
    if (custom && typeof custom.then === 'function') throw new Error('Runtime sampler must be a synchronous read-only function');
    const result = { elapsedMs, capturedAt: new Date().toISOString(), objects, ...(custom === undefined ? {} : { custom }) };
    if (JSON.stringify(result).length > 1024 * 1024) throw new Error('Runtime sample exceeds 1 MiB');
    return result;
  }, { elapsedMs, namePattern, sampleSource });
}
function summarizeMotion(samples) {
  const tracks = new Map();
  for (const sample of samples) for (const object of sample.objects) { if (!tracks.has(object.uuid)) tracks.set(object.uuid, []); tracks.get(object.uuid).push(object); }
  const changed = (track, select) => new Set(track.map(value => canonical(select(value)))).size > 1;
  const summary = [...tracks.values()].map(track => ({ name: track[0].name, uuid: track[0].uuid, samples: track.length,
    positionChanged: changed(track, item => item.worldPosition), scaleChanged: changed(track, item => item.worldScale),
    opacityChanged: changed(track, item => item.materials.map(material => material.opacity)),
    uvOrFrameChanged: changed(track, item => ({ uv: item.uv, frame: item.frame, materials: item.materials.map(({ maps, frame, frameUniforms }) => ({ maps, frame, frameUniforms })) })),
  }));
  const check = (required, predicate, description) => { for (const name of required) assert(summary.some(item => item.name.includes(name) && item.samples >= 2 && predicate(item)), `${description} not observed for name containing ${name}`); };
  check(requiredMotion, item => item.positionChanged, 'World-position motion');
  check(requiredUv, item => item.uvOrFrameChanged, 'UV/frame animation');
  check(requiredShadow, item => item.scaleChanged && item.opacityChanged, 'Both shadow scale and opacity changes');
  return summary;
}

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1050 }, acceptDownloads: false });
  page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', error => { if (evidence.browserErrors.length < 100) evidence.browserErrors.push(error.message.slice(0, 2000)); });
  page.on('download', () => evidence.downloads++);
  if (!sceneId) {
    const response = await fetch(`${apiUrl}/editor3d/scenes/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '', sceneName: `Codex-${caseName}-${new Date().toISOString()}`, sceneType: '其他', sceneIntroduction: 'Dedicated real Codex MCP scene acceptance project', sceneVersion: 1, zip: '', coverPicture: '', hasDrawing: 0, projectType: 0 }) });
    const data = await response.json(); assert(response.ok && data.code === 200 && data.result?.id, JSON.stringify(data)); sceneId = data.result.id;
  }
  evidence.sceneId = sceneId; evidence.projectUrl = `${editorUrl}/#/editor/${sceneId}`;
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
  await page.goto(evidence.projectUrl, { waitUntil: 'domcontentloaded' }); await connect();
  const before = await call('h3d_scene_status'); evidence.before = { version: before.sceneVersion, objects: (await call('h3d_scene_query', { limit: 1 })).total };
  const prompt = `You are performing an authorized acceptance test in the paired H3D scene ${sceneId}. Use ONLY h3d MCP tools. Do not use shell, filesystem tools, browser tools, external connectors, source edits, project deletion, or UI downloads. Do not change global configuration. Read h3d_help and h3d_capabilities first. Every write must use the latest sceneId/documentEpoch/expectedRevision and a unique operationId. After an unknown result inspect its operation status before retrying. Build or refine this same scene, use actual supported WebGL features, inspect diagnostics, correct faults, and explicitly save the final result. Stop preview before finishing. The final scene must have at least ${minimumObjects} objects and add at least ${minimumAdded} objects relative to the current scene, with at least ${minimumScripts} script(s) and ${minimumShaders} custom GLSL shader material assignment(s). Do not merely describe work or claim success without tool results.\n\nSCENE REQUEST:\n${scenePrompt}`;
  await writeFile(path.join(output, 'prompt.txt'), prompt);
  evidence.promptSha256 = hash(prompt); mark('Authorized dedicated scene paired; starting the real Codex MCP client');
  await runCodex(prompt);
  // Keep a recoverable authoring snapshot even if a later save/reload assertion
  // fails. It is read-only inspection, not an alternative authoring path.
  try {
    const snapshot = await page.evaluate(async () => {
      const source=await fetch('/src/utils/integration/agentMaterials.ts').then(response=>response.text());
      const enginePath=source.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)?.[1];
      if(!enginePath)throw Error('Unable to locate the loaded SDK module');
      const { App } = await import(enginePath);
      return { ...App.scene.toJSON(), scripts: JSON.parse(JSON.stringify(App.scripts)), h3dSceneInfo: JSON.parse(JSON.stringify(App.project.getKey('sceneInfo'))) };
    });
    await writeFile(path.join(output, 'authoring-snapshot.json'), JSON.stringify(snapshot));
  } catch (error) { evidence.snapshotError = error.message || String(error); }
  const authored = await call('h3d_scene_status'); assert.equal(authored.sceneId, sceneId, 'Codex must author the specified scene');
  assert(Number(authored.sceneVersion) > Number(evidence.before.version), 'Codex must persist a newer project version');
  assert.equal(authored.dirty, false, 'Codex must leave the final scene saved');
  const play = await call('h3d_play', { action: 'status' }); if (play.state !== 'idle') await call('h3d_play', { ...await binding(), action: 'stop' });
  const saved = await inventory(); assert(saved.count >= minimumObjects && saved.count >= evidence.before.objects + minimumAdded, 'Codex did not satisfy the actual object-count minimum');
  assert(saved.scripts.length >= minimumScripts, 'Required scripts were not authored'); assert(saved.shaders.length >= minimumShaders, 'Required custom shader materials were not authored');
  evidence.authored = { version: authored.sceneVersion, objects: saved.count, scriptCount: saved.scripts.length, shaderCount: saved.shaders.length };
  await writeFile(path.join(output, 'persistence-before.json'), JSON.stringify(saved, null, 2));
  evidence.authoringCapture = await capture('authoring.png'); await page.screenshot({ path: path.join(output, 'authoring-editor.png') });
  mark('Codex authored and explicitly saved real objects, scripts and custom shader materials');
  await client.close(); client = undefined; await page.reload({ waitUntil: 'domcontentloaded' }); await connect();
  const reloadedStatus = await call('h3d_scene_status'), reloaded = await inventory();
  assert.equal(reloadedStatus.sceneVersion, authored.sceneVersion); assert.deepEqual(reloaded, saved, 'Objects, full script data and shader sources/uniforms must survive server reload');
  await writeFile(path.join(output, 'persistence-after.json'), JSON.stringify(reloaded, null, 2));
  mark('Reload/re-pair preserves the persisted version, all object identities, script data and shader data');
  const diagnosticsBefore = await call('h3d_diagnostics', { limit: 1 });
  await call('h3d_play', { ...await binding(), action: 'start' }); runtimeStarted = true;
  const running = await poll(() => call('h3d_play', { action: 'status' }), status => { if (['failed', 'unresponsive'].includes(status.state)) throw new Error(`Runtime failed: ${JSON.stringify(status)}`); return status.state === 'running'; }, 'Preview must really run', 240000);
  evidence.runtime = { runId: running.runId, samples: [], captures: [] };
  evidence.runtime.captures.push(await capture('runtime-start.png', 'runtime'));
  const started = performance.now(); let capturedMiddle = false;
  while (true) {
    const elapsed = Math.round(performance.now() - started);
    evidence.runtime.samples.push(await sampleRuntime(elapsed));
    if (!capturedMiddle && elapsed >= durationMs / 2) { evidence.runtime.captures.push(await capture('runtime-middle.png', 'runtime')); capturedMiddle = true; }
    if (elapsed - evidence.runtime.samples[0].elapsedMs >= durationMs) break;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  assert(evidence.runtime.samples.length >= 3 && evidence.runtime.samples.at(-1).elapsedMs - evidence.runtime.samples[0].elapsedMs >= 15000, 'Motion evidence must span at least 15 seconds');
  evidence.runtime.captures.push(await capture('runtime-end.png', 'runtime'));
  const finalRuntime = await call('h3d_play', { action: 'status' }); assert.equal(finalRuntime.state, 'running');
  evidence.runtime.motion = summarizeMotion(evidence.runtime.samples);
  evidence.runtime.diagnostics = await call('h3d_diagnostics', { after: diagnosticsBefore.latestCursor, runId: running.runId, severity: 'error', limit: 100 });
  assert.equal(evidence.runtime.diagnostics.items.length, 0, 'Runtime reported errors during independent validation');
  await call('h3d_play', { ...await binding(), action: 'stop' }); runtimeStarted = false;
  assert.equal((await call('h3d_play', { action: 'status' })).state, 'idle');
  mark('Reloaded scene runs in the actual iframe; captures and at least 15 seconds of object/UV/shadow samples collected, then preview stopped');
  evidence.finalStatus = await call('h3d_scene_status'); assert.equal(evidence.downloads, 0, 'No UI downloads are permitted');
  evidence.ok = true;
} catch (error) {
  evidence.ok = false; evidence.failure = error.stack || String(error); process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  console.error(error.message || String(error));
} finally {
  if (child) child.kill();
  if (runtimeStarted && client) await call('h3d_play', { ...await binding().catch(() => ({})), action: 'stop' }).catch(() => {});
  await client?.close().catch(() => {});
  for (const pair of allPairings) await fetch(new URL(`/agent/sessions/${pair.sessionId}`, pair.mcpUrl), { method: 'DELETE', headers: { Authorization: `Bearer ${pair.agentToken}` } }).catch(() => {});
  await browser?.close(); evidence.finishedAt = new Date().toISOString();
  if (evidence.runtime?.samples) {
    await writeFile(path.join(output, 'runtime-samples.json'), JSON.stringify(evidence.runtime, null, 2));
    evidence.runtime = { ...evidence.runtime, samples: undefined, sampleCount: evidence.runtime.samples.length, samplesFile: 'runtime-samples.json' };
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: evidence.ok, sceneId, checks: evidence.checks.length, output }));
}
