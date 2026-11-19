import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArtifactStore } from '../../packages/mcp-bridge/src/artifacts.mjs';

async function storage(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'h3d-artifact-race-'));
  const store = new ArtifactStore({ directory, ...options });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, store };
}

test('concurrent reservations cannot exceed the total temporary byte budget', async t => {
  const { store } = await storage(t, { maxStoredBytes: 10 });
  const results = await Promise.allSettled([
    store.prepare('page-a', { name: 'a.bin', size: 6 }, ''),
    store.prepare('page-b', { name: 'b.bin', size: 6 }, ''),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'UPLOAD_SIZE_LIMIT');
  assert.equal(store.reservedBytes, 6);
  assert.equal(store.records.size, 1);
});

test('concurrent reservations cannot exceed the per-page upload count', async t => {
  const { store } = await storage(t, { maxUploadsPerSession: 1 });
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => store.prepare('page-a', { name: `${i}.bin`, size: 0 }, '')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.code === 'UPLOAD_LIMIT'));
  assert.equal(store.records.size, 1);
});

test('initialization I/O failure releases the reserved count and bytes', async t => {
  const { directory, store } = await storage(t, { maxUploadsPerSession: 1, maxStoredBytes: 6 });
  const first = await store.prepare('page-a', { name: 'a.bin', size: 6 }, '');
  await store.remove(store.get(first.uploadId));
  // Simulate a storage fault after the store is live: its directory is replaced
  // by a regular file, making initialization of the next upload fail.
  await rm(directory, { recursive: true, force: true });
  await writeFile(directory, 'storage unavailable');
  await assert.rejects(store.prepare('page-a', { name: 'b.bin', size: 6 }, ''));
  assert.equal(store.reservedBytes, 0); assert.equal(store.records.size, 0);
  await rm(directory, { force: true });
  const recovered = await store.prepare('page-a', { name: 'c.bin', size: 6 }, '');
  assert.equal(store.get(recovered.uploadId).total, 6);
});

test('duplicate concurrent release cannot return the same capacity twice', async t => {
  const { store } = await storage(t, { maxStoredBytes: 10 });
  const reserved = await store.prepare('page-a', { name: 'a.bin', size: 6 }, '');
  const record = store.get(reserved.uploadId);
  await Promise.all([store.remove(record), store.remove(record)]);
  assert.equal(store.reservedBytes, 0); assert.equal(store.records.size, 0);
  await assert.rejects(store.prepare('page-a', { name: 'b.bin', size: 11 }, ''), { code: 'UPLOAD_SIZE_LIMIT' });
});
