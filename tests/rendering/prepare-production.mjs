import fs from 'node:fs/promises';
import path from 'node:path';
const root='packages/editor/dist';
const bundle=(await fs.readdir(path.join(root,'assets'))).find(name=>/^astral3d-.*\.js$/.test(name));
if(!bundle)throw new Error('Build the editor first');
await fs.cp('.codex-logs/package-test',path.join(root,'verify-packages'),{recursive:true});
await fs.writeFile(path.join(root,'verify-rendering.html'),`<!doctype html><title>H3D production rendering verification</title><div id="viewport" style="width:960px;height:640px"></div><script>
window.__errors=[];window.__contexts=[];
for(const C of [HTMLCanvasElement,window.OffscreenCanvas].filter(Boolean)){const f=C.prototype.getContext;C.prototype.getContext=function(t,...a){__contexts.push(t);return f.call(this,t,...a)}};
const error=console.error;console.error=(...a)=>{__errors.push(a.map(String).join(' '));error(...a)};
addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
</script><script type="module">
const module=await import('./assets/${bundle}');
await module.__tla;
// Bundler aliases export names; identify public APIs by their stable methods.
const exports=Object.values(module);
const Viewer=exports.find(x=>x?.prototype?.createEngine&&x?.prototype?.installScripts);
const Package=exports.find(x=>x?.prototype?.pack&&x?.prototype?.unpack);
const App=exports.find(x=>x?.scene?.isScene&&x?.project);
if(!Viewer||!Package||!App)throw new Error('Production SDK exports not found');
window.App=App;
const viewer=window.viewer=new Viewer({container:document.getElementById('viewport'),enableScript:false,edit:{enabled:true},grid:{enabled:false},request:{baseUrl:''}});
await viewer.ready;
await new Promise((resolve,reject)=>new Package(viewer).unpack({url:'./verify-packages/webgpu-test.zip',onComplete:resolve,onError:reject}));
viewer.renderer.setAnimationLoop(null);
const effect=App.project.getKey('effect'); effect.enabled=true;effect.LUT.enabled=true;
await viewer.modules.effect.createPipeline();
viewer.render();viewer.assertRenderable();
const a=App.scene.getObjectByName('package-mesh-0'),b=App.scene.getObjectByName('package-mesh-1');
const image=await viewer.getViewportImage();
const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
const context=canvas.getContext('2d');context.drawImage(image,0,0);URL.revokeObjectURL(image.src);
const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
let litPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>80&&pixels[i+1]>80&&pixels[i+2]>80)litPixels++;
window.__production={ready:true,webgpu:viewer.renderer.backend.isWebGPUBackend===true,shared:a.material[0]===b.material[0],litPixels,contexts:__contexts,errors:__errors};
if(!__production.webgpu||!__production.shared||litPixels<1000||__contexts.some(x=>/webgl/i.test(x))||__errors.length)throw new Error('Production renderer verification failed');
</script>`);
console.log('http://127.0.0.1:8095/verify-rendering.html');

// Exercise the real built preview route and its in-memory transport. The missing
// case intentionally omits child ZIPs; it must report failure, not wait 180 seconds.
const packageNames = (await fs.readdir('.codex-logs/package-test')).filter(name => name.endsWith('.zip'));
await fs.writeFile(path.join(root, 'verify-play.html'), `<!doctype html><title>H3D play transport verification</title>
<script>
window.__playResult={statuses:[],done:false};
const sessionId='local-play-transport-check';
const missing=new URLSearchParams(location.search).has('missing');
const names=${JSON.stringify(packageNames)};
addEventListener('message',async e=>{
  if(e.source!==document.getElementById('preview').contentWindow||e.origin!==location.origin||e.data?.sessionId!==sessionId)return;
  __playResult.statuses.push({type:e.data.type,message:e.data.message});
  if(e.data.type==='h3d:play:ready'){
    const packages=await Promise.all(names.filter(name=>!missing||name==='webgpu-test.zip').map(async name=>{
      const response=await fetch('./verify-packages/'+name);
      if(!response.ok)throw Error('Fixture ZIP unavailable: '+name);
      return {name,mimeType:'application/zip',buffer:await response.arrayBuffer()};
    }));
    __playResult.started=performance.now();
    e.source.postMessage({type:'h3d:play:load',sessionId,firstPackageName:'webgpu-test.zip',packages},location.origin,packages.map(p=>p.buffer));
  }
  if(e.data.type==='h3d:play:started'||e.data.type==='h3d:play:error'){
    __playResult.elapsedMs=performance.now()-__playResult.started;
    __playResult.passed=missing?e.data.type==='h3d:play:error'&&e.data.message.includes('missing play package:'):e.data.type==='h3d:play:started';
    __playResult.done=true;
  }
});
</script><iframe id="preview" style="width:960px;height:640px" src="./#/preview/local-test?editorPlay=true&sessionId=local-play-transport-check"></iframe>`);
