import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../../packages/desktop/node_modules/esbuild/lib/main.js';
import * as THREE from '../../packages/editor/node_modules/three/build/three.module.js';
import JSZip from '../../packages/editor/node_modules/jszip/lib/index.js';

const state = { scripts: {}, commands: [], loader: new THREE.ObjectLoader() };
globalThis.__h3dPrefabTest = state;
const output = await build({
  entryPoints: [path.resolve(import.meta.dirname, '../../packages/editor/src/utils/common/prefab.ts')],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'prefab-fixture', setup(b) {
    b.onResolve({ filter: /^@astral3d\/engine$/ }, () => ({ path: 'engine', namespace: 'fixture' }));
    b.onResolve({ filter: /^(three|jszip)$/ }, args => ({ path: args.path === 'three'
      ? path.resolve(import.meta.dirname, '../../packages/editor/node_modules/three/build/three.module.js')
      : path.resolve(import.meta.dirname, '../../packages/editor/node_modules/jszip/lib/index.js'), external: true }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      const s=globalThis.__h3dPrefabTest;
      export const App={scripts:s.scripts,execute:(command,name)=>s.commands.push({command,name})};
      export const Loader={objectLoader:s.loader};
      export class AddObjectWithScriptsCommand {constructor(object,scripts){this.object=object;this.scripts=scripts;}}
    `, loader: 'js' }));
  } }],
});
// Absolute import URLs also work when this bundled module is loaded from a data URL.
const code = output.outputFiles[0].text.replace(/from "([A-Z]:[^"\n]+)"/g, (_, file) => `from ${JSON.stringify(new URL('file:///' + file.replaceAll('\\\\','/')).href)}`);
const { preparePrefab, instantiatePrefab } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function fixture() {
  const object = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  material.map = new THREE.DataTexture(new Uint8Array([255,0,0,255]),1,1);
  object.name = 'Shared prefab';
  object.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  object.animations = [new THREE.AnimationClip('Move', 1, [new THREE.VectorKeyframeTrack(`${object.children[0].uuid}.position`, [0,1], [0,0,0,1,2,3])])];
  return { signature: 'h3d-prefab-package', version: 1, name: object.name, rootUuid: object.uuid, object: object.toJSON(),
    scripts: { [object.uuid]: [{ name: 'kept', source: 'globalThis.__prefabMustNotRun = true;', params: { speed: 1 } }] } };
}
async function zip(data) { return new JSZip().file('prefab.json', JSON.stringify(data)).generateAsync({ type: 'uint8array' }); }

test('GUI/MCP prefab preparation shares resources, remaps scripts and animation bindings without executing or inserting', async () => {
  const source = fixture(), before = JSON.stringify(source), bytes = await zip(source);
  const prepared = await preparePrefab(bytes, { scriptParams: { speed: 2 }, position: { x: 3 } }, { confirmEmbeddedContent: false });
  const root = prepared.object, [a,b] = root.children;
  assert.notEqual(root.uuid, source.rootUuid);
  assert.equal(a.geometry, b.geometry); assert.equal(a.material, b.material);
  assert.notEqual(a.geometry.uuid, source.object.geometries[0].uuid);
  assert.notEqual(a.material.uuid, source.object.materials[0].uuid);
  assert.equal(a.material.map,b.material.map);
  assert.notEqual(a.material.map.uuid,source.object.textures[0].uuid);
  assert.deepEqual(Array.from(a.material.map.image.data),[255,0,0,255]);
  assert.equal(root.animations[0].tracks[0].name, `${a.uuid}.position`);
  assert.equal(prepared.scripts[root.uuid][0].params.speed, 2);
  assert.equal(prepared.scripts[source.rootUuid], undefined);
  assert.equal(root.position.x, 3); assert.equal(root.parent, null);
  assert.deepEqual(state.scripts, {}); assert.equal(state.commands.length, 0);
  assert.equal(globalThis.__prefabMustNotRun, undefined); assert.equal(JSON.stringify(source), before);
  const gui = await instantiatePrefab(bytes, { commandName: 'GUI prefab' });
  assert.equal(state.commands.at(-1).command.object, gui);
  assert.equal(state.commands.at(-1).command.scripts[gui.uuid][0].params.speed, 1);
  assert.equal(state.commands.at(-1).name, 'GUI prefab');
  assert.notEqual(gui.uuid,root.uuid);assert.notEqual(gui.children[0].material.map.uuid,a.material.map.uuid);
});

test('invalid packages, parser failures and unconfirmed HTML never produce a prepared scene object', async () => {
  await assert.rejects(() => preparePrefab(new Uint8Array([0,1,2])));
  await assert.rejects(() => preparePrefab(new JSZip().generateAsync({type:'uint8array'})), /prefab.json/);
  await assert.rejects(() => preparePrefab(zip({...fixture(),version:2})), /Invalid prefab/);
  const data = fixture(); data.object.object.children.push({ type:'HtmlPanel' });
  let calls=0;
  const loader={parseAsync:async()=>{calls++;throw Error('actual parser failure');}};
  await assert.rejects(() => preparePrefab(zip(data),{}, {loader,confirmEmbeddedContent:false}), /confirmEmbeddedContent/);
  assert.equal(calls,0);
  await assert.rejects(() => preparePrefab(zip(data),{}, {loader,confirmEmbeddedContent:true}), /actual parser failure/);
  assert.equal(calls,1);
});

test('cancellation before parsing does no work; cancellation after parsing disposes shared resources once', async () => {
  const controller = new AbortController();controller.abort();
  let calls=0;
  await assert.rejects(() => preparePrefab(zip(fixture()),{}, {signal:controller.signal,loader:{parseAsync:async()=>{calls++;}}}), /abort/i);
  assert.equal(calls,0);
  const later = new AbortController(), root=new THREE.Group(), geometry=new THREE.BoxGeometry(), material=new THREE.MeshStandardMaterial();
  root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
  let geometries=0, materials=0; geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);
  await assert.rejects(() => preparePrefab(zip(fixture()),{}, {signal:later.signal,loader:{parseAsync:async()=>{later.abort();return root;}}}), /abort/i);
  assert.equal(geometries,1);assert.equal(materials,1);
});
