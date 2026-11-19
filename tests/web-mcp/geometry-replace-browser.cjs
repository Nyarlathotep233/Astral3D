// Isolated reproduction only. Never saves, downloads, or visits the live acceptance scene.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const base=process.env.EDITOR_URL||'https://localhost:8090';
const scene={id:'geometry-replace-regression',sceneName:'Geometry replacement regression',sceneVersion:1,sceneType:'其他',sceneIntroduction:'',projectType:0,sceneSource:'INTERNAL',coverPicture:'',zip:'',hasDrawing:0};
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-certificate-errors','--disable-extensions']});
  const context=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:false});
  await context.route('**/api/**',route=>{const request=route.request();if(new URL(request.url()).pathname===`/api/editor3d/scenes/get/${scene.id}`)return route.fulfill({json:{code:200,success:true,result:scene}});return request.method()==='GET'?route.continue():route.abort('blockedbyclient');});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
  const report={cases:[],errors};
  try{
    await page.goto(`${base}/#/editor/${scene.id}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.viewer?.renderer&&document.querySelector('.play-mode-controls'),undefined,{timeout:60000});
    await page.evaluate(async()=>{
      const source=await fetch('/src/utils/integration/agentObjects.ts').then(r=>r.text());const engine=await import(source.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)[1]);
      window.__geometry={engine,objects:await import('/src/utils/integration/agentObjects.ts'),runtime:await import('/src/utils/integration/agentRuntime.ts')};
      window.__geometry.batch=operations=>{const t=window.__geometry,refs=new Map(),ctx={steps:[],cleanup:[],register(ref,object){refs.set(ref,object);},resolve(target){const value=target.ref?refs.get(target.ref):t.engine.App.scene.getObjectByProperty('uuid',target.uuid);if(!value)throw Error('Unknown target');return value;}};for(const op of operations)if(!t.objects.prepareObjectOperation(op,ctx))throw Error('Unsupported op');const command=new t.engine.AtomicBatchCommand(ctx.steps);command.execute();return{refs,command};};
      const t=window.__geometry;const created=t.batch([{type:'create',kind:'Group',ref:'assembly',name:'Replacement assembly'},...Array.from({length:5},(_,i)=>({type:'create',kind:'mesh',ref:'base'+i,parent:{ref:'assembly'},name:'Base '+i,geometry:{type:'box',parameters:{width:4,height:.5,depth:4}},position:[i*5,0,0]}))]);t.group=created.refs.get('assembly');t.meshes=Array.from({length:5},(_,i)=>created.refs.get('base'+i));
    });
    for(const selection of ['group','none','mesh']){
      const result=await page.evaluate(async selection=>{
        const t=window.__geometry,{App,Package}=t.engine;
        if(selection==='group')App.select(t.group);else if(selection==='mesh')App.select(t.meshes[0]);else App.deselect();
        const operation=t.batch(t.meshes.map(object=>({type:'geometry',target:{uuid:object.uuid},geometry:{type:'extrude',shapes:[{points:[[-2,-2],[2,-2],[2,2],[-2,2]]}],options:{depth:.4,bevelEnabled:true,bevelThickness:.12,bevelSize:.12,bevelSegments:3}}})));
        await new Promise(resolve=>setTimeout(resolve,400));
        const types=t.meshes.map(object=>({name:object.name,geometryType:object.geometry?.type,vertices:object.geometry?.attributes.position.count,parameterShapes:object.geometry?.parameters?.shapes.length}));
        const instance=new Package(window.viewer),files=[];let error;
        try{await instance.pack({name:'replace-'+selection,layer:2,zipUploadFun:async file=>{files.push({name:file.name,size:file.size});return file.name;}});}catch(e){error=e.stack||e.message;}finally{instance.dispose();}
        // Exercise geometry normal and center paths as subsequent reversible steps.
        for(const action of ['normals','center']){const edit=t.batch([{type:'geometry',target:{uuid:t.meshes[0].uuid},action}]);JSON.stringify(t.meshes[0].toJSON());edit.command.undo();}
        operation.command.undo();
        return{selection,types,files,error,restoredTypes:t.meshes.map(object=>object.geometry.type)};
      },selection);
      report.cases.push(result);console.log('Geometry replacement pack',JSON.stringify(result));
      assert.equal(result.error,undefined);assert.ok(result.files.every(file=>file.size>100));assert.ok(result.types.every(object=>object.geometryType==='ExtrudeGeometry'&&object.vertices>3));
    }
    const preview=await page.evaluate(async()=>{const t=window.__geometry;t.engine.App.select(t.group);t.batch(t.meshes.map(object=>({type:'geometry',target:{uuid:object.uuid},geometry:{type:'extrude',shapes:[{points:[[-2,-2],[2,-2],[2,2],[-2,2]]}],options:{depth:.4,bevelEnabled:true,bevelThickness:.12,bevelSize:.12,bevelSegments:3}}})));return t.runtime.agentPlay('start');});
    for(let i=0;i<100;i++){const status=await page.evaluate(()=>window.__geometry.runtime.agentPlay('status'));if(status.state==='running'||status.state==='failed'){report.preview=status;break;}await page.waitForTimeout(200);}
    if(!report.preview)report.preview=await page.evaluate(()=>window.__geometry.runtime.agentPlay('status'));
    console.log('Preview after extrude replacement',JSON.stringify(report.preview));await page.evaluate(()=>window.__geometry.runtime.agentPlay('stop'));
    report.missingGeometry=await page.evaluate(()=>{const result=[];window.__geometry.engine.App.scene.traverse(object=>{if((object.isMesh||object.isLine||object.isPoints)&&!object.geometry)result.push({uuid:object.uuid,name:object.name,type:object.type});});return result;});
    console.log('Page errors:',JSON.stringify(errors));assert.equal(report.preview.state,'running');assert.deepEqual(report.missingGeometry,[]);assert.deepEqual(errors,[],'Geometry changes must not mount a parameter panel for an unselected object');
  }finally{await fs.mkdir(path.resolve('.git/codex-runtime/geometry-replace'),{recursive:true});await fs.writeFile(path.resolve('.git/codex-runtime/geometry-replace/evidence.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
