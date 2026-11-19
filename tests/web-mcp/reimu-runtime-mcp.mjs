// Live acceptance against an existing Reimu shrine. All scene reads and Play controls use public MCP tools.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { analyzeReimuRuntime } from './reimu-runtime-analysis.mjs';

const require = createRequire(import.meta.url);
const bridgeRequire = createRequire(new URL('../../packages/mcp-bridge/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StreamableHTTPClientTransport } = await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const sceneId = process.env.SCENE_ID || '4472ab06c54f8f7a93635f28e75915c1';
const url = (process.env.EDITOR_URL || 'https://localhost:8090') + '/#/editor/' + encodeURIComponent(sceneId);
const output = path.resolve('.git/codex-runtime/reimu-runtime-mcp');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, acceptDownloads: false });
const client = new Client({ name: 'h3d-runtime-observation-acceptance', version: '1' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { url, ok: false, errors };
let pairing, started = false;

async function call(name, args = {}, expectedError) {
  const result = await client.callTool({ name, arguments: { sessionId: pairing.sessionId, ...args } });
  const value = result.structuredContent ?? JSON.parse(result.content[0].text);
  if (expectedError) {
    assert.ok(result.isError, name + ' must reject');
    assert.equal(value.error.code, expectedError);
  } else {
    assert.ok(!result.isError, name + ': ' + JSON.stringify(value.error));
  }
  return value;
}

async function play(action) {
  const { documentEpoch, revision } = await call('h3d_scene_status');
  return call('h3d_play', { sceneId, documentEpoch, expectedRevision: revision, operationId: crypto.randomUUID(), action });
}

async function poll(read, accepts) {
  const deadline = Date.now() + 90000;
  do {
    const value = await read();
    if (accepts(value)) return value;
    await delay(150);
  } while (Date.now() < deadline);
  throw Error('Timed out waiting for the paired editor or preview');
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '连接 Agent', exact: true }).click();
  const created = page.waitForResponse(r => r.url().endsWith('/agent/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '授权连接此页面', exact: true }).click();
  const response = await created;
  assert.equal(response.status(), 201);
  pairing = await response.json();
  await client.connect(new StreamableHTTPClientTransport(new URL(pairing.mcpUrl), {
    requestInit: { headers: { Authorization: 'Bearer ' + pairing.agentToken } },
  }));
  await page.getByRole('button', { name: 'Agent 已连接', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const { tools } = await client.listTools();
  for (const name of ['h3d_runtime_scene_query', 'h3d_runtime_sample']) {
    assert.equal(tools.find(tool => tool.name === name)?.annotations.readOnlyHint, true);
  }
  const before = await poll(() => call('h3d_scene_status'), status => status.sceneId === sceneId && status.sceneState === 'ready');
  await call('h3d_runtime_scene_query', {}, 'RUNTIME_NOT_RUNNING');
  await play('start');
  started = true;
  const { runId } = await poll(() => call('h3d_play', { action: 'status' }), status => {
    assert.notEqual(status.state, 'failed', status.error);
    return status.state === 'running';
  });
  const objects = [];
  let offset = 0;
  do {
    const tree = await call('h3d_runtime_scene_query', { runId, offset, limit: 20 });
    assert.equal(tree.runId, runId);
    objects.push(...tree.items);
    offset = tree.nextOffset;
  } while (offset !== null);
  assert.equal(new Set(objects.map(object => object.uuid)).size, objects.length);
  const byName = name => {
    const matches = objects.filter(object => object.name === name);
    assert.equal(matches.length, 1, name);
    return matches[0];
  };
  const actor = byName('Reimu'), sprite = byName('ReimuSprite'), water = byName('手水｜细波 GLSL');
  const children = await call('h3d_runtime_scene_query', { runId, parentUuid: actor.uuid });
  assert.ok(children.items.some(object => object.uuid === sprite.uuid));
  const leaves = objects.filter(object => /^FallingLeaf_/.test(object.name));
  assert.equal(leaves.length, 5);
  const uuids = [actor, sprite, byName('ReimuShadow'), water, ...leaves].map(object => object.uuid);
  await call('h3d_runtime_sample', { uuids, runId: crypto.randomUUID() }, 'STALE_RUN');
  const once = await call('h3d_runtime_sample', { runId, uuids: [actor.uuid], fields: ['transform'] });
  assert.equal(once.samples.length, 1);
  assert.ok(!('materials' in once.samples[0].objects[0]));
  const samples = [];
  for (let window = 0; window < 3; window++) {
    const series = await call('h3d_runtime_sample', {
      runId, uuids, count: 32, intervalMs: 200, materialProperties: ['opacity'], uniformNames: ['time'],
    });
    assert.equal(series.runId, runId);
    assert.equal(series.samples.length, 32);
    samples.push(...series.samples);
  }
  await writeFile(path.join(output, 'mcp-samples.json'), JSON.stringify({ sceneId, runId, samples }));
  const analysis = analyzeReimuRuntime({ runId, samples: samples.map(sample => ({
    elapsedMs: sample.timestampMs - samples[0].timestampMs,
    objects: sample.objects.map(object => ({ ...object, materials: object.materials?.map(slot => ({ ...slot, opacity: slot.parameters.opacity })) })),
  })) });
  await writeFile(path.join(output, 'analysis.json'), JSON.stringify(analysis, null, 2));
  assert.equal(analysis.verdict, 'pass', JSON.stringify(analysis.requiredAssertions.filter(item => item.status !== 'pass')));
  const waterTimes = samples.map(sample => sample.objects.find(o => o.uuid === water.uuid).materials[0].uniforms.time);
  assert.ok(waterTimes.every(Number.isFinite) && waterTimes.at(-1) > waterTimes[0]);
  await play('stop');
  started = false;
  await call('h3d_runtime_sample', { uuids: [actor.uuid] }, 'RUNTIME_NOT_RUNNING');
  const after = await call('h3d_scene_status');
  for (const key of ['revision', 'dirty', 'sceneVersion', 'documentEpoch']) assert.equal(after[key], before[key], key);
  assert.deepEqual(errors, []);
  Object.assign(report, { ok: true, runId, treeSize: objects.length, sceneVersion: after.sceneVersion,
    samples: samples.length, durationMs: analysis.metrics.sampling.durationMs,
    atlasStates: analysis.metrics.sprite.distinctActualUvMapOrFrameUniformStates, movingLeaves: analysis.metrics.leaves.movingCount,
    horizontalRange: analysis.metrics.actor.horizontalDiameterXZ, hopHeight: analysis.metrics.actor.y.span,
    shadowOpacity: analysis.metrics.shadow.materialSlot0Opacity, waterTime: [waterTimes[0], waterTimes.at(-1)] });
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  if (started) await play('stop').catch(() => {});
  await client.close().catch(() => {});
  if (pairing) await fetch(new URL('/agent/sessions/' + pairing.sessionId, pairing.mcpUrl), {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + pairing.agentToken },
  }).catch(() => {});
  await browser.close();
  await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
