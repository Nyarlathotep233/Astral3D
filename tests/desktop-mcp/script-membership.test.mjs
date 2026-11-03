import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Scene } from '../../packages/editor/node_modules/three/build/three.module.js';
import { build } from '../../packages/desktop/node_modules/esbuild/lib/main.js';
import { AtomicBatchCommand, BatchRecoveryError } from '../../packages/sdk/lib/core/commands/AtomicBatchCommand.ts';

const counts = new Map();
const app = {
  scene: new Scene(), scripts: {}, geometries: {}, selected: null,
  history: { undos: [], redos: [] },
  addObject(object, parent, index) {
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
const fixture = { app, AtomicBatchCommand, BatchRecoveryError, notify() {} };
globalThis.__h3dMembershipTest = fixture;
globalThis.window = { viewer: { enableScript: false } };
const output = await build({
  entryPoints: [path.resolve(import.meta.dirname, '../../packages/editor/src/utils/integration/desktopEdits.ts')],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'membership-fixture', setup(b) {
    b.onResolve({ filter: /^@astral3d\/engine$|^@\/utils\/common\/saveSceneToService$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('saveSceneToService')
      ? 'export const isSceneSaving=()=>false;'
      : `const f=globalThis.__h3dMembershipTest; export const App=f.app, AtomicBatchCommand=f.AtomicBatchCommand, BatchRecoveryError=f.BatchRecoveryError;
         export const Hooks={useDispatchSignal:(...args)=>f.notify(...args),useAddSignal:()=>{}};
         export class SetPositionCommand{} export class SetRotationCommand{} export class SetScaleCommand{} export class SetValueCommand{}`, loader: 'js' }));
  } }],
});
const { applyDesktopEdit } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

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
