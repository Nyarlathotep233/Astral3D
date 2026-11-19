const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const JSZip = require('../../packages/editor/node_modules/jszip');
const baseURL = process.env.EDITOR_URL || 'https://localhost:8090';
const output = path.resolve('.git/codex-runtime/objects-export-browser');
const scene = { id:'objects-export-regression',sceneName:'Object export regression',sceneVersion:1,sceneType:'其他',sceneIntroduction:'',projectType:0,sceneSource:'INTERNAL',coverPicture:'',zip:'',hasDrawing:0 };

(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-certificate-errors','--allow-insecure-localhost','--disable-extensions','--disable-background-networking']});
  const context=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:false,viewport:{width:1440,height:1000}});
  // Dedicated unsaved fixture, so acceptance cannot modify any user's persisted project.
  await context.route('**/api/**',route=>{const request=route.request(),url=new URL(request.url());if(url.pathname===`/api/editor3d/scenes/get/${scene.id}`)return route.fulfill({json:{code:200,success:true,result:scene}});return request.method()==='GET'?route.continue():route.abort('blockedbyclient');});
  const page=await context.newPage();page.setDefaultTimeout(45_000);
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText}));
  const evidence={checks:[],errors,requests};let server,preview;const previewErrors=[],previewConsole=[],missing=[];
  const mark=(name,result)=>{evidence.checks.push({name,result});console.log(name,JSON.stringify(result));};
  try {
    await page.goto(`${baseURL}/#/editor/${scene.id}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.viewer?.renderer&&document.querySelector('.play-mode-controls'),{timeout:90_000});
    await page.evaluate(async()=>{
      const source=await fetch('/src/utils/integration/agentObjects.ts').then(r=>r.text());
      const enginePath=source.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)?.[1];if(!enginePath)throw Error('Cannot locate SDK module');
      const engine=await import(enginePath);
      const objects=await import('/src/utils/integration/agentObjects.ts'),animation=await import('/src/utils/integration/agentAnimation.ts'),exports=await import('/src/utils/common/sceneExport.ts'),imports=await import('/src/utils/integration/agentImports.ts');
      const test=window.__objectExport={engine,objects,animation,exports,imports};
      test.batch=operations=>{
        const refs=new Map();const ctx={steps:[],cleanup:[],register(ref,obj){refs.set(ref,obj);},resolve(target){const object=target.ref?refs.get(target.ref):engine.App.scene.getObjectByProperty('uuid',target.uuid);if(!object)throw Error('Unknown target');return object;}};
        try{for(const operation of operations)if(!objects.prepareObjectOperation(operation,ctx)&&!animation.prepareAnimationOperation(operation,ctx)&&!imports.prepareImportOperation(operation,ctx))throw Error('Unsupported fixture operation');const command=new engine.AtomicBatchCommand(ctx.steps,'Browser acceptance');command.execute();return{command,refs};}catch(error){ctx.cleanup.reverse().forEach(cleanup=>cleanup());throw error;}
      };
    });
    const membership=await page.evaluate(async()=>{
      const t=window.__objectExport,{App}=t.engine;
      const group=t.batch([{type:'create',kind:'Group',ref:'fx',name:'FX group'},{type:'create',kind:'particle',preset:'smoke',ref:'smoke',name:'Smoke fixture',parent:{ref:'fx'},position:[-2,0,0]},{type:'create',kind:'billboard',ref:'label',name:'Label fixture',parent:{ref:'fx'},position:[0,3,0],options:{text:{value:'Original label',visible:true,fontSize:32}}}]);
      const particle=group.refs.get('smoke'),billboard=group.refs.get('label');await new Promise(r=>setTimeout(r,350));
      const system=window.viewer.modules.particleSystem;
      const attached=system.spriteSystem.emitters.includes(particle.emitter),initialMap=billboard.material.map,initialMaterial=billboard.material;
      const clone=t.batch([{type:'clone',target:{uuid:billboard.uuid},ref:'copy',name:'Label clone',position:[3,3,0]}]);const copy=clone.refs.get('copy');
      t.batch([{type:'billboard',target:{uuid:copy.uuid},options:{text:{value:'Edited clone'}}}]);
      if(billboard.material!==initialMaterial||billboard.material.map!==initialMap||billboard.options.text.value!=='Original label')throw Error('Billboard clone changed its source');
      const removed=t.batch([{type:'remove',target:{uuid:group.refs.get('fx').uuid}}]);
      const afterRemove=system.spriteSystem.emitters.includes(particle.emitter);removed.command.undo();await new Promise(r=>setTimeout(r,200));
      const afterUndo=system.spriteSystem.emitters.includes(particle.emitter);removed.command.execute();removed.command.undo();await new Promise(r=>setTimeout(r,350));
      t.fixture={group:group.refs.get('fx'),particle,billboard,copy};
      return{attached,afterRemove,afterUndo,parent:particle.parent?.name,original:billboard.options.text.value,copy:copy.options.text.value,distinctMaterials:copy.material!==billboard.material,distinctMaps:copy.material.map!==billboard.material.map,particles:particle.emitter.particles.length,objects:App.scene.children.length};
    });
    assert.equal(membership.attached,true);assert.equal(membership.afterRemove,false);assert.equal(membership.afterUndo,true);assert.equal(membership.distinctMaterials,true);assert.equal(membership.distinctMaps,true);mark('Particle subtree remove/undo/redo and independent Billboard clone',membership);
    const roundtrip=await page.evaluate(async()=>{
      const t=window.__objectExport,{App}=t.engine;
      const source=t.batch([{type:'create',kind:'Group',ref:'assembly',name:'Roundtrip assembly'},{type:'create',kind:'mesh',ref:'body',parent:{ref:'assembly'},name:'Animated body',geometry:{type:'torusknot',parameters:{radius:1,tube:.2,tubularSegments:32,radialSegments:8}},position:[0,1,0]},{type:'animation',target:{ref:'body'},action:'create',name:'Lift',tracks:[{name:'.position',type:'vector',times:[0,1],values:[0,1,0,0,2,0]}]}]);
      const root=source.refs.get('assembly'),body=source.refs.get('body');App.scripts[body.uuid]=[{name:'roundtrip-script',source:'function update(){ this.rotation.y += 0.001; }',params:{speed:2}}];
      const ids=new Set();root.traverse(child=>ids.add(child.uuid));const results=[];
      for(const format of ['json','glb']){
        const exported=await t.exports.createSceneExport({format,object:root,name:'Roundtrip'}),url=URL.createObjectURL(exported),jobId=crypto.randomUUID();
        try{
          t.imports.agentModelJobs.start(jobId,{url,name:exported.name});
          let status;for(let i=0;i<200;i++){status=t.imports.agentModelJobs.status(jobId);if(status.state!=='preparing')break;await new Promise(r=>setTimeout(r,50));}
          if(status.state!=='ready')throw Error('Import failed: '+JSON.stringify(status));
          const prepared=t.imports.agentModelJobs.ready(jobId);let meshes=0,collisions=0;prepared.object.traverse(child=>{if(child.isMesh)meshes++;if(ids.has(child.uuid))collisions++;});
          const detached=prepared.object.parent===null;
          const inserted=t.batch([{type:'insert-model',jobId,ref:'roundtrip'}]);t.imports.agentModelJobs.consume(jobId);
          const imported=inserted.refs.get('roundtrip');const reexported=await t.exports.createSceneExport({format,object:imported});
          let clips=0;imported.traverse(child=>clips+=child.animations.length);
          const scripts=Object.values(prepared.scripts).flat().length;
          results.push({format,size:exported.size,reexported:reexported.size,meshes,collisions,detached,attached:imported.parent===App.scene,clips,scripts});
        }finally{URL.revokeObjectURL(url);}
      }
      return results;
    });
    for(const result of roundtrip){assert.ok(result.size>100);assert.ok(result.reexported>100);assert.equal(result.meshes,1);assert.equal(result.collisions,0);assert.equal(result.detached,true);assert.equal(result.attached,true);assert.ok(result.clips>0);if(result.format==='json')assert.equal(result.scripts,1);}mark('GLB and JSON import, UUID isolation, animation, script and re-export',roundtrip);
    const packed=await page.evaluate(async()=>{
      const t=window.__objectExport,{App}=t.engine;const before=App.project.getKey('sceneInfo.zip');const file=await t.exports.createSceneExport({format:'standalone'});
      const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return{data:btoa(text),size:file.size,name:file.name,before,after:App.project.getKey('sceneInfo.zip')};
    });
    assert.equal(packed.before,packed.after);const zipBytes=Buffer.from(packed.data,'base64');await fs.writeFile(path.join(output,packed.name),zipBytes);
    const zip=await JSZip.loadAsync(zipBytes),files=new Map();for(const entry of Object.values(zip.files))if(!entry.dir)files.set(entry.name,await entry.async('nodebuffer'));
    server=http.createServer((request,response)=>{
      const pathname=decodeURIComponent(new URL(request.url,'http://local').pathname);const name=pathname.replace(/^\/nested\/preview\//,'');const value=files.get(name);
      if(!value){missing.push(pathname);response.writeHead(404);response.end('Missing '+pathname);return;}
      const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.zip':'application/zip'};response.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'});response.end(value);
    });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    preview=await context.newPage();preview.on('pageerror',error=>previewErrors.push(error.stack||error.message));preview.on('console',message=>{if(['error','warning'].includes(message.type()))previewConsole.push(message.text());});
    // A system download manager on this workstation intercepts HTTP *.zip fetches.
    // Feed package responses in-memory, with no attachment/navigation or system download.
    await preview.route('**/packages/*.zip',route=>{const pathname=decodeURIComponent(new URL(route.request().url()).pathname);const value=files.get(pathname.replace(/^\/nested\/preview\//,''));if(!value)return route.abort();return route.fulfill({status:200,contentType:'application/octet-stream',body:value});});
    preview.on('download',download=>{void download.cancel();previewErrors.push('Unexpected browser download: '+download.suggestedFilename());});
    await preview.goto(`http://127.0.0.1:${server.address().port}/nested/preview/index.html`);
    await preview.waitForFunction(()=>!document.getElementById('status')||/timeout|Error|failed/i.test(document.getElementById('status').textContent),undefined,{timeout:45_000});
    const rendered=await preview.evaluate(()=>({status:document.getElementById('status')?.textContent||'',objects:window.viewer?.scene.children.length,names:window.viewer?.scene.children.map(child=>child.name),webgl:!!window.viewer?.renderer.getContext(),scripts:window.viewer?.enableScript}));
    assert.equal(rendered.status,'');assert.ok(rendered.webgl);assert.ok(rendered.names.includes('FX group'));assert.ok(rendered.names.includes('Roundtrip assembly'));assert.equal(missing.filter(name=>!name.endsWith('/favicon.ico')).length,0,JSON.stringify(missing));assert.deepEqual(previewErrors,[]);
    await preview.screenshot({path:path.join(output,'standalone.png')});mark('Standalone served under nested HTTP path loads real WebGL scene', {...rendered,bytes:packed.size,files:files.size,missing});
    await page.screenshot({path:path.join(output,'editor.png')});console.log('PASS object/export browser regression');
  }catch(error){console.error('Page errors:',errors);console.error('Failed requests:',requests);if(preview){const state=await preview.evaluate(()=>({status:document.getElementById('status')?.textContent,names:window.viewer?.scene.children.map(child=>child.name)})).catch(()=>null);console.error('Standalone failure:',JSON.stringify({state,previewErrors,previewConsole,missing}));evidence.standaloneFailure={state,previewErrors,previewConsole,missing};}throw error;}
  finally{await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));if(server)await new Promise(resolve=>server.close(resolve));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
