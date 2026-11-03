import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalImportAccess } from '../../packages/desktop/src/localImports.mjs';

test('absolute model paths work across workspace, Downloads, template and linked folders without grants',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'h3d-import-paths-'));
  try {
    const root=path.join(temp,'workspace'), outside=path.join(temp,'Downloads'), template=path.join(temp,'template');
    for(const dir of [root,outside,template])await mkdir(dir);
    await writeFile(path.join(root,'模型 #100%.gltf'),'model');await writeFile(path.join(template,'buffer.bin'),'buffer');
    await writeFile(path.join(root,'secret.txt'),'not a model');await writeFile(path.join(outside,'model.glb'),'downloaded model');
    await writeFile(path.join(template,'模型.h3dprefab.zip'),'prefab');await writeFile(path.join(template,'unrelated.zip'),'unrelated');
    await symlink(outside,path.join(root,'linked'),process.platform==='win32'?'junction':'dir');
    const access=createLocalImportAccess();
    const prefab=await access.prepare(path.join(template,'模型.h3dprefab.zip'),'prefab');
    const prefabResponse=await access.respond(prefab.url);
    assert.equal(prefabResponse.headers.get('content-type'),'application/zip');
    assert.equal(await prefabResponse.text(),'prefab');
    await assert.rejects(()=>access.prepare(path.join(template,'unrelated.zip'),'prefab'));
    await assert.rejects(()=>access.respond(new URL('unrelated.zip',prefab.url).href),/type/);
    const prepared=await access.prepare(path.join(root,'模型 #100%.gltf'));
    assert.equal(await (await access.respond(prepared.url)).text(),'model');
    assert.equal(await (await access.respond(new URL('../template/buffer.bin',prepared.url).href)).text(),'buffer');
    for(const file of [path.join(outside,'model.glb'),path.join(root,'linked','model.glb')]) {
      const source=await access.prepare(file);assert.equal(await (await access.respond(source.url)).text(),'downloaded model');
    }
    for(const name of ['relative.glb','../Downloads/model.glb','https://example.com/model.glb',path.join(root,'secret.txt'),path.join(root,'missing.glb')])await assert.rejects(()=>access.prepare(name));
    await assert.rejects(()=>access.respond(new URL('secret.txt',prepared.url).href),/type/);
    assert.equal((await access.respond(prepared.url,'POST')).status,405);
    assert.equal(await (await access.respond(prepared.url,'HEAD')).text(),'');
    await assert.rejects(()=>createLocalImportAccess().respond(prepared.url),/expired/);
  } finally {
    assert.equal(path.dirname(temp),os.tmpdir());assert.ok(path.basename(temp).startsWith('h3d-import-paths-'));
    await rm(temp,{recursive:true,force:true});
  }
});
