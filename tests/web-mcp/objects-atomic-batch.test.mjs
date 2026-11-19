import test from 'node:test';
import assert from 'node:assert/strict';
import { AtomicBatchCommand } from '../../packages/sdk/lib/core/commands/AtomicBatchCommand.ts';

test('batch is one reversible boundary, captures sequential state, and never merges', () => {
  let value = 0;
  const set = next => () => { const old = value; return { execute() { value = next; }, undo() { value = old; } }; };
  const batch = new AtomicBatchCommand([set(1), set(2)]);
  batch.execute(); assert.equal(value, 2);
  batch.undo(); assert.equal(value, 0);
  batch.execute(); assert.equal(value, 2);
  assert.equal(batch.updatable, false);
  assert.throws(() => batch.toJSON(), /session-local/);
});

test('recovers the current partially mutated command, not just earlier commands', () => {
  let value = 0;
  const batch = new AtomicBatchCommand([
    () => ({ execute() { value = 1; }, undo() { value = 0; } }),
    () => ({ execute() { value = 2; throw new Error('injected'); }, undo() { value = 1; } }),
  ]);
  assert.throws(() => batch.execute(), /injected/); assert.equal(value, 0);
});

test('undo failure restores the applied batch; redo failure restores undone state', () => {
  let value = 0, failUndo = false, failRedo = false;
  const batch = new AtomicBatchCommand([() => ({
    execute() { value = 1; if (failRedo) throw new Error('redo'); },
    undo() { value = 0; if (failUndo) throw new Error('undo'); },
  })]);
  batch.execute(); failUndo = true;
  assert.throws(() => batch.undo(), /undo/); assert.equal(value, 1);
  failUndo = false; batch.undo(); failRedo = true;
  assert.throws(() => batch.execute(), /redo/); assert.equal(value, 0);
});

test('1000 steps restore in reverse order and failures during preparation do not leak', () => {
  const values = [];
  const batch = new AtomicBatchCommand(Array.from({length:1000}, (_,i) => () => ({execute(){values.push(i);},undo(){assert.equal(values.pop(),i);}})));
  batch.execute(); assert.equal(values.length,1000); batch.undo(); assert.equal(values.length,0);
  const failed = new AtomicBatchCommand([() => ({execute(){values.push(1);},undo(){values.pop();}}), () => {throw new Error('prepare');}]);
  assert.throws(()=>failed.execute(),/prepare/); assert.deepEqual(values,[]);
});
