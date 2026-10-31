import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2024/5/18 13:49
 * @description 流光墙着色器材质
 * @from http://t.csdnimg.cn/zSxq0
 */
import {DoubleSide, RepeatWrapping,TextureLoader} from "three";
import {useDispatchSignal} from "@/hooks";

export class StreamerWallShaderMaterial{
    static _ShaderMaterial: BuiltinMaterial;
    static Name = "StreamerWallShaderMaterial";

    static get Material() {
        if (!StreamerWallShaderMaterial._ShaderMaterial) {
            StreamerWallShaderMaterial.Init();
        }
        return StreamerWallShaderMaterial._ShaderMaterial;
    }

    static set Material(value: BuiltinMaterial) {
        StreamerWallShaderMaterial._ShaderMaterial = value;
    }

    static get PreviewMaterial() {
        return StreamerWallShaderMaterial.InstanceShaderMaterial();
    }

    static InstanceShaderMaterial(){
        const bgTexture = new TextureLoader().load(new URL("../../rendering/assets/GradationBlue.png", import.meta.url).href);

        const flowTexture = new TextureLoader().load(new URL("../../rendering/assets/FlowTexture.png", import.meta.url).href);
        flowTexture.wrapS = RepeatWrapping;

        const material = new BuiltinMaterial('StreamerWall', {
            uniforms: {
                uTime: {value: 0.0},
                uFlowTexture: {value: flowTexture},
                uBgTexture: {value: bgTexture}
            },


            side: DoubleSide,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        material.name = StreamerWallShaderMaterial.Name;
        return material;
    }

    static Init() {
        StreamerWallShaderMaterial._ShaderMaterial = StreamerWallShaderMaterial.InstanceShaderMaterial();

        useDispatchSignal("instantiateShaderMaterial",StreamerWallShaderMaterial);

        return StreamerWallShaderMaterial._ShaderMaterial;
    }

    static Update() {
        if(!StreamerWallShaderMaterial._ShaderMaterial) return;

        StreamerWallShaderMaterial._ShaderMaterial.uniforms.uTime.value += .01
    }

    static UpdatePreview(previewMaterial: BuiltinMaterial) {
        previewMaterial.uniforms.uTime.value += .01
    }
}


