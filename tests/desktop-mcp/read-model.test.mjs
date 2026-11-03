import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial } from '../../packages/editor/node_modules/three/build/three.module.js';
import { queryObjects, inspectObjects } from '../../packages/editor/src/utils/integration/desktopReadModel.ts';

test('paged queries use UUIDs and preserve original objects/scripts', () => {
  const root = new Scene();
  const group = new Group(); group.name = 'same'; root.add(group);
  const material = new MeshStandardMaterial({ color: 0x123456 });
  for (let index = 0; index < 101; index++) { const mesh = new Mesh(new BoxGeometry(), material); mesh.name = 'same'; group.add(mesh); }
  const page = queryObjects(root, { offset: 10, limit: 20, type: 'Mesh', parentUuid: group.uuid });
  assert.equal(page.total, 101);
  assert.equal(page.items.length, 20);
  assert.equal(page.nextOffset, 30);
  assert.equal(page.items[0].uuid, group.children[10].uuid);
  assert.equal(new Set(page.items.map(item => item.uuid)).size, 20);
  assert.throws(() => queryObjects(root, { limit: 101 }));
  const mesh = group.children[0];
  mesh.userData = { label: 'untrusted text' };
  const scripts = { [mesh.uuid]: [{ name: 's', source: 'console.log("example")', params: { speed: 2 } }], orphan: [] };
  const before = JSON.stringify(scripts);
  const basic = inspectObjects(root, scripts, { uuids: [mesh.uuid] })[0];
  assert.equal(basic.scripts, undefined); assert.equal(basic.userData, undefined);
  assert.equal(basic.materials[0].uuid, material.uuid);
  assert.equal(basic.materials[0].parameters.color.hexSRGB, '123456');
  const detailed = inspectObjects(root, scripts, { uuids: [mesh.uuid], includeScripts: true, includeUserData: true })[0];
  detailed.scripts[0].params.speed = 99;
  detailed.userData.label = 'changed copy';
  assert.equal(JSON.stringify(scripts), before);
  assert.equal(mesh.userData.label, 'untrusted text');
  assert.equal(Object.hasOwn(scripts, 'orphan'), true);
  assert.throws(() => inspectObjects(root, scripts, { uuids: ['unknown'] }));
  assert.equal(group.children.length, 101);
});
