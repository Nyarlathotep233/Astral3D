// Local browser acceptance fixture only; no business endpoints or remote writes.
import * as T from 'three/webgpu';
import * as sdk from '/packages/sdk/lib/index.ts';
import {setSceneClipping} from '/packages/sdk/lib/core/rendering/clipping.ts';
import {MiniMap} from '/packages/sdk/lib/core/tools/MiniMap.ts';
import {SignalsRegister} from '/packages/sdk/lib/utils/signals/signalRegister.ts';

export async function run(viewer, minutes = 15) {
    await viewer.ready;
    const {App} = sdk;
    const report = window.__soak = {
        started: new Date().toISOString(), durationMinutes: minutes, done: false,
        frames: 0, visibleFrames: 0, hiddenFrames: 0, previewCycles: 0, mapCycles: 0,
        pipelineCycles: 0, resizeCycles: 0, snapshots: [], errors: window.__renderErrors,
        cpuSubmitMs: [], gpuQueryMs: [], frameIntervalMs: [],
        api: sdk.getRenderingAPI(viewer.renderer),
    };
    if (report.api !== 'webgpu') throw Error('Soak requires actual WebGPU');
    const backend = viewer.renderer.backend;
    report.timestampQuerySupported = backend.device.features.has('timestamp-query');
    backend.trackTimestamp = report.timestampQuerySupported;
    const adapter = backend.device.adapterInfo;
    report.adapter = {vendor: adapter.vendor, architecture: adapter.architecture,
        device: adapter.device, description: adapter.description, isFallbackAdapter: adapter.isFallbackAdapter};
    const skyData=new Float32Array(32*16*4);
    for(let i=0;i<skyData.length;i+=4)skyData.set([.2,.3,.5,1],i);
    const sky=new T.DataTexture(skyData,32,16,T.RGBAFormat,T.FloatType);sky.mapping=T.EquirectangularReflectionMapping;sky.needsUpdate=true;
    App.scene.background=App.scene.environment=sky;
    const cluster = new T.InstancedMesh(new T.BoxGeometry(.3,.3,.3), new T.MeshStandardMaterial({color:0x91a7ff}), 300);
    cluster.name = 'soak-instanced-300'; cluster.castShadow = cluster.receiveShadow = true;
    const matrix = new T.Matrix4();
    for (let i=0;i<300;i++) { matrix.makeTranslation((i%20-10)*.4,.25+Math.floor(i/100)*.45,-2-Math.floor(i/20)%5*.4);cluster.setMatrixAt(i,matrix); }
    App.addObject(cluster);
    const builtin = new T.Mesh(new T.SphereGeometry(.5, 24, 16), sdk.StreamerWallShaderMaterial.InstanceShaderMaterial());
    builtin.name = 'soak-builtin-with-effects'; builtin.position.set(-2, 1, 1); App.addObject(builtin);
    const skinGeometry=new T.CylinderGeometry(.25,.25,3,8,6),indices=[],weights=[];
    for(let i=0;i<skinGeometry.attributes.position.count;i++){const weight=(skinGeometry.attributes.position.getY(i)+1.5)/3;indices.push(0,1,0,0);weights.push(1-weight,weight,0,0);}
    skinGeometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));skinGeometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const skin=new T.SkinnedMesh(skinGeometry,new T.MeshStandardMaterial({color:0xcc5599}));skin.name='soak-skinned';skin.position.set(3,1.5,0);skin.castShadow=true;
    const rootBone=new T.Bone(),tipBone=new T.Bone();rootBone.add(tipBone);tipBone.position.y=1.5;skin.add(rootBone);skin.bind(new T.Skeleton([rootBone,tipBone]));App.addObject(skin);
    const particle=sdk.Particles.fire({x:-3,y:1,z:0});viewer.addParticle(particle.emitter,particle.body,'soak-particles');
    const target = App.scene.getObjectByName('fixture-0');
    const effects = App.project.getKey('effect'); effects.enabled = true;
    const names = ['Outline','FXAA','UnrealBloom','Bokeh','Pixelate','Halftone','LUT','Afterimage'];
    const previewHost=document.createElement('div');previewHost.style.cssText='position:absolute;left:980px;top:0;width:192px;height:192px';document.body.append(previewHost);
    const start=performance.now(); let lastFrame=start,lastCycle=0,busy=false,queryPending=false,cycle=0,stopped=false;
    const originalRender=viewer.render.bind(viewer);
    const memory = () => ({...viewer.renderer.info.memory});
    const listenerCounts=()=>Object.fromEntries(Object.entries(SignalsRegister).filter(([,s])=>typeof s.getNumListeners==='function').map(([name,s])=>[name,s.getNumListeners()]));
    const initialListeners=listenerCounts();
    const sample = label => report.snapshots.push({label,seconds:(performance.now()-start)/1000,frames:report.frames,canvases:document.querySelectorAll('canvas').length,memory:memory(),heapBytes:performance.memory?.usedJSHeapSize,listeners:listenerCounts(),liveParticles:viewer.modules.particleSystem.particlesGroup.children.length,
        particlePoolSize: viewer.modules.particleSystem.spriteRenderer._targetPool.cID,
        renderContexts: Object.keys(viewer.renderer._renderContexts._renderContexts).length});
    const stop = error => {
        if(stopped)return;stopped=true;
        viewer.renderer.setAnimationLoop(null);
        viewer.removeEventListener('afterAnimation',animate);
        viewer.render=originalRender;
        setSceneClipping(target,null);
        if(error)report.failure=String(error.stack||error);
        sample('end'); report.elapsedSeconds=(performance.now()-start)/1000;
        report.webglRequests=window.__contextRequests.filter(x=>/webgl/i.test(x));
        report.done=true;previewHost.remove();
    };
    const cycleViews=async()=>{
        busy=true;
        try {
            const phase=cycle%(names.length+1),combined=phase===names.length;
            const name=names[phase];names.forEach(n=>effects[n].enabled=combined||n===name);
            await viewer.modules.effect.createPipeline();report.pipelineCycles++;
            viewer.modules.effect.outlinePass.selectedObjects=[target];
            setSceneClipping(target,cycle%2?[new T.Plane(new T.Vector3(1,0,0),2)]:null);
            const size=cycle%2?[960,640]:[1000,680];
            viewer.renderer.setSize(...size);report.resizeCycles++;
            const preview=new sdk.Preview({container:previewHost});await preview.ready;
            const mesh=new T.Mesh(new T.SphereGeometry(),new T.MeshStandardMaterial({color:0xffaa44}));
            preview.scene.add(mesh);preview.render();
            if(sdk.getRenderingAPI(preview.renderer)!=='webgpu')throw Error('Preview fallback');
            preview.dispose();mesh.geometry.dispose();mesh.material.dispose();report.previewCycles++;
            if(previewHost.querySelector('canvas'))throw Error('Preview canvas leaked');
            const map=new MiniMap(viewer,{mapSize:10,mapRenderSize:128,followTarget:target,isShow:true});
            await map.ready;map.update();map.dispose();report.mapCycles++;
            if(JSON.stringify(listenerCounts())!==JSON.stringify(initialListeners))throw Error('Signal listeners grew after preview/minimap disposal');
            if(cycle%3===0){const image=await viewer.getViewportImage();URL.revokeObjectURL(image.src);}
            sample('cycle-'+cycle);
            viewer.assertRenderable();cycle++;
        } catch(error){stop(error);} finally {busy=false;}
    };
    viewer.render=(...args)=>{
        const now=performance.now();
        originalRender(...args);
        report.frames++;
        if(document.hidden)report.hiddenFrames++;else {
            report.visibleFrames++;
            // Bound storage; every tenth frame after the first minute is measured.
            if(now-start>60000&&report.frames%10===0){report.cpuSubmitMs.push(performance.now()-now);report.frameIntervalMs.push(now-lastFrame);}
        }
        lastFrame=now;
        if(backend.trackTimestamp&&!queryPending){
            queryPending=true;
            viewer.renderer.resolveTimestampsAsync().then(ms=>{if(now-start>60000&&!document.hidden&&Number.isFinite(ms))report.gpuQueryMs.push(ms);}).catch(stop).finally(()=>queryPending=false);
        }
    };
    const animate=e=>{
        cluster.rotation.y+=.001;tipBone.rotation.z=Math.sin(performance.now()/1000)*.4;e.toBeRender(true);
        const elapsed=performance.now()-start;
        if(elapsed>=minutes*60000){if(!busy&&!queryPending)stop();return;}
        if(elapsed-lastCycle>=15000&&!busy){lastCycle=elapsed;void cycleViews();}
    };
    sample('start');viewer.addEventListener('afterAnimation',animate);
    window.__stopSoak=()=>stop();
    await cycleViews();
    return report;
}
