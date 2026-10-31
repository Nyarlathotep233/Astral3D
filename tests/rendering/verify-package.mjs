import * as T from 'three/webgpu';
import {App, Package} from '/packages/sdk/lib/index.ts';
import {StreamerWallShaderMaterial} from '/packages/sdk/lib/core/shaderMaterial/modules/StreamerWallShaderMaterial.ts';
const check=(ok, message)=>{if(!ok)throw new Error(message);window.__packageChecks.push(message);};
export async function prepare(viewer) {
    await viewer.ready; viewer.renderer.setAnimationLoop(null);
    // Freeze simulation while checking saved time uniforms, including renderer recreation.
    viewer.animate = () => {};
    App.clear();
    window.__packageChecks=[];
    const material=StreamerWallShaderMaterial.InstanceShaderMaterial();
    await Promise.all(Object.values(material.uniforms).filter(x=>x.value?.isTexture).map(x=>new Promise((resolve,reject)=>{
        const poll=()=>{if(x.value.image?.complete)resolve();else setTimeout(poll,30);}; poll();
        setTimeout(()=>reject(new Error('Test texture load timeout')),10000);
    })));
    material.uniforms.uTime.value=1.25;
    const standard=new T.MeshStandardMaterial({color:0x22aacc,map:material.uniforms.uBgTexture.value});
    for(let i=0;i<2;i++){
        const group=new T.Group();group.name=`package-group-${i}`;
        const mesh=new T.Mesh(new T.BoxGeometry(),[material,standard,material,standard,material,standard]);mesh.name=`package-mesh-${i}`;mesh.position.x=i*2;
        group.add(mesh);App.addObject(group);
        App.scripts[mesh.uuid]=[{name:'retained-script',source:'function update() {}'}];
    }
    window.__expectedPackage={scene:App.scene.uuid,objects:App.scene.children.filter(g=>!g.ignore).map(g=>({uuid:g.uuid,child:g.children[0].uuid})),material:material.uuid,texture:material.uniforms.uBgTexture.value.uuid,scripts:structuredClone(App.scripts)};
    App.project.getKey('effect').enabled=false; App.project.getKey('csm').enabled=false;
    viewer.render();
    const files=window.__packageFiles=[];
    await new Package(viewer).pack({name:'webgpu-test',zipUploadFun:async file=>{files.push(file);return file.name;}});
    check(files.length===3,'three real split-package ZIP files');
    return files.map(f=>({name:f.name,size:f.size}));
}
export async function reload(viewer,base='./.codex-logs/package-test/'){
    viewer.options.request={baseUrl:''};
    const pkg=new Package(viewer);
    await new Promise((resolve,reject)=>pkg.unpack({url:base+'webgpu-test.zip',onComplete:resolve,onError:reject}));
    const [a,b]=[0,1].map(i=>App.scene.getObjectByName(`package-mesh-${i}`));
    const e=window.__expectedPackage;
    check(a&&b,'all objects restored');
    check(App.scene.children.filter(g=>!g.ignore).map(g=>g.uuid).join()===e.objects.map(g=>g.uuid).join(),'saved sibling order preserved');
    check(a.material[0]===b.material[0]&&a.material[1]===b.material[1],'shared materials preserved across split packages');
    check(a.material[0].uniforms.uBgTexture.value===a.material[1].map,'shared texture preserved across material types');
    check(a.material[0].uuid===e.material&&a.material[0].uniforms.uTime.value===1.25,'builtin UUID and parameters preserved');
    check(a.material[0].uniforms.uBgTexture.value.uuid===e.texture,'texture UUID preserved');
    check(JSON.stringify(App.scripts)===JSON.stringify(e.scripts),'JS scripts preserved');
    check(App.scene.uuid===e.scene&&[a,b].every((m,i)=>m.uuid===e.objects[i].child&&m.parent.uuid===e.objects[i].uuid),'object UUIDs and hierarchy preserved');
    viewer.render();viewer.assertRenderable();
    check(window.__renderErrors.length===0,'reloaded nodes render without runtime errors');
    pkg.dispose();
    return window.__packageChecks;
}
