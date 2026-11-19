const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const THREE=require('../../packages/editor/node_modules/three');
const JSZip=require('../../packages/editor/node_modules/jszip');
const baseURL=process.env.EDITOR_URL||'https://localhost:8090';
const scene={id:'import-browser-regression',sceneName:'Import browser regression',sceneVersion:1,sceneType:'其他',sceneIntroduction:'',projectType:0,sceneSource:'INTERNAL',coverPicture:'',zip:'',hasDrawing:0};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hS8AAAAASUVORK5CYII=','base64');
const root=path.resolve(__dirname,'../..');

async function fixtures(){
  const data=new THREE.DataTexture(new Uint8Array([255,128,0,255]),1,1);
  const object=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:data}));object.name='JSON dependency probe';
  object.animations=[new THREE.AnimationClip('move',1,[new THREE.VectorKeyframeTrack(`${object.uuid}.position`,[0,1],[0,0,0,1,0,0])])];
  const json=object.toJSON();json.images[0].url='../textures/checker.png';json.scripts={[object.uuid]:[{name:'imported',source:'globalThis.__importScriptRan=(globalThis.__importScriptRan||0)+1; function loaded(){}',params:{}}]};
  const archive=new JSZip();archive.file('models/scene.json',JSON.stringify(json));archive.file('textures/checker.png',png);
  const invalid=structuredClone(json);invalid.object.name='Failed dependency probe';invalid.images[0].url='../textures/broken.png';
  const routes=new Map([
    ['/test-import/json/models/scene.json',{contentType:'application/json',body:Buffer.from(JSON.stringify(json))}],
    ['/test-import/json/textures/checker.png',{contentType:'image/png',body:png}],
    ['/test-import/bad/models/scene.json',{contentType:'application/json',body:Buffer.from(JSON.stringify(invalid))}],
    ['/test-import/bad/textures/broken.png',{contentType:'image/png',body:Buffer.from('not an image')}],
    ['/test-import/bundle.zip',{contentType:'application/zip',body:await archive.generateAsync({type:'nodebuffer'})}],
    ['/test-import/sofa.glb',{contentType:'model/gltf-binary',body:await fs.readFile(path.join(root,'packages/editor/public/static/model/furniture/Sofa_astral3d.optimize.glb'))}],
    ['/test-import/tree.glb',{contentType:'model/gltf-binary',body:await fs.readFile(path.join(root,'packages/editor/public/static/model/plant/SmallTree_astral3d.optimize.glb'))}],
  ]);
  // Make a real Rhino mesh using the locally installed WASM, without downloads.
  const rhino=await require('../../packages/editor/node_modules/rhino3dm')();
  const doc=new rhino.File3dm(),mesh=new rhino.Mesh(),attrs=new rhino.ObjectAttributes();attrs.name='Rhino triangle';
  mesh.vertices().add(0,0,0);mesh.vertices().add(1,0,0);mesh.vertices().add(0,1,0);mesh.faces().addTriFace(0,1,2);mesh.normals().computeNormals();doc.objects().addMesh(mesh,attrs);
  routes.set('/test-import/triangle.3dm',{contentType:'application/octet-stream',body:Buffer.from(doc.toByteArray())});
  mesh.delete();attrs.delete();doc.delete();
  return{routes,json};
}

async function run(){
  const {routes,json}=await fixtures();
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-certificate-errors','--allow-insecure-localhost']});
  const context=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:false,viewport:{width:1280,height:900}});
  const requests=[],pageErrors=[];let delayedResponse,delayStarted,delayDecoder=false,decoderResponse,decoderStarted;
  const gate=new Promise(resolve=>{delayStarted=resolve});
  const decoderGate=new Promise(resolve=>{decoderStarted=resolve});
  await context.route('**/assets/libs/draco/gltf/draco_decoder.wasm',async route=>{
    if(!delayDecoder)return route.continue();
    decoderResponse=async()=>route.fulfill({contentType:'application/wasm',body:await fs.readFile(path.join(root,'packages/sdk/public/libs/draco/gltf/draco_decoder.wasm'))});decoderStarted();
  });
  await context.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname===`/api/editor3d/scenes/get/${scene.id}`)return route.fulfill({json:{code:200,success:true,result:scene}});
    return request.method()==='GET'?route.continue():route.abort('blockedbyclient');
  });
  await context.route('**/test-import/**',async route=>{
    const url=new URL(route.request().url()),fixture=routes.get(url.pathname);
    requests.push(url.pathname);
    if(url.pathname==='/test-import/delayed.glb') {delayedResponse=()=>route.fulfill(routes.get('/test-import/sofa.glb'));delayStarted();return;}
    return fixture?route.fulfill(fixture):route.fulfill({status:404,body:'missing fixture'});
  });
  await context.route('**/agent/artifacts/import-fixture/**',route=>{
    assert.equal(route.request().headers().authorization,'Bearer import-browser-token');
    const pathname=new URL(route.request().url()).pathname.replace('/agent/artifacts/import-fixture/files/','/test-import/json/');
    requests.push(`authenticated:${pathname}`);return route.fulfill(routes.get(pathname)||{status:404,body:'missing authenticated fixture'});
  });
  const page=await context.newPage();page.setDefaultTimeout(30_000);page.on('pageerror',error=>pageErrors.push(error.message));page.on('download',()=>{throw Error('Regression must never initiate browser downloads');});
  async function poll(ids){
    for(let i=0;i<240;i++){
      const statuses=await page.evaluate(ids=>ids.map(id=>window.__imports.agentModelJobs.status(id)),ids);
      if(statuses.every(status=>status.state!=='preparing'))return statuses;
      await page.waitForTimeout(250);
    }
    throw Error(`Import timeout: ${ids.join(', ')}`);
  }
  async function ready(ids){const states=await poll(ids);for(const state of states)assert.equal(state.state,'ready',JSON.stringify(state));return states;}
  try{
    await page.goto(`${baseURL}/#/editor/${scene.id}`,{waitUntil:'domcontentloaded',timeout:90_000});
    await page.waitForFunction(()=>window.viewer?.renderer&&document.querySelector('.play-mode-controls'),null,{timeout:90_000});
    await page.evaluate(async()=>{
      const source=await fetch('/src/utils/integration/agentImports.ts').then(r=>r.text());
      const sdk=source.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)[1];
      window.__engine=await import(sdk);window.__imports=await import('/src/utils/integration/agentImports.ts');window.__state=await import('/src/utils/integration/agentState.ts');
      window.__state.agentState.sessionId='import-browser-session';
      (await import('/src/utils/integration/agentFiles.ts')).setAgentFileToken('import-browser-token');
      window.__baseline=window.__engine.App.scene.children.map(o=>o.uuid);
      const NativeWorker=window.Worker;window.__workers={created:0,terminated:0,active:0,peak:0};
      window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.__alive=true;window.__workers.created++;window.__workers.active++;window.__workers.peak=Math.max(window.__workers.peak,window.__workers.active);}terminate(){if(this.__alive){this.__alive=false;window.__workers.active--;window.__workers.terminated++;}return super.terminate();}};
      const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.__blobUrls=new Set();
      URL.createObjectURL=value=>{const url=create(value);window.__blobUrls.add(url);return url;};URL.revokeObjectURL=url=>{window.__blobUrls.delete(url);revoke(url);};
      const dispose=window.__engine.THREE.BufferGeometry.prototype.dispose;window.__disposedGeometries=[];
      window.__engine.THREE.BufferGeometry.prototype.dispose=function(){window.__disposedGeometries.push(this.uuid);return dispose.call(this);};
    });

    await page.evaluate(()=>{
      window.__imports.agentModelJobs.start('concurrent-sofa',{url:'/test-import/sofa.glb'});
      window.__imports.agentModelJobs.start('concurrent-tree',{url:'/test-import/tree.glb'});
    });
    const concurrent=await ready(['concurrent-sofa','concurrent-tree']);
    const workers=await page.evaluate(()=>window.__workers);assert.ok(workers.created>=2);assert.equal(workers.active,0);console.log('Concurrent real Draco glTF:',JSON.stringify({concurrent,workers}));

    await page.evaluate(()=>window.__imports.agentModelJobs.start('json-auth',{artifact:{name:'models/scene.json',entryPath:'models/scene.json',files:[{path:'models/scene.json',url:'/agent/artifacts/import-fixture/files/models/scene.json'},{path:'textures/checker.png',url:'/agent/artifacts/import-fixture/files/textures/checker.png'}]}}));
    await ready(['json-auth']);
    const jsonResult=await page.evaluate(original=>{
      const prepared=window.__imports.agentModelJobs.ready('json-auth'),object=prepared.object;
      const serialized=object.toJSON();
      return{uuid:object.uuid,original,scriptKeys:Object.keys(prepared.scripts),script:prepared.scripts[object.uuid][0].source,executed:window.__importScriptRan||0,mapLoaded:object.material.map.image.width,track:object.animations[0].tracks[0].name,embedded:typeof serialized.images[0].url==='string'&&serialized.images[0].url.startsWith('data:image/'),sceneUnchanged:JSON.stringify(window.__baseline)===JSON.stringify(window.__engine.App.scene.children.map(o=>o.uuid))};
    },json.object.uuid);
    assert.notEqual(jsonResult.uuid,jsonResult.original);assert.deepEqual(jsonResult.scriptKeys,[jsonResult.uuid]);assert.equal(jsonResult.executed,0);assert.equal(jsonResult.mapLoaded,1);assert.ok(jsonResult.track.startsWith(jsonResult.uuid));assert.equal(jsonResult.embedded,true);assert.equal(jsonResult.sceneUnchanged,true);console.log('Authenticated JSON dependency + scripts + animation UUID remapping:',JSON.stringify(jsonResult));

    await page.evaluate(()=>window.__imports.agentModelJobs.start('zip-json',{url:'/test-import/bundle.zip',name:'bundle.zip',entry:'models/scene.json'}));
    await ready(['zip-json']);console.log('In-memory ZIP dependency bundle: ready');
    await page.evaluate(()=>window.__imports.agentModelJobs.start('rhino',{url:'/test-import/triangle.3dm'}));
    const rhino=await ready(['rhino']);assert.ok(rhino[0].meshes>0);console.log('Locally generated Rhino WASM model:',JSON.stringify(rhino));

    const beforeUrls=await page.evaluate(()=>window.__blobUrls.size);
    await page.evaluate(()=>window.__imports.agentModelJobs.start('bad-image',{url:'/test-import/bad/models/scene.json',name:'models/scene.json',files:[{path:'textures/broken.png',url:'/test-import/bad/textures/broken.png'}]}));
    const failed=(await poll(['bad-image']))[0];assert.equal(failed.state,'failed');
    const failedCleanup=await page.evaluate(uuid=>({disposed:window.__disposedGeometries.includes(uuid),urls:window.__blobUrls.size,sceneUnchanged:JSON.stringify(window.__baseline)===JSON.stringify(window.__engine.App.scene.children.map(o=>o.uuid))}),json.geometries[0].uuid);
    assert.equal(failedCleanup.disposed,true);assert.equal(failedCleanup.urls,beforeUrls);assert.equal(failedCleanup.sceneUnchanged,true);console.log('Failed image frees parsed geometry and blob URLs:',JSON.stringify({failed,failedCleanup}));

    const cancelled=await page.evaluate(()=>{
      const value=window.__imports.agentModelJobs.ready('json-auth');const resources=[value.object.geometry,value.object.material,value.object.material.map];let disposed=0;for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
      const status=window.__imports.agentModelJobs.cancel('json-auth');let cannotUse=false;try{window.__imports.agentModelJobs.ready('json-auth');}catch{cannotUse=true;}
      return{status,disposed,expected:resources.length,cannotUse};
    });assert.equal(cancelled.disposed,cancelled.expected);assert.equal(cancelled.cannotUse,true);console.log('Cancelling prepared resources:',JSON.stringify(cancelled));
    await page.evaluate(()=>window.__imports.agentModelJobs.start('cancel-fetch',{url:'/test-import/delayed.glb'}));await gate;
    await page.evaluate(()=>window.__imports.agentModelJobs.cancel('cancel-fetch'));await delayedResponse().catch(()=>{});
    assert.equal((await poll(['cancel-fetch']))[0].state,'cancelled');

    delayDecoder=true;
    const beforeDecoder=await page.evaluate(()=>({workers:window.__workers.active,urls:window.__blobUrls.size}));
    await page.evaluate(()=>window.__imports.agentModelJobs.start('cancel-decoder',{url:'/test-import/sofa.glb'}));await decoderGate;
    await page.evaluate(()=>window.__imports.agentModelJobs.cancel('cancel-decoder'));await decoderResponse();
    await page.waitForTimeout(750);
    const cancelledDecoder=await page.evaluate(()=>({state:window.__imports.agentModelJobs.status('cancel-decoder'),workers:window.__workers.active,urls:window.__blobUrls.size}));
    assert.equal(cancelledDecoder.state.state,'cancelled');assert.equal(cancelledDecoder.workers,beforeDecoder.workers,'A decoder finishing initialization after cancellation must not start new workers');assert.equal(cancelledDecoder.urls,beforeDecoder.urls);console.log('Cancellation during decoder initialization:',JSON.stringify(cancelledDecoder));

    const stale=await page.evaluate(()=>{
      const value=window.__imports.agentModelJobs.ready('zip-json');let disposed=0;value.object.geometry.addEventListener('dispose',()=>disposed++);
      window.__state.setAgentSceneState('loading','replacement-document');
      const state=window.__imports.agentModelJobs.status('zip-json');let blocked='';try{window.__imports.agentModelJobs.ready('zip-json');}catch(error){blocked=error.message;}
      return{state,blocked,disposed,workers:window.__workers.active,sceneUnchanged:JSON.stringify(window.__baseline)===JSON.stringify(window.__engine.App.scene.children.map(o=>o.uuid))};
    });assert.equal(stale.state.phase,'stale');assert.match(stale.blocked,/previous editor document/);assert.equal(stale.disposed,1);assert.equal(stale.workers,0);assert.equal(stale.sceneUnchanged,true);console.log('Cross-document jobs are stale and disposed:',JSON.stringify(stale));
    assert.ok(requests.some(value=>value.startsWith('authenticated:')));console.log('PASS import browser regression');
  }catch(error){console.error('Page errors:',pageErrors);console.error('Import states:',await page.evaluate(()=>window.__imports?['concurrent-sofa','concurrent-tree','json-auth','zip-json','rhino','bad-image'].map(id=>window.__imports.agentModelJobs.status(id)):[]).catch(()=>[]));throw error;}
  finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
