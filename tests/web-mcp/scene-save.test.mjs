import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const require = createRequire(new URL('../../packages/editor/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../../packages/editor/src/utils/common/saveSceneToService.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;

function setup(options = {}) {
  let info = {id: 'scene1', sceneName: 'Test scene', sceneVersion: 1, zip: 'old/scene.zip', hasDrawing: false,
    coverPicture: options.cover || 'data:image/png;base64,AA=='};
  const initial = structuredClone(info);
  const document = {sceneState: 'ready', sceneId: info.id, documentEpoch: 'first', revision:1, dirty:true, recoveryRequired: false};
  const loading = {loading: false, loadingText: ''};
  const calls = {fetch: [], uploads: [], saves: [], packs: [], disposed: 0};
  let stored = null;
  const App = {project: {getKey: key => key === 'sceneInfo' ? info : key === 'drawing' ? {isUploaded: false} : undefined,
    setKey: (key, value) => { assert.equal(key, 'sceneInfo'); info = value; }}};
  class Package {
    async pack(config) {
      calls.packs.push(config);
      // Deliberately emulate the old SDK side effect to test failure restoration.
      info.zip = ''; info.hasDrawing = true;
      const firstUploadResult = await config.zipUploadFun(new File(['zip'], 'scene.zip'));
      return {firstUploadResult, totalSize: 3, totalZipNumber: 1};
    }
    dispose() { calls.disposed++; }
  }
  const api = {
    async fetchSceneSaveOperation() {
      if (options.operationGate) await options.operationGate;
      return {error: null, data: stored && {...stored, replayed: true}};
    },
    async fetchGetOneScene() { return {error: null, data: {...initial, sceneVersion: options.serverVersion ?? 1}}; },
    async fetchSaveScene(sceneId, scene, expectedVersion, operationId) {
      calls.saves.push({sceneId, scene, expectedVersion, operationId, live: structuredClone(info)});
      stored = {scene: {...scene, id: sceneId}, operationId, expectedVersion, replayed: false};
      options.onCommit?.(document);
      return options.lostResponse ? {error: {code: 'NETWORK', msg: 'response lost'}, data: null} : {error: null, data: stored};
    },
  };
  const dependencies = {
    vue: {nextTick: async () => {}},
    '@astral3d/engine': {App, Package},
    '@/store/modules/globalConfig': {useGlobalConfigStore: () => loading},
    '@/http/api/sys': {fetchUpload: async value => {
      calls.uploads.push(value);
      if (value.file.name === 'scene.zip') options.onZipUpload?.(document);
      if (options.failZip && value.file.name === 'scene.zip') return {error: {msg: 'injected upload failure'}, data: null};
      return {error: null, data: `${value.biz}/${value.file.name}`};
    }},
    '@/utils/common/file': {filterSize: () => '3 B'},
    '@/http/api/scenes': api,
    '@/utils/integration/agentState': {agentState: document, announceAgentState() {}},
    '@/utils/common/constant': {DefaultScreenshot: 'default.png'},
  };
  const exports = {};
  const context = vm.createContext({exports, require: name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, console, crypto: webcrypto, Blob, File, Response,
  window: {$t: value => value, $message: {warning() {}}, viewer: {getViewportImage: async () => ({src: 'data:image/png;base64,AA=='})}},
  fetch: async url => { calls.fetch.push(url); return new Response(new Blob(['png'], {type: 'image/png'})); }});
  new vm.Script(javascript, {filename: 'saveSceneToService.js'}).runInContext(context);
  return {save: exports.saveSceneToService, get info() { return info; }, initial, loading, calls, document, setInfo(value) { info = value; }};
}

test('incomplete, failed and replaced documents cannot upload or advance the persisted version', async () => {
  for (const state of [{sceneState:'failed'}, {sceneState:'loading'}, {sceneId:'another'}, {recoveryRequired:true}]) {
    const fixture = setup();
    Object.assign(fixture.document, state);
    await assert.rejects(fixture.save(), /重新加载/);
    assert.equal(fixture.calls.uploads.length, 0);
    assert.equal(fixture.calls.saves.length, 0);
  }
  let release;
  const fixture = setup({operationGate: new Promise(resolve => { release = resolve; })});
  const pending = fixture.save();
  fixture.document.documentEpoch = 'reopened-same-scene';
  release();
  await assert.rejects(pending, /changed during save/);
  assert.equal(fixture.calls.uploads.length, 0);
  assert.equal(fixture.calls.saves.length, 0);
});

test('cover data/blob/http URLs are fetched directly and relative covers use the static route', async () => {
  for (const [cover, expected] of [['data:image/png;base64,AA==', 'data:image/png;base64,AA=='], ['blob:local-cover', 'blob:local-cover'],
    ['https://assets.example/cover.png', 'https://assets.example/cover.png'], ['covers/a.png', '/file/static/covers/a.png']]) {
    const fixture = setup({cover});
    await fixture.save({operationId: 'op-cover', expectedVersion: 1});
    assert.equal(fixture.calls.fetch[0], expected);
    assert.equal(fixture.calls.packs[0].sceneInfo.sceneVersion, 2);
    assert.equal(fixture.calls.packs[0].name, 'scene1');
    assert.equal(fixture.calls.packs[0].sceneInfo.sceneName, 'Test scene');
    assert.equal(fixture.calls.saves[0].live.sceneVersion, 1, 'Publish metadata only after a confirmed commit');
    assert.equal(fixture.calls.saves[0].live.zip, fixture.initial.zip);
    assert.equal(fixture.calls.saves[0].live.coverPicture, fixture.initial.coverPicture);
    assert.match(fixture.calls.uploads[0].biz, /scene1-V2-op-cover-[a-f0-9-]+$/);
    assert.equal(fixture.info.sceneVersion, 2);
  }
});

test('failed packing restores all Package metadata side effects and leaves authoring version/cover intact', async () => {
  const fixture = setup({failZip: true});
  await assert.rejects(fixture.save({operationId: 'op-failed', expectedVersion: 1}), /injected upload failure/);
  assert.deepEqual(fixture.info, fixture.initial);
  assert.equal(fixture.calls.saves.length, 0);
  assert.equal(fixture.loading.loading, false);
  assert.equal(fixture.calls.disposed, 1);
});

test('a lost commit response is recovered from the durable receipt without another upload or version increment', async () => {
  const fixture = setup({lostResponse: true});
  const result = await fixture.save({operationId: 'op-retry', expectedVersion: 1});
  assert.equal(result.sceneVersion, 2);
  assert.equal(fixture.document.dirty, false);
  fixture.document.dirty = true;
  fixture.document.revision++;
  fixture.document.documentEpoch = 'reopened';
  assert.equal(fixture.calls.uploads.length, 2);
  fixture.setInfo({...fixture.info, sceneVersion: 5, zip: 'newer.zip'});
  const replay = await fixture.save({operationId: 'op-retry', expectedVersion: 1});
  assert.equal(replay.sceneVersion, 2);
  assert.equal(fixture.info.sceneVersion, 5, 'A historical receipt must not rewind the authoring scene');
  assert.equal(fixture.info.zip, 'newer.zip');
  assert.equal(fixture.document.dirty, true, 'A historical receipt cannot acknowledge unsaved edits');
  assert.equal(fixture.calls.uploads.length, 2);
  assert.equal(fixture.calls.saves.length, 1);
});

test('same-operation calls share work, while a different concurrent operation is explicitly rejected', async () => {
  let release;
  const fixture = setup({operationGate: new Promise(resolve => { release = resolve; })});
  const first = fixture.save({operationId: 'op-one', expectedVersion: 1});
  const duplicate = fixture.save({operationId: 'op-one', expectedVersion: 1});
  assert.equal(first, duplicate);
  await assert.rejects(fixture.save({operationId: 'op-two', expectedVersion: 1}), /Another save operation/);
  release();
  await first;
  assert.equal(fixture.calls.saves.length, 1);
});

test('an edit during package upload prevents committing a mixed-revision archive', async () => {
  const fixture = setup({onZipUpload: document => { document.revision++; }});
  await assert.rejects(fixture.save(), {code:409});
  assert.equal(fixture.calls.saves.length, 0);
  assert.deepEqual(fixture.info, fixture.initial);
  assert.equal(fixture.document.dirty, true);
});

test('an edit after the commit request keeps its dirty flag and advances the saved base version', async () => {
  const fixture = setup({onCommit: document => { document.revision++; }});
  await fixture.save();
  assert.equal(fixture.calls.saves.length, 1);
  assert.equal(fixture.info.sceneVersion, 2);
  assert.equal(fixture.document.dirty, true);
});

test('a stale server version fails before uploads and preserves authoring metadata', async () => {
  const fixture = setup({serverVersion: 2});
  await assert.rejects(fixture.save({operationId: 'op-stale', expectedVersion: 1}), /version conflict/);
  assert.deepEqual(fixture.info, fixture.initial);
  assert.equal(fixture.calls.uploads.length, 0);
});
