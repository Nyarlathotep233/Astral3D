const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const baseURL = process.env.EDITOR_URL || 'https://localhost:8090';
const scene = { id:'material-runtime-regression',sceneName:'Material/runtime regression',sceneVersion:1,sceneType:'其他',sceneIntroduction:'',projectType:0,sceneSource:'INTERNAL',coverPicture:'',zip:'',hasDrawing:0 };
const browser = async () => {
  const browser = await chromium.launch({ channel:'chrome',headless:true,args:['--ignore-certificate-errors','--allow-insecure-localhost'] });
  const context = await browser.newContext({ ignoreHTTPSErrors:true,viewport:{width:1440,height:1000} });
  // Only the temporary scene is mocked. Never write to a stored user project.
  await context.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname===`/api/editor3d/scenes/get/${scene.id}`)return route.fulfill({json:{code:200,success:true,result:scene}});
    if(request.method()==='GET')return route.continue();
    return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(30_000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function modules() {
    await page.evaluate(async()=>{
      const materialSource=await fetch('/src/utils/integration/agentMaterials.ts').then(r=>r.text());
      const enginePath=materialSource.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)?.[1];
      if(!enginePath)throw Error('Unable to locate Vite SDK module');
      const engine=await import(enginePath);
      window.__test={engine,three:engine.THREE,materials:await import('/src/utils/integration/agentMaterials.ts'),scripts:await import('/src/utils/integration/agentScripts.ts'),runtime:await import('/src/utils/integration/agentRuntime.ts')};
    });
  }
  try {
    await page.goto(`${baseURL}/#/editor/${scene.id}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.viewer?.renderer&&document.querySelector('.play-mode-controls'),{timeout:90_000});
    await modules();
    const gpu=await page.evaluate(async()=>{
      const {engine:{App,AtomicBatchCommand},three:THREE,materials}=window.__test;
      const object=new window.__test.engine.Box();object.name='GPU Recovery Probe';App.addObject(object);window.__test.object=object;
      const prepare=op=>{const ctx={resolve:()=>object,register(){},steps:[],cleanup:[]};materials.prepareMaterialOperation(op,ctx);return new AtomicBatchCommand(ctx.steps);};
      const shader=prepare({type:'material-create',target:{},kind:'ShaderMaterial',vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 tint;void main(){gl_FragColor=vec4(tint,1.0);}',uniforms:{tint:{type:'color',value:'#22aaff'}}});
      shader.execute();window.viewer.render();const validUuid=object.material.uuid;
      let error='';try{prepare({type:'material',target:{},fragmentShader:'void main(){ this_is_invalid; }'}).execute();}catch(e){error=e.message;}
      const unchanged=object.material.uuid===validUuid;
      const capture=await window.__test.runtime.agentCapture({target:'editor'});
      window.__test.installScript=(source)=>{const ctx={resolve:()=>object,register(){},steps:[],cleanup:[]};const found=App.scripts[object.uuid]?.some(s=>s.name==='animation');window.__test.scripts.prepareScriptOperation({type:found?'script-update':'script-add',target:{},name:'animation',source},ctx);new AtomicBatchCommand(ctx.steps).execute();};
      window.__test.installScript('function beforeAnimation(delta){ this.rotation.y += delta; render(); }');
      return{error,unchanged,mimeType:capture.mimeType,imageBytes:capture.data.length,webgl:window.viewer.renderer.getContext().getParameter(window.viewer.renderer.getContext().VERSION)};
    });
    assert.match(gpu.error,/GPU shader compilation failed/);assert.equal(gpu.unchanged,true);assert.ok(gpu.imageBytes>100);console.log('GPU compile, rejection, atomic rollback, capture:',JSON.stringify(gpu));
    await page.evaluate(()=>window.__test.runtime.agentPlay('start'));
    for(let i=0;i<180;i++){const status=await page.evaluate(()=>window.__test.runtime.agentPlay('status'));if(status.state==='running')break;if(status.state==='failed')throw Error(status.error);await page.waitForTimeout(500);}
    assert.equal((await page.evaluate(()=>window.__test.runtime.agentPlay('status'))).state,'running');
    console.log('Runtime frame status:', await page.evaluate(async()=>({status:await window.__test.runtime.agentPlay('status'),frames:[...document.querySelectorAll('.play-mode-runtime iframe')].map(f=>({src:f.src,viewer:!!f.contentWindow.viewer,url:f.contentWindow.location.href}))})));
    const motion=await page.evaluate(async()=>{
      const frame=document.querySelector('.play-mode-runtime iframe');const runtimeObject=frame.contentWindow.viewer.scene.getObjectByName('GPU Recovery Probe');
      const first=runtimeObject.rotation.y;await new Promise(r=>setTimeout(r,200));
      const capture=await window.__test.runtime.agentCapture({target:'runtime'});
      return{author:window.__test.object.rotation.y,before:first,after:runtimeObject.rotation.y,capture:capture.data.length};
    });
    assert.equal(motion.author,0);assert.ok(motion.after>motion.before);assert.ok(motion.capture>100);console.log('Runtime snapshot animation stays separate:',JSON.stringify(motion));
    await page.evaluate(()=>window.__test.runtime.agentPlay('stop'));
    await page.evaluate(()=>{window.__test.installScript('function loaded(){ throw new Error("diagnostic-probe"); }');});
    await page.evaluate(()=>window.__test.runtime.agentPlay('start'));
    await page.waitForFunction(()=>window.__test.runtime.agentDiagnostics().items.some(item=>item.kind==='script'&&item.scriptName==='animation'&&item.message.includes('diagnostic-probe')),{timeout:90_000});
    const diagnostic=await page.evaluate(()=>window.__test.runtime.agentDiagnostics().items.find(item=>item.kind==='script'&&item.message.includes('diagnostic-probe')));
    assert.ok(diagnostic.objectUuid);assert.ok(diagnostic.runId);assert.equal(diagnostic.phase,'loaded');console.log('Structured runtime diagnostic:',JSON.stringify(diagnostic));
    assert.equal((await page.evaluate(()=>window.__test.runtime.agentPlay('status'))).state,'failed');
    // Reload without Stop models an interrupted preview; the saved package must remain recoverable.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'恢复运行前场景',exact:true}).waitFor({state:'visible',timeout:90_000});
    await page.waitForFunction(()=>window.viewer?.renderer);
    await modules();
    await page.getByRole('button',{name:'恢复运行前场景',exact:true}).click();
    await page.waitForFunction(()=>window.viewer?.scene.getObjectByName('GPU Recovery Probe'),{timeout:90_000});
    const restored=await page.evaluate(()=>{
      const object=window.viewer.scene.getObjectByName('GPU Recovery Probe');return{name:object.name,shader:object.material.fragmentShader,scriptEnabled:window.viewer.enableScript,scripts:window.__test.engine.App.scripts[object.uuid]};
    });
    assert.equal(restored.scriptEnabled,false);assert.match(restored.shader,/vec4\(tint/);assert.match(restored.scripts[0].source,/diagnostic-probe/);
    console.log('IndexedDB restore after reload preserves authoring shader + script without execution:',JSON.stringify(restored));
    console.log('PASS material/runtime browser regression');
  } catch(error) {
    console.error('Page errors:',errors);console.error('URL:',page.url());throw error;
  } finally {await browser.close();}
};
browser().catch(error=>{console.error(error);process.exitCode=1;});
