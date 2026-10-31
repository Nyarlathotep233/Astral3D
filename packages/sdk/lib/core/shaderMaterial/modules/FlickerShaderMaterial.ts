import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2024/5/18 13:49
 * @description 闪烁着色器材质
 */
import {DoubleSide, Color} from "three";
import {useDispatchSignal} from "@/hooks";

export class FlickerShaderMaterial{
    static _ShaderMaterial: BuiltinMaterial;
    static Name = "FlickerShaderMaterial";

    static get Material() {
        if (!FlickerShaderMaterial._ShaderMaterial) {
            FlickerShaderMaterial.Init();
        }
        return FlickerShaderMaterial._ShaderMaterial;
    }

    static set Material(value: BuiltinMaterial) {
        FlickerShaderMaterial._ShaderMaterial = value;
    }

    static get PreviewMaterial() {
        return FlickerShaderMaterial.InstanceShaderMaterial();
    }

    static InstanceShaderMaterial(){
        const material = new BuiltinMaterial('Flicker', {
            uniforms: {
                uTime: {value: 1.0},
                uHeight: {
                    value: 10,
                },
                uOpacity: {
                    value: 0.5,
                },
                uColor: {
                    value: new Color("#00ffff"),
                }
            },


            side: DoubleSide,
            transparent: true
        });
        material.name = FlickerShaderMaterial.Name;
        return material
    }

    static Init() {
        FlickerShaderMaterial._ShaderMaterial = FlickerShaderMaterial.InstanceShaderMaterial();

        useDispatchSignal("instantiateShaderMaterial",FlickerShaderMaterial);

        return FlickerShaderMaterial._ShaderMaterial;
    }

    static Update() {
        if(!FlickerShaderMaterial._ShaderMaterial) return;

        FlickerShaderMaterial._ShaderMaterial.uniforms.uTime.value += .02
    }

    static UpdatePreview(previewMaterial: BuiltinMaterial) {
        previewMaterial.uniforms.uTime.value += .02
    }
}


