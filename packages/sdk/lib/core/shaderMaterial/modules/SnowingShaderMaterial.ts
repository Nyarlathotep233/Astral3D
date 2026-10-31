import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @description 下雪特效着色器
 */
import { Vector2, Vector4, TextureLoader, RepeatWrapping, DoubleSide } from "three";
import { useDispatchSignal } from "@/hooks";

export class SnowingShaderMaterial {
    static _ShaderMaterial: BuiltinMaterial;
    static Name = "SnowingShaderMaterial";

    static get Material() {
        if (!SnowingShaderMaterial._ShaderMaterial) {
            SnowingShaderMaterial.Init();
        }
        return SnowingShaderMaterial._ShaderMaterial;
    }

    static set Material(value) {
        SnowingShaderMaterial._ShaderMaterial = value;
    }

    static get PreviewMaterial() {
        return SnowingShaderMaterial.InstanceShaderMaterial();
    }

    static get Resolution() {
        return new Vector2(window.innerWidth, window.innerHeight);
    }

    static set Resolution(value) {
        SnowingShaderMaterial._ShaderMaterial.uniforms.uResolution.value.set(value.x, value.y);
    }

    static InstanceShaderMaterial() {
        const textureLoader = new TextureLoader();

        const material = new BuiltinMaterial('Snowing', {
            uniforms: {
                uTime: { value: 0.1 },
                uResolution: { value: SnowingShaderMaterial.Resolution },
                uNoiseMap: { value: null },
                uTexture: { value: null },
                uHasTexture: { value: 0.0 },
                uColor: { value: new Vector4(1.0,1.0,1.0,1.0) }
            },


            side: DoubleSide,
            transparent: false,
            depthTest: true,
            depthWrite: true,
            lights: false
        });
        material.name = SnowingShaderMaterial.Name;

        textureLoader.load(new URL('../../../../public/resource/textures/noise.png', import.meta.url).href, (texture) => {
            texture.wrapS = texture.wrapT = RepeatWrapping;
            texture.repeat.set(1, 1);
            material.uniforms.uNoiseMap.value = texture;
        });

        return material;
    }

    static Init() {
        SnowingShaderMaterial._ShaderMaterial = SnowingShaderMaterial.InstanceShaderMaterial();

        useDispatchSignal("instantiateShaderMaterial", SnowingShaderMaterial);

        return SnowingShaderMaterial._ShaderMaterial;
    }

    static Update() {
        if (!SnowingShaderMaterial._ShaderMaterial) return;

        SnowingShaderMaterial._ShaderMaterial.uniforms.uTime.value += .01;
    }

    static UpdatePreview(previewMaterial: BuiltinMaterial) {
        previewMaterial.uniforms.uTime.value += .01
    }
}

