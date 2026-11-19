import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import * as THREE from '../../packages/editor/node_modules/three/build/three.module.js';
import JSZip from '../../packages/editor/node_modules/jszip/lib/index.js';

const app={scene:new THREE.Scene(),scripts:{},project:{info:{sceneInfo:{id:'s1',sceneName:'Test Project',zip:'saved/original.zip'},'effect.LUT':{enabled:false}},getKey(key){if(key==='sceneInfo.zip')return this.info.sceneInfo.zip;return this.info[key];},setKey(key,value){if(key==='sceneInfo.zip')this.info.sceneInfo.zip=value;else this.info[key]=value;}}};
let failPack=false,disposed=0;
class Package {
  async pack(options){app.project.info.sceneInfo.zip='temporary.zip';if(failPack)throw Error('injected pack failure');const zip=new JSZip();zip.file('scene.json',JSON.stringify({scene:app.scene.toJSON(),scripts:app.scripts}));const value=new File([await zip.generateAsync({type:'uint8array'})],'first.zip');await options.zipUploadFun(value);return {firstUploadResult:value.name};}
  dispose(){disposed++;}
}
globalThis.__exportsFixture={THREE,app,Package};globalThis.window={viewer:{}};globalThis.location=new URL('http://editor.test/editor/s1');
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onload?.();this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(value).toString('base64')}`;this.onload?.();this.onloadend?.();});}};
const output=await build({entryPoints:[path.resolve(import.meta.dirname,'../../packages/editor/src/utils/common/sceneExport.ts')],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^three$|^@astral3d\/engine$|^\.\/prefab$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='three'?Object.keys(THREE).map(k=>`export const ${k}=globalThis.__exportsFixture.THREE.${k};`).join('\n'):a.path==='./prefab'?'export async function createPrefabFile(object){return new File([JSON.stringify(object.toJSON())],"prefab.zip");}':'export const THREE=globalThis.__exportsFixture.THREE,App=globalThis.__exportsFixture.app,Package=globalThis.__exportsFixture.Package;'}));
}}]});
const {createSceneExport,buildStandalonePreviewHtml}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
function scene(){app.scene.clear();app.scripts={};const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.name='Box';app.scene.add(mesh);return mesh;}

test('interchange exports contain actual geometry, preserve source membership, and never download',async()=>{
  const mesh=scene();const original=mesh.parent;
  for(const format of ['json','obj','ply','ply-binary','stl','stl-binary','glb','gltf','usdz']) {
    const result=await createSceneExport({format,object:mesh});assert.ok(result.size>100,format);assert.equal(mesh.parent,original);
    if(format==='glb')assert.equal(Buffer.from(await result.arrayBuffer()).subarray(0,4).toString(),'glTF');
    if(format==='ply-binary')assert.match(Buffer.from(await result.arrayBuffer()).subarray(0,100).toString(),/format binary_little_endian/);
    if(format==='stl-binary')assert.equal(result.size,84+50*12);
    if(format==='usdz')assert.equal(Buffer.from(await result.arrayBuffer()).subarray(0,2).toString(),'PK');
    if(format==='gltf')assert.equal(JSON.parse(await result.text()).meshes.length,1);
  }
});
test('JSON keeps scripts and animation and skips editor-only scene objects',async()=>{
  const mesh=scene();mesh.animations.push(new THREE.AnimationClip('move',1,[new THREE.VectorKeyframeTrack('.position',[0,1],[0,0,0,1,0,0])]));app.scripts[mesh.uuid]=[{name:'logic',source:'function update(){}'}];const ignored=new THREE.Group();ignored.ignore=true;app.scene.add(ignored);
  const value=JSON.parse(await(await createSceneExport({format:'json'})).text());assert.equal(value.object.children.length,1);assert.equal(value.scripts[mesh.uuid][0].name,'logic');assert.equal(value.animations[0].name,'move');
});
test('project export contains all package bytes and restores the live saved zip on success and failure',async()=>{
  scene();const before=structuredClone(app.project.info.sceneInfo);const value=await createSceneExport({format:'project-zip'});const zip=await JSZip.loadAsync(await value.arrayBuffer());const manifest=JSON.parse(await zip.file('project.json').async('string'));assert.equal(manifest.signature,'h3d-scene-project-package-zip');assert.ok(zip.file('packages/'+manifest.firstPackageName));assert.deepEqual(app.project.info.sceneInfo,before);
  failPack=true;await assert.rejects(createSceneExport({format:'project-json'}),/injected/);failPack=false;assert.deepEqual(app.project.info.sceneInfo,before);assert.equal(disposed,2);
});
test('standalone copies runtime dependencies and recursively includes Tiles JSON resources',async()=>{
  const mesh=scene();mesh.isTilesGroup=true;mesh.options={url:'https://tiles.test/root/tileset.json'};
  const urls=[];const fetchResource=async input=>{const url=String(input);urls.push(url);if(url.endsWith('tileset.json'))return new Response(JSON.stringify({root:{content:{uri:'nested/child.json'}}}),{headers:{'content-type':'application/json'}});if(url.endsWith('child.json'))return new Response(JSON.stringify({root:{content:{uri:'../mesh.glb'}}}),{headers:{'content-type':'application/json'}});if(url.endsWith('.js'))return new Response('// runtime');return new Response(new Uint8Array([1,2,3]));};
  const result=await createSceneExport({format:'standalone',fetchResource});const zip=await JSZip.loadAsync(await result.arrayBuffer());assert.ok(zip.file('index.html'));assert.ok(zip.file('runtime/astral3d.umd.js'));assert.ok(zip.file('runtime/libs/basis/basis_transcoder.wasm'));assert.ok(urls.includes('https://tiles.test/root/mesh.glb'));const assets=Object.keys(zip.files).filter(name=>name.startsWith('assets/')&&!zip.files[name].dir);assert.equal(assets.length,3);const manifest=JSON.parse(await zip.file('project.json').async('string'));assert.ok(manifest.externalResources['https://tiles.test/root/tileset.json']);
  for(const name of assets.filter(name=>name.endsWith('.json'))){const source=JSON.parse(await zip.file(name).async('string'));const local=path.posix.normalize(path.posix.join(path.posix.dirname(name),source.root.content.uri));assert.ok(zip.file(local),`Missing rewritten dependency ${local}`);}
  const inner=await JSZip.loadAsync(await zip.file('packages/first.zip').async('uint8array'));assert.ok(!(await inner.file('scene.json').async('string')).includes('https://tiles.test/root/tileset.json'));
});
test('standalone rejects unavailable dependencies and escapes its title',async()=>{
  scene();await assert.rejects(createSceneExport({format:'standalone',fetchResource:async()=>new Response('',{status:404})}),/HTTP 404/);assert.ok(buildStandalonePreviewHtml('<script>alert(1)</script>').includes('&lt;script&gt;'));
});

test('standalone follows HTML resources but leaves ordinary hyperlinks external',async()=>{
  const object=scene();object.isHtmlPanel=true;object.options={codes:[{name:'index.html',content:'<a href="https://external.test/article">Reference</a><link rel="canonical" href="https://external.test/canonical"><link rel="stylesheet" href="https://assets.test/style.css"><img src="https://assets.test/picture.png">'}]};
  const urls=[];await createSceneExport({format:'standalone',fetchResource:async input=>{urls.push(String(input));if(String(input).startsWith('https://external.test'))throw Error('Hyperlinks must not be fetched');return new Response(String(input).endsWith('.js')?'//runtime':String(input).endsWith('.css')?'body{}':new Uint8Array([1,2]));}});
  assert.ok(urls.includes('https://assets.test/style.css'));assert.ok(urls.includes('https://assets.test/picture.png'));assert.ok(!urls.some(url=>url.startsWith('https://external.test')));
});
