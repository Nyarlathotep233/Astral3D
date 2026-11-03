import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial } from '../../packages/editor/node_modules/three/build/three.module.js';
import { build } from '../../packages/desktop/node_modules/esbuild/lib/main.js';
import { AtomicBatchCommand, BatchRecoveryError } from '../../packages/sdk/lib/core/commands/AtomicBatchCommand.ts';

const counts = new Map();
class ObjectRegistrationError extends Error {}
let failRegistration = false;
const app = {
  scene: new Scene(), scripts: {}, geometries: {}, selected: null,
  history: { undos: [], redos: [] },
  addObject(object, parent, index) {
    if (failRegistration) throw new ObjectRegistrationError('registration restored');
    if (object.material) counts.set(object.material, (counts.get(object.material) || 0) + 1);
    parent.children.splice(index, 0, object); object.parent = parent;
  },
  removeObject(object) {
    if (object.material) counts.set(object.material, counts.get(object.material) - 1);
    object.parent.remove(object);
  },
  execute(command) { command.execute(); command.id = this.history.undos.length + 1; this.history.undos.push(command); },
  deselect() {},
};
const jobs = new Map(), consumed = [];
const fixture = { app, AtomicBatchCommand, BatchRecoveryError, ObjectRegistrationError, notify() {}, jobs: {
  ready: id => jobs.get(id), consume: id => consumed.push(id),
} };
globalThis.__h3dMembershipTest = fixture;
globalThis.window = { viewer: { enableScript: false } };
const output = await build({
  entryPoints: [path.resolve(import.meta.dirname, '../../packages/editor/src/utils/integration/desktopEdits.ts')],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'membership-fixture', setup(b) {
    b.onResolve({ filter: /^\.\/desktopModels$/ }, () => ({ path:'models', namespace:'fixture' }));
    b.onResolve({ filter: /^@astral3d\/engine$|^@\/utils\/common\/saveSceneToService$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path==='models' ? 'export const desktopModelJobs=globalThis.__h3dMembershipTest.jobs;' : args.path.endsWith('saveSceneToService')
      ? 'export const isSceneSaving=()=>false;'
      : `const f=globalThis.__h3dMembershipTest; export const App=f.app, AtomicBatchCommand=f.AtomicBatchCommand, BatchRecoveryError=f.BatchRecoveryError;
         export const Hooks={useDispatchSignal:(...args)=>f.notify(...args),useAddSignal:()=>{}};
         export const ObjectRegistrationError=f.ObjectRegistrationError; export class SetPositionCommand{} export class SetRotationCommand{} export class SetScaleCommand{} export class SetValueCommand{}`, loader: 'js' }));
  } }],
});

const { applyDesktopEdit } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text + '\n//# sourceURL=h3d-membership-fixture.mjs').toString('base64')}`);

test('prepared prefab scripts attach once, undo/redo retain identities, and partial notification failure restores the scene', () => {
  const root=new Group(), child=new Mesh(new BoxGeometry(),new MeshStandardMaterial());root.add(child);
  const scripts={ [root.uuid]:[{name:'root',source:'not executed'}], [child.uuid]:[{name:'child',source:'not executed'}] };
  const jobId=randomUUID();jobs.set(jobId,{object:root,scripts});
  const batch = () => applyDesktopEdit('h3d_scene_batch', { expectedRevision:0, operationId:randomUUID(), label:'prefab', operations:[{type:'insert-model',jobId,ref:'prefab'}] });
  const beforeChildren=[...app.scene.children], beforeScripts={...app.scripts}, beforeHistory=[...app.history.undos];
  fixture.notify = event => { if(event==='scriptAdded'){fixture.notify=()=>{};throw Error('prefab script observer failed');} };
  assert.throws(batch,/prefab script observer/);
  assert.equal(root.parent,null);assert.deepEqual(app.scene.children,beforeChildren);
  assert.deepEqual(app.scripts,beforeScripts);assert.deepEqual(app.history.undos,beforeHistory);
  assert.ok(!consumed.includes(jobId));assert.equal(jobs.get(jobId).object,root);
  const result=batch(), command=app.history.undos.at(-1);
  assert.equal(result.refs.prefab,root.uuid);assert.equal(consumed.filter(id=>id===jobId).length,1);
  assert.equal(app.scripts[root.uuid],scripts[root.uuid]);assert.equal(app.scripts[child.uuid],scripts[child.uuid]);
  command.undo();assert.equal(root.parent,null);assert.deepEqual(app.scripts,beforeScripts);
  command.execute();assert.equal(root.parent,app.scene);assert.equal(app.scripts[child.uuid],scripts[child.uuid]);
  command.undo();app.history.undos.pop();
});

test('atomic recovery does not remove a subtree whose registration already rolled back', () => {
  const before = new Map(counts), children = [...app.scene.children], history = [...app.history.undos];
  failRegistration = true;
  assert.throws(() => applyDesktopEdit('h3d_scene_batch', { expectedRevision: 0, operationId: randomUUID(), label: 'failure', operations: [
    { type: 'create', kind: 'box', ref: 'box', name: 'test' },
  ] }), /registration restored/);
  failRegistration = false;
  assert.deepEqual(counts, before);
  assert.deepEqual(app.scene.children, children);
  assert.deepEqual(app.history.undos, history);
});
test('script-removal notification failure restores membership, script identity and material count', () => {
  const batch = operations => applyDesktopEdit('h3d_scene_batch', { expectedRevision: 0, operationId: randomUUID(), label: 'test', operations });
  const created = batch([
    { type: 'create', kind: 'box', ref: 'box', name: 'test' },
    { type: 'script-add', target: { ref: 'box' }, script: { name: 'test', source: 'not executed' } },
  ]);
  const object = app.scene.getObjectByProperty('uuid', created.refs.box);
  const scripts = app.scripts[object.uuid], script = scripts[0];
  fixture.notify = event => { if (event === 'scriptRemoved') { fixture.notify = () => {}; throw Error('script observer failed'); } };
  assert.throws(() => batch([{ type: 'remove', target: { uuid: object.uuid } }]), /script observer/);
  assert.equal(object.parent, app.scene);
  assert.equal(app.scene.children.filter(child => child === object).length, 1);
  assert.equal(counts.get(object.material), 1);
  assert.equal(app.scripts[object.uuid], scripts);
  assert.equal(app.scripts[object.uuid][0], script);
  assert.equal(app.history.undos.length, 1);
});
