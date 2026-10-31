// Run only against an isolated local database AND asset directory copy.
export function snapshot(App) {
    const objects=[],materials={},textures={};
    const visit=(o,parent=null)=>{
        if(o.ignore)return;
        objects.push({uuid:o.uuid,parent,name:o.name,type:o.type,position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),visible:o.visible,
            children:o.children.filter(c=>!c.ignore).map(c=>c.uuid),geometry:o.geometry?.uuid,
            materials:o.material?(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.uuid):undefined});
        for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){
            const json=m.toJSON();delete json.metadata;delete json.images;delete json.textures;
            // Time uniforms advance during the real editor's animation loop. Their exact
            // saved values are checked separately in the uploaded ZIP, not frozen in the app.
            if(json.uniforms)for(const name of ['uTime','time'])if(json.uniforms[name])delete json.uniforms[name];
            materials[m.uuid]=json;
            for(const [key,value] of Object.entries(m))if(value?.isTexture)textures[value.uuid]={uuid:value.uuid,type:value.type,colorSpace:value.colorSpace,wrapS:value.wrapS,wrapT:value.wrapT,repeat:value.repeat.toArray(),offset:value.offset.toArray()};
            for(const {value} of Object.values(m.uniforms||{}))if(value?.isTexture)textures[value.uuid]={uuid:value.uuid,type:value.type,colorSpace:value.colorSpace,wrapS:value.wrapS,wrapT:value.wrapT,repeat:value.repeat.toArray(),offset:value.offset.toArray()};
        }
        o.children.forEach(c=>visit(c,o.uuid));
    };
    visit(App.scene);
    const scene=App.scene;
    return {objects,materials,textures,background:scene.background?.isTexture?scene.background.uuid:scene.background?.getHex(),environment:scene.environment?.uuid,
        backgroundIntensity:scene.backgroundIntensity,environmentIntensity:scene.environmentIntensity,backgroundRotation:scene.backgroundRotation.toArray(),environmentRotation:scene.environmentRotation.toArray(),
        scripts:JSON.parse(JSON.stringify(App.scripts)),effect:structuredClone(App.project.getKey('effect')),renderer:structuredClone(App.project.getKey('renderer'))};
}

export async function prepare(viewer,sdk,T) {
    const {App}=sdk;
    if(App.project.getKey('sceneInfo.id')!=='9600ea7d95189faa4acfa697c0a93d68')throw Error('Wrong test-copy scene');
    await viewer.ready;
    const source=snapshot(App);
    App.project.setKey('sceneInfo.sceneName','WebGPU验收副本-20261031');
    const builtin=sdk.StreamerWallShaderMaterial.InstanceShaderMaterial();builtin.uniforms.uTime.value=1.25;
    const standard=new T.MeshStandardMaterial({color:0xff8844,roughness:.45,map:builtin.uniforms.uBgTexture.value});
    const geo=new T.BoxGeometry(2,2,2);
    for(let i=0;i<2;i++){
        const group=new T.Group();group.name='webgpu-save-group-'+i;
        const mesh=new T.Mesh(geo,[builtin,standard]);mesh.name='webgpu-save-mesh-'+i;mesh.position.set(i*4,3,0);group.add(mesh);App.addObject(group);
    }
    const scriptOwner=App.scene.getObjectByName('webgpu-save-mesh-0');
    App.addScript(scriptOwner,{name:'webgpu-save-passive-script',source:'function update() { /* acceptance: no external calls */ }'});
    const effect=App.project.getKey('effect');effect.enabled=true;effect.FXAA.enabled=true;
    await viewer.modules.effect.createPipeline();
    viewer.render();viewer.assertRenderable();
    return {source,prepared:snapshot(App)};
}

export function compare(before,after){
    const differences=[];
    function walk(a,b,path){
        if(a===b)return;
        if(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-10)return;
        if(a&&b&&typeof a==='object'&&typeof b==='object'){
            for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],path+'.'+key);
        }else differences.push({path,before:a,after:b});
    }
    walk(before,after,'scene');return differences;
}
