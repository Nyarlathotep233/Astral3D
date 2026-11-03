// Small, reproducible derivatives of the existing bundled stool, not another asset library.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../.codex-logs/desktop-mcp/import-fixtures');
const buffer=await readFile(new URL('../../packages/editor/public/static/model/furniture/WoodenStool_astral3d.optimize.glb',import.meta.url));
const jsonLength=buffer.readUInt32LE(12), binOffset=20+jsonLength;
const document=JSON.parse(buffer.subarray(20,binOffset).toString());
document.buffers[0].uri='../buffers/stool.bin';
await mkdir(path.join(root,'models'),{recursive:true});await mkdir(path.join(root,'buffers'),{recursive:true});
await writeFile(path.join(root,'buffers','stool.bin'),buffer.subarray(binOffset+8,binOffset+8+buffer.readUInt32LE(binOffset)));
await writeFile(path.join(root,'models','stool.gltf'),JSON.stringify(document));
const missingBuffer=structuredClone(document);missingBuffer.buffers[0].uri='../buffers/missing.bin';
await writeFile(path.join(root,'models','missing-buffer.gltf'),JSON.stringify(missingBuffer));
const missingTexture=structuredClone(document);delete missingTexture.images[0].bufferView;missingTexture.images[0].uri='missing-texture.png';
await writeFile(path.join(root,'models','missing-texture.gltf'),JSON.stringify(missingTexture));
console.log(root);
