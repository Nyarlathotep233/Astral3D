import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import * as THREE from '../../packages/editor/node_modules/three/build/three.module.js';
import { createRequire } from 'node:module';
const foreignThree=createRequire(import.meta.url)('../../packages/editor/node_modules/three/build/three.cjs');

// Exercise the real App resource registration and add/remove implementations, without
// starting IndexedDB, a Viewer, or the singleton's constructor in Node.
globalThis.__registrationThree = THREE;
globalThis.__registrationNotify = () => {};
const output = await build({
  entryPoints: [path.resolve(import.meta.dirname, '../../packages/sdk/lib/core/app/App.ts')],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'app-fixture', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/|^\.\/modules$|^\.\.\/expansion$|^\.\.\/animation\/AnimationManager$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
      args.path === 'three' ? Object.keys(THREE).map(key => `export const ${key}=globalThis.__registrationThree.${key};`).join('\n') :
      args.path === '../expansion' ? '' :
      args.path === '@/hooks' ? 'export const useAddSignal=()=>{},useSetSignalActive=()=>{},useDispatchSignal=(...args)=>globalThis.__registrationNotify(...args);' :
      args.path === './modules' ? 'class Empty{}; export {Empty as Config,Empty as Storage,Empty as Project,Empty as Selector,Empty as History,Empty as Resource,Empty as CSM};' :
      args.path === '../animation/AnimationManager' ? 'export class AnimationManager{}' :
      args.path.includes('Commands') ? 'export class AddScriptCommand{};export class RemoveScriptCommand{};' : 'export default class Empty{}', loader: 'js' }));
    // Only omit singleton construction; tests use the actual exported class methods.
    b.onLoad({ filter: /[/\\]app[/\\]App\.ts$/ }, async args => {
      const { readFile } = await import('node:fs/promises');
      const contents = (await readFile(args.path, 'utf8')).replace('const app = new App();', 'const app = null;');
      return { contents, loader: 'ts' };
    });
  } }],
});
const { App } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`).catch(error => { throw Error(error.message); });
THREE.Object3D.prototype.traverseByCondition = function(fn, condition) { if (!condition(this)) return; fn(this); for (const child of this.children) child.traverseByCondition(fn, condition); };

function fixture() {
  const app = Object.create(App.prototype);
  Object.assign(app, { scene: new THREE.Scene(), sceneHelpers: new THREE.Scene(), geometries: {}, materials: {}, cameras: {}, helpers: {}, materialsRefCounter: new Map(), animationManager: { mixerMap: new Map(), actionMap: new Map() }, csm: { setupMaterial() {} } });
  return app;
}

test('foreign Three objects register, animate, traverse and serialize through SDK extensions', () => {
  assert.notEqual(foreignThree.Object3D, THREE.Object3D);
  const app=fixture(), root=new foreignThree.Group(), mesh=new foreignThree.Mesh(new foreignThree.BoxGeometry(),new foreignThree.MeshStandardMaterial());
  root.add(mesh);mesh.animations.push(new foreignThree.AnimationClip('Move',1,[new foreignThree.VectorKeyframeTrack('.position',[0,1],[0,0,0,1,2,3])]));
  assert.equal(typeof root.traverseByCondition,'undefined');
  app.addObject(root);
  assert.equal(root.parent,app.scene);assert.equal(typeof mesh.isAncestor,'function');assert.equal(typeof mesh.animations[0].getClip,'function');
  const serialized=root.toJSON();assert.equal(serialized.animations[0].name,'Move');assert.equal(serialized.object.children[0].type,'Mesh');
  app.removeObject(root);assert.equal(root.parent,null);assert.equal(app.materialsRefCounter.size,0);
});

test('duplicate scene and subtree UUIDs fail before modifying resources or membership', () => {
  const app=fixture(),existing=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());app.addObject(existing);
  const duplicate=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());duplicate.uuid=existing.uuid;
  assert.throws(()=>app.addObject(duplicate),/UUID already exists/);assert.equal(duplicate.parent,null);assert.deepEqual(app.scene.children,[existing]);
  const group=new THREE.Group(),a=new THREE.Group(),b=new THREE.Group();b.uuid=a.uuid;group.add(a,b);assert.throws(()=>app.addObject(group),/Duplicate object UUID/);assert.equal(group.parent,null);
});

test('partial add restores exact shared material counts, geometry, cameras, helpers and animation clips', () => {
  const app = fixture(), shared = new THREE.MeshStandardMaterial(), other = new THREE.MeshStandardMaterial();
  const existing = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  app.addObject(existing);
  const root = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  const first = new THREE.Mesh(new THREE.BoxGeometry(), shared), second = new THREE.Mesh(new THREE.BoxGeometry(), other);
  const clip = new THREE.AnimationClip('move', 1, []);
  root.animations.push(clip); root.add(camera, first, second);
  const geometries = { ...app.geometries }, animations = root.animations;
  let notifications = 0;
  globalThis.__registrationNotify = event => { if (event === 'materialAdded' && ++notifications === 1) throw Error('injected registration failure'); };
  assert.throws(() => app.addObject(root), error => error.registrationRestored && /injected/.test(error.message));
  globalThis.__registrationNotify = () => {};
  assert.equal(root.parent, null);
  assert.deepEqual(app.scene.children, [existing]);
  assert.deepEqual(app.materialsRefCounter, new Map([[shared, 1]]));
  assert.deepEqual(app.materials, { [shared.uuid]: shared });
  assert.deepEqual(app.geometries, geometries);
  assert.deepEqual(app.cameras, {}); assert.deepEqual(app.helpers, {});
  assert.equal(app.sceneHelpers.children.length, 0);
  assert.equal(app.animationManager.mixerMap.size, 0); assert.equal(app.animationManager.actionMap.size, 0);
  assert.equal(root.animations, animations); assert.equal(root.animations[0], clip);
  app.addObject(root);
  assert.equal(app.materialsRefCounter.get(shared), 2);
  app.removeObject(root);
  assert.equal(app.materialsRefCounter.get(shared), 1);
});

test('partial removal restores registered resources without re-registering unvisited meshes', () => {
  const app = fixture(), shared = new THREE.MeshStandardMaterial();
  const root = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  root.add(camera, new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Mesh(new THREE.BoxGeometry(), shared));
  app.addObject(root);
  const helper = app.helpers[camera.id];
  let notifications = 0;
  globalThis.__registrationNotify = event => { if (event === 'materialRemoved' && ++notifications === 1) throw Error('injected remove failure'); };
  assert.throws(() => app.removeObject(root), error => error.registrationRestored);
  globalThis.__registrationNotify = () => {};
  assert.equal(root.parent, app.scene); assert.deepEqual(app.scene.children, [root]);
  assert.equal(app.materialsRefCounter.get(shared), 2);
  assert.equal(app.materials[shared.uuid], shared);
  assert.equal(app.cameras[camera.uuid], camera);
  assert.equal(app.helpers[camera.id], helper); assert.equal(helper.parent, app.sceneHelpers);
  app.removeObject(root);
  assert.equal(app.materialsRefCounter.size, 0);
});

test('persistent observer failure is explicitly reported as incomplete recovery, not success', () => {
  const app = fixture(), root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  globalThis.__registrationNotify = event => { if (event === 'materialAdded') throw Error('persistent observer failure'); };
  assert.throws(() => app.addObject(root), error => error.recoveryFailed === true && error.errors.length === 2);
  globalThis.__registrationNotify = () => {};
  assert.equal(root.parent, null);
  assert.equal(app.materialsRefCounter.size, 0);
  assert.deepEqual(app.materials, {});
});

test('failure releases new actions in a pre-existing mixer without replacing that mixer', () => {
  const app = fixture(), root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const mixer = new THREE.AnimationMixer(root), clip = new THREE.AnimationClip('pending', 1, []);
  root.animations.push(clip); app.animationManager.mixerMap.set(root.uuid, mixer);
  let fail = true;
  globalThis.__registrationNotify = event => { if (event === 'materialAdded' && fail) { fail=false; throw Error('once'); } };
  assert.throws(() => app.addObject(root), error => error.registrationRestored);
  globalThis.__registrationNotify = () => {};
  assert.equal(app.animationManager.mixerMap.get(root.uuid), mixer);
  assert.equal(mixer.existingAction(clip, root), null);
  assert.equal(root.animations[0], clip);
});
