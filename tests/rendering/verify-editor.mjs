// Browser-only integration suite: actual Viewer/modules, no business API writes.
import * as T from 'three/webgpu';
import * as sdk from '/packages/sdk/lib/index.ts';
import {setSceneClipping} from '/packages/sdk/lib/core/rendering/clipping.ts';
import {TilesFadeNodePlugin} from '/packages/sdk/lib/core/rendering/TilesFadeNodePlugin.js';
import {MiniMap} from '/packages/sdk/lib/core/tools/MiniMap.ts';
import legacy from '/packages/sdk/lib/core/rendering/legacyBuiltins.json';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export async function run(viewer) {
    const {App, Loader} = sdk;
    await viewer.ready;
    viewer.renderer.setAnimationLoop(null);
    await viewer.modules.controls.setLookAt(6, 4, 8, 0, .5, 0, false);
    const report = window.__suite = {checks: [], snapshots: [], errors: window.__renderErrors, done: false};
    const check = (name, result = true) => { assert(result, name); report.checks.push(name); };
    const snapshot = async name => {
        viewer.render();
        viewer.assertRenderable();
        await viewer.renderer.backend.device?.queue.onSubmittedWorkDone();
        await sleep(50);
        const img = await viewer.getViewportImage();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        const data = c.toDataURL();
        // The lower scene region contains the fixture ground. A helpers-only black
        // output can have no console errors; require real scene pixels as well.
        const pixels = c.getContext('2d').getImageData(100,400,760,200).data;
        let lit = 0;
        for (let i=0;i<pixels.length;i+=4) if(pixels[i]+pixels[i+1]+pixels[i+2]>180) lit++;
        assert(lit > 10000, `${name}: scene pixels were lost`);
        report.snapshots.push({name, data});
        return data;
    };
    check('actual API is WebGPU', sdk.getRenderingAPI(viewer.renderer) === 'webgpu');
    const m = App.scene.getObjectByName('fixture-0');
    const original = m.material;
    const baseline = await snapshot('standard');
    for (const kind of Object.keys(legacy)) {
        const mod = await import(`/packages/sdk/lib/core/shaderMaterial/modules/${kind}ShaderMaterial.ts`);
        const material = mod[`${kind}ShaderMaterial`].PreviewMaterial;
        await sleep(150);
        m.material = material;
        const json = m.toJSON();
        const loaded = await Loader.objectLoader.parseAsync(json);
        check(`${kind}: UUID and parameters`, loaded.material.uuid === material.uuid &&
            JSON.stringify(loaded.material.toJSON().uniforms) === JSON.stringify(material.toJSON().uniforms));
        check(`${kind}: clone`, material.clone().kind === kind);
        const old = {...material.toJSON(), type: 'ShaderMaterial', ...legacy[kind]};
        const oldLoaded = Loader.objectLoader.parseMaterials([old], Object.fromEntries(Object.values(material.uniforms)
            .map(u => u.value).filter(t => t?.isTexture).map(t => [t.uuid, t])))[old.uuid];
        check(`${kind}: exact legacy registration`, oldLoaded.kind === kind && oldLoaded.vertexShader === legacy[kind].vertexShader);
        check(`${kind}: visible output`, await snapshot(kind) !== baseline);
    }
    m.material = original;
    for (const packing of [T.BasicDepthPacking,T.RGBADepthPacking,T.RGBDepthPacking,T.RGDepthPacking]) {
        m.material = new T.MeshDepthMaterial({depthPacking: packing});
        await snapshot(`depth-${packing}`);
        check(`depth packing ${packing}`);
        m.material.dispose();
    }
    m.material = original;
    const parent = m.parent, tree = JSON.stringify(App.scene.toJSON().object);
    setSceneClipping(m, [new T.Plane(new T.Vector3(1,0,0), -m.position.x)]);
    check('clipping affects pixels', await snapshot('clipping') !== baseline);
    check('clipping preserves identity/tree', m.parent === parent && JSON.stringify(App.scene.toJSON().object) === tree);
    setSceneClipping(m, null);
    const effect = App.project.getKey('effect');
    effect.enabled = true;
    const names = ['Outline','FXAA','UnrealBloom','Bokeh','Pixelate','Halftone','LUT','Afterimage'];
    for (const name of names) {
        names.forEach(n => effect[n].enabled = n === name);
        await viewer.modules.effect.createPipeline();
        viewer.modules.effect.outlinePass.selectedObjects = [m];
        await snapshot(name);
        check(`postprocessing ${name}`);
    }
    names.forEach(n => effect[n].enabled = true);
    await viewer.modules.effect.createPipeline();
    await snapshot('combined-effects');
    check('combined postprocessing');
    effect.enabled = false;
    App.csm.enabled = true;
    await snapshot('CSM');
    check('CSM node initialized', !!App.csm.instance?.mainFrustum);
    check('CSM placeholders excluded from saves', App.csm.instance.lights.every(light=>light.ignore&&light.target.ignore));
    App.csm.enabled = false;
    for (const weather of ['rain','snow']) {
        const options = App.project.getKey(`weather.${weather}`);
        options.enabled = true;
        viewer.modules.weather[weather === 'rain' ? 'sceneRainSettingsChanged' : 'sceneSnowSettingsChanged']();
        viewer.modules.weather.update(1);
        await snapshot(weather);
        check(`${weather} node rendering`);
        options.enabled = false;
        viewer.modules.weather[weather === 'rain' ? 'sceneRainSettingsChanged' : 'sceneSnowSettingsChanged']();
    }
    const tileScene = new T.Group(); const tile = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({color:0xff5522}));
    tile.position.set(0,2,0); tileScene.add(tile); App.scene.add(tileScene);
    const fade = new TilesFadeNodePlugin(); fade._fadeMaterialManager.prepareScene(tileScene); fade._fadeMaterialManager.setFade(tileScene,.5,0);
    await snapshot('tile-fade'); check('tile fade uses nodes', tile.material.isNodeMaterial);
    fade._fadeMaterialManager.deleteScene(tileScene); tileScene.removeFromParent(); tile.geometry.dispose(); tile.material.dispose();
    const map = new MiniMap(viewer,{mapSize:10,mapRenderSize:200,followTarget:m,isShow:true});
    await map.ready; map.update(); check('minimap WebGPU', sdk.getRenderingAPI(map._miniMapRenderer)==='webgpu'); map.dispose();
    const container = document.createElement('div'); container.style.cssText='width:256px;height:256px'; document.body.appendChild(container);
    for (let i=0;i<3;i++) {
        const preview = new sdk.Preview({container}); await preview.ready;
        preview.scene.add(new T.Mesh(new T.SphereGeometry(),new T.MeshStandardMaterial())); preview.render();
        check(`preview ${i}: WebGPU`,sdk.getRenderingAPI(preview.renderer)==='webgpu');
        preview.dispose(); check(`preview ${i}: canvas disposed`,container.querySelectorAll('canvas').length===0);
    }
    const cancelled = new sdk.Preview({container}); cancelled.dispose(); await cancelled.ready.catch(()=>{});
    check('cancelled init cannot remount',container.querySelectorAll('canvas').length===0); container.remove();
    await viewer.createEngine(); viewer.renderer.setAnimationLoop(null);
    await viewer.modules.effect.ready;
    await snapshot('renderer-recreated');
    check('renderer recreation retains one canvas',viewer.container.querySelectorAll('canvas').length===1);
    check('zero WebGL context requests', !window.__contextRequests.some(x=>/webgl/i.test(x)));
    check('no runtime errors', window.__renderErrors.length===0);
    report.done = true;
    return report;
}
export function gallery() {
    const host = document.createElement('div'); host.style.cssText='position:absolute;inset:0;background:white;z-index:9999;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px;align-content:start';
    for (const shot of window.__suite.snapshots) {
        const card = document.createElement('div'); const caption = document.createElement('div'); caption.textContent=shot.name;
        const img = new Image(); img.src=shot.data; img.style.width='100%'; card.append(caption,img); host.append(card);
    }
    document.body.append(host);
}
