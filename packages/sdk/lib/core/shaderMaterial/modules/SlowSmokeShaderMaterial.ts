import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2024/5/18 13:49
 * @description 动态烟着色器材质
 * @from https://glslsandbox.com/e#109550.0
 */
import {DoubleSide, Vector2} from "three";
import {useDispatchSignal} from "@/hooks";

export class SlowSmokeShaderMaterial {
    static _ShaderMaterial: BuiltinMaterial;
    static Name = "SlowSmokeShaderMaterial";

    static get Material() {
        if (!SlowSmokeShaderMaterial._ShaderMaterial) {
            SlowSmokeShaderMaterial.Init();
        }
        return SlowSmokeShaderMaterial._ShaderMaterial;
    }

    static set Material(value: BuiltinMaterial) {
        SlowSmokeShaderMaterial._ShaderMaterial = value;
    }

    static get PreviewMaterial() {
        return SlowSmokeShaderMaterial.InstanceShaderMaterial();
    }

    static get Resolution() {
        const viewportDom = document.getElementById("viewport") as HTMLCanvasElement;
        return new Vector2(viewportDom?.offsetWidth || window.innerWidth, viewportDom?.offsetHeight || window.innerHeight);
    }

    static set Resolution(value: Vector2) {
        SlowSmokeShaderMaterial._ShaderMaterial.uniforms.uResolution.value.set(value.x, value.y);
    }

    static InstanceShaderMaterial() {
        const material = new BuiltinMaterial('SlowSmoke', {
            uniforms: {
                uTime: {value: 1.0},
                uResolution: {value: SlowSmokeShaderMaterial.Resolution},
            },


            side: DoubleSide,
            transparent: true,
        });
        material.name = SlowSmokeShaderMaterial.Name;
        return material;
    }

    static Init() {
        SlowSmokeShaderMaterial._ShaderMaterial = SlowSmokeShaderMaterial.InstanceShaderMaterial();

        useDispatchSignal("instantiateShaderMaterial", SlowSmokeShaderMaterial);

        return SlowSmokeShaderMaterial._ShaderMaterial;
    }

    static Update() {
        if(!SlowSmokeShaderMaterial._ShaderMaterial) return;

        SlowSmokeShaderMaterial._ShaderMaterial.uniforms.uTime.value += .01
    }

    static UpdatePreview(previewMaterial: BuiltinMaterial) {
        previewMaterial.uniforms.uTime.value += .01
    }
}


