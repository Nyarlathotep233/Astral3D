import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { AtomicBatchCommand } from '../../packages/sdk/lib/core/commands/AtomicBatchCommand.ts';

const fixture = { config: { getKey: () => true }, dispatch() {} };
globalThis.__h3dHistoryTest = fixture;
const output = await build({
  entryPoints: [path.resolve(import.meta.dirname, '../../packages/sdk/lib/core/app/modules/History.ts')],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'history-fixture', setup(b) {
    b.onResolve({ filter: /^@\/core\/app\/App$|^@\/hooks$|^@\/core\/commands\/Commands$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('App') ? 'export default globalThis.__h3dHistoryTest;' : args.path.endsWith('hooks') ? 'export const useSignal=()=>({dispatch:(...args)=>globalThis.__h3dHistoryTest.dispatch(...args),setActive:()=>{}});' : 'export {};', loader: 'js' }));
  } }],
});
const { History } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

test('failed batches and notifications preserve exact History stacks and values', () => {
  const history = new History(); let value = 0, failExecute = false, failUndo = false;
  const batch = new AtomicBatchCommand([() => ({
    execute() { value = 1; if (failExecute) throw new Error('execute'); },
    undo() { value = 0; if (failUndo) throw new Error('undo'); },
  })]);
  const prior = { id: 9 }; history.redos = [prior];
  failExecute = true;
  assert.throws(() => history.execute(batch), /execute/);
  assert.equal(value, 0); assert.deepEqual(history.undos, []); assert.deepEqual(history.redos, [prior]);
  failExecute = false; fixture.dispatch = () => { throw new Error('observer'); };
  assert.throws(() => history.execute(batch), /observer/);
  assert.equal(value, 0); assert.deepEqual(history.undos, []); assert.deepEqual(history.redos, [prior]);
  fixture.dispatch = () => {}; history.execute(batch);
  assert.equal(batch.id, 1); assert.equal(value, 1); assert.equal(history.undos.length, 1);
  failUndo = true; assert.throws(() => history.undo(), /undo/);
  assert.equal(value, 1); assert.equal(history.undos[0], batch); assert.equal(history.redos.length, 0);
  failUndo = false; history.undo();
  failExecute = true; assert.throws(() => history.redo(), /execute/);
  assert.equal(value, 0); assert.equal(history.redos[0], batch); assert.equal(history.undos.length, 0);
  failExecute = false; history.redo();
  assert.deepEqual(history.toJSON(), { undos: [], redos: [] });
});
