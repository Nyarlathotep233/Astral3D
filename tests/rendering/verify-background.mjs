import * as T from 'three/webgpu';
import {createRenderer,initializeRenderer,captureViewport} from '/packages/sdk/lib/core/rendering/renderer.ts';

export async function run(){
    const errors=[],checks=[];
    const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
    const data=new Float32Array(32*16*4);
    for(let i=0;i<data.length;i+=4)data.set([.2,.5,.8,1],i);
    const texture=new T.DataTexture(data,32,16,T.RGBAFormat,T.FloatType);
    texture.mapping=T.EquirectangularReflectionMapping;texture.needsUpdate=true;
    const scene=new T.Scene();scene.background=texture;
    const camera=new T.PerspectiveCamera(50,1,.1,100);
    const a=createRenderer(),b=createRenderer();
    for(const r of [a,b]){await initializeRenderer(r,e=>errors.push(e.message));r.setSize(64,64);}
    async function pixel(r){
        const img=await captureViewport(r,()=>r.render(scene,camera));
        const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(img.src);
        return [...c.getContext('2d').getImageData(32,32,1,1).data];
    }
    const first=await pixel(a),second=await pixel(b);
    assert(first[0]>50&&first[1]>100,'first renderer displays HDR');
    assert(second.every((x,i)=>Math.abs(x-first[i])<=1),'second renderer shares source without black cubemap');
    await a.dispose();
    assert((await pixel(b)).every((x,i)=>Math.abs(x-first[i])<=1),'other renderer disposal preserves sky');
    assert(scene.background===texture,'original texture identity retained');
    const replacement=texture.clone();replacement.needsUpdate=true;scene.background=replacement;
    await pixel(b);scene.background=texture;await pixel(b);
    assert(scene.toJSON().object.background===texture.uuid,'serialization retains source UUID');
    await b.dispose();texture.dispose();replacement.dispose();
    assert(errors.length===0,'no renderer errors');
    return {checks,first,second,errors};
}
