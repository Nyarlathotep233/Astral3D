// Real WebGL + Package round trip, with all project writes blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.EDITOR_URL || 'https://localhost:8090';
const scene = { id:'complex-runtime-regression',sceneName:'Complex runtime regression',sceneVersion:1,sceneType:'其他',sceneIntroduction:'',projectType:0,sceneSource:'INTERNAL',coverPicture:'',zip:'',hasDrawing:0 };
const output = path.resolve('.git/codex-runtime/complex-runtime');
const files = new Map();

async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--ignore-certificate-errors','--allow-insecure-localhost']});
  const context = await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    if(window.parent===window)return;
    window.addEventListener('message',event=>{
      if(event.data?.type==='h3d:play:load'&&localStorage.getItem('runtime-regression-missing-package')==='true')event.data.packages.pop();
    });
  });
  await context.route('**/api/**',route=>{
    const request=route.request();
    if(new URL(request.url()).pathname===`/api/editor3d/scenes/get/${scene.id}`)return route.fulfill({json:{code:200,success:true,result:scene}});
    return request.method()==='GET'?route.continue():route.abort('blockedbyclient');
  });
  // ZIP bytes are served in memory; no browser download manager is invoked.
  await context.route('**/file/static/runtime-regression/**',route=>{
    const file=files.get(decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()));
    return file?route.fulfill({status:200,contentType:'application/zip',body:file}):route.fulfill({status:404,body:'missing regression package'});
  });
  const page=await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function modules() {
    await page.waitForFunction(()=>window.viewer?.renderer&&document.querySelector('.play-mode-controls'),null,{timeout:60000});
    await page.evaluate(async()=>{
      const src=await fetch('/src/utils/integration/agentMaterials.ts').then(r=>r.text());
      const engine=await import(src.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)[1]);
      window.__regression={engine,runtime:await import('/src/utils/integration/agentRuntime.ts'),editor:await import('/src/utils/integration/agentEditor.ts'),state:await import('/src/utils/integration/agentState.ts')};
    });
  }
  async function ready() {
    for(let i=0;i<120;i++) {
      const status=await page.evaluate(()=>window.__regression.state.agentState.sceneState);
      if(status==='ready')return;
      if(status==='error')throw Error(`Authoring load failed: ${JSON.stringify(errors)}`);
      await page.waitForTimeout(250);
    }
    throw Error(`Authoring package remains loading: ${JSON.stringify(errors)}`);
  }
  try {
    await page.goto(`${base}/#/editor/${scene.id}`,{waitUntil:'domcontentloaded'});await modules();await ready();
    const created=await page.evaluate(async()=>{
      const {editor,state:{agentState},engine:{App,THREE}}=window.__regression;
      const operations=[
        {type:'create',kind:'Group',ref:'campus',name:'Runtime campus'},
        {type:'create',kind:'mesh',ref:'rootMesh',parent:{ref:'campus'},name:'Mesh package root',geometry:{type:'box',parameters:{width:15,height:.2,depth:15}},position:[0,-.3,0]},
        {type:'create',kind:'Group',ref:'plaza',parent:{ref:'rootMesh'},name:'Fountain plaza'},
        {type:'create',kind:'Group',ref:'waterworks',parent:{ref:'plaza'},name:'Waterworks'},
        {type:'create',kind:'mesh',ref:'basin',parent:{ref:'waterworks'},name:'Basin',geometry:{type:'cylinder',parameters:{radiusTop:4,radiusBottom:4,height:.5,radialSegments:48}}},
        {type:'material-create',target:{ref:'basin'},kind:'MeshStandardMaterial',values:{color:'#69777b',roughness:.8}},
        {type:'create',kind:'mesh',ref:'water',parent:{ref:'waterworks'},name:'Rippled teal water',geometry:{type:'circle',parameters:{radius:3.6,segments:64}},rotation:[-Math.PI/2,0,0],position:[0,.3,0]},
        {type:'material-create',target:{ref:'water'},kind:'ShaderMaterial',name:'Animated water',side:2,uniforms:{time:{type:'float',value:0}},vertexShader:'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 p; uniform float time; void main(){float wave=.5+.5*sin(length(p)*8.-time*3.);gl_FragColor=vec4(vec3(.02,.25,.32)+wave*vec3(.08,.25,.25),1.);}'},
        {type:'create',kind:'Group',ref:'jets',parent:{ref:'waterworks'},name:'Pulsing water jets'},
        ...Array.from({length:6},(_,i)=>({type:'create',kind:'mesh',ref:`jet${i}`,parent:{ref:'jets'},name:`Water arc ${i}`,geometry:{type:'tube',parameters:{path:{type:'quadratic',points:[[0,.4,0],[1.5,4,0],[3,.4,0]]},radius:.06,tubularSegments:24,radialSegments:6}},rotation:[0,i*Math.PI/3,0]})),
        {type:'script-add',target:{ref:'jets'},name:'Pulse jets and water ripples',source:"let phase=0; function beforeAnimation(delta){phase+=Math.min(delta,.1);this.scale.y=1+.23*Math.sin(phase*2);this.parent.getObjectByName('Rippled teal water').material.uniforms.time.value=phase;render();}"},
        {type:'create',kind:'DirectionalLight',ref:'sun',position:[6,10,7]},
        {type:'create',kind:'AmbientLight',ref:'ambient'},
        {type:'view',action:'frame',target:{ref:'plaza'}},
      ];
      await editor.executeAgentRequest('h3d_scene_batch',{sessionId:agentState.sessionId,documentEpoch:agentState.documentEpoch,sceneId:agentState.sceneId,expectedRevision:agentState.revision,operationId:crypto.randomUUID(),operations});
      // Shared resources across sibling packages and array-valued materials are
      // the dependency pattern that used to poll forever in Package.unpack.
      const a=new THREE.Group(),b=new THREE.Group();a.name='Shared A';b.name='Shared B';
      const geometry=new THREE.BoxGeometry(.5,.5,.5),material=new THREE.MeshStandardMaterial({color:'#ddaa33'});
      for(const group of[a,b]) {const mesh=new THREE.Mesh(geometry,[material,material]);mesh.name=`${group.name} mesh`;group.add(mesh);App.addObject(group);}
      a.position.set(-5,1,0);b.position.set(5,1,0);
      const water=App.scene.getObjectByName('Rippled teal water'),jets=App.scene.getObjectByName('Pulsing water jets');
      const objects=[];App.scene.traverseByCondition(o=>objects.push(o.uuid),o=>!o.ignore);
      return{water:water.uuid,jets:jets.uuid,fragment:water.material.fragmentShader,script:App.scripts[jets.uuid][0].source,objects};
    });
    const packed=await page.evaluate(async()=>{
      const snapshot=await window.__regression.runtime.packAuthoringSnapshot('complex-persistence');
      return{first:snapshot.firstPackageName,files:await Promise.all(snapshot.packages.map(async file=>({name:file.name,data:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob([file.buffer]));})})))};
    });
    for(const file of packed.files)files.set(file.name,Buffer.from(file.data,'base64'));
    scene.zip=`runtime-regression/${packed.first}`;
    await page.reload({waitUntil:'domcontentloaded'});await modules();await ready();
    const restored=await page.evaluate(({water,jets})=>{const {App}=window.__regression.engine;const object=App.scene.getObjectByProperty('uuid',water),scriptObject=App.scene.getObjectByProperty('uuid',jets);const uuids=[];App.scene.traverseByCondition(o=>uuids.push(o.uuid),o=>!o.ignore);return{fragment:object?.material.fragmentShader,script:App.scripts[jets]?.[0]?.source,scale:scriptObject?.scale.y,time:object?.material.uniforms.time.value,uuids};},created);
    assert.equal(restored.fragment,created.fragment);assert.equal(restored.script,created.script);
    assert.equal(new Set(restored.uuids).size,restored.uuids.length,'Reload must not duplicate object UUIDs');
    for(const uuid of created.objects.filter(uuid=>uuid!==created.objects[0]))assert(restored.uuids.includes(uuid),`Lost authored object ${uuid}`);
    await page.evaluate(()=>window.__regression.runtime.agentPlay('start'));
    for(let i=0;i<120;i++){
      const status=await page.evaluate(()=>window.__regression.runtime.agentPlay('status'));
      if(status.state==='running')break;
      if(status.state==='failed')throw Error(status.error);
      await page.waitForTimeout(250);
    }
    assert.equal((await page.evaluate(()=>window.__regression.runtime.agentPlay('status'))).state,'running');
    const motion=await page.evaluate(async({water,jets})=>{
      const {App}=window.__regression.engine,runtime=document.querySelector('.play-mode-runtime iframe').contentWindow.viewer;
      const w=runtime.scene.getObjectByProperty('uuid',water),j=runtime.scene.getObjectByProperty('uuid',jets),before={scale:j.scale.y,time:w.material.uniforms.time.value};
      await new Promise(resolve=>setTimeout(resolve,350));
      return{before,after:{scale:j.scale.y,time:w.material.uniforms.time.value},author:{scale:App.scene.getObjectByProperty('uuid',jets).scale.y,time:App.scene.getObjectByProperty('uuid',water).material.uniforms.time.value},capture:await window.__regression.runtime.agentCapture({target:'runtime',width:1280,height:800})};
    },created);
    assert.notEqual(motion.after.scale,motion.before.scale);assert(motion.after.time>motion.before.time);
    assert.equal(motion.author.scale,restored.scale);assert.equal(motion.author.time,restored.time);
    fs.writeFileSync(path.join(output,'runtime.png'),Buffer.from(motion.capture.data,'base64'));
    delete motion.capture;
    await page.evaluate(()=>window.__regression.runtime.agentPlay('stop'));
    console.log('PASS complex package reload, unique hierarchy, GLSL/script persistence, live runtime motion, isolated authoring:',JSON.stringify(motion));
    await page.evaluate(()=>{localStorage.setItem('runtime-regression-missing-package','true');return window.__regression.runtime.agentPlay('start');});
    let failed;
    for(let i=0;i<80;i++){
      failed=await page.evaluate(()=>window.__regression.runtime.agentPlay('status'));
      if(failed.state==='failed')break;
      await page.waitForTimeout(100);
    }
    assert.equal(failed.state,'failed','A missing snapshot package must fail promptly instead of remaining loading');
    assert.match(failed.error,/missing play package/i);
    const diagnostic=await page.evaluate(()=>window.__regression.runtime.agentDiagnostics().items.find(item=>item.phase==='load'&&/missing play package/i.test(item.message)));
    assert.equal(diagnostic.runId,failed.runId);
    await page.evaluate(()=>{localStorage.removeItem('runtime-regression-missing-package');return window.__regression.runtime.agentPlay('stop');});
    console.log('PASS missing preview package fails promptly with run-bound diagnostics');
    assert.deepEqual(errors,[]);
  }catch(error){console.error('Browser errors:',errors);await page.screenshot({path:path.join(output,'failure.png')});throw error;}
  finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
