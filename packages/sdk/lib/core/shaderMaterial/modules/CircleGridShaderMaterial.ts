import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2024/5/18 13:49
 * @description 圆网格着色器材质
 * @from https://www.shadertoy.com/view/7dG3zy
 */
import {DoubleSide} from "three";
import {useDispatchSignal} from "@/hooks";

export class CircleGridShaderMaterial {
    static _ShaderMaterial: BuiltinMaterial;
    static Name = "CircleGridShaderMaterial";

    static get Material() {
        if (!CircleGridShaderMaterial._ShaderMaterial) {
            CircleGridShaderMaterial.Init();
        }
        return CircleGridShaderMaterial._ShaderMaterial;
    }

    static set Material(value: BuiltinMaterial) {
        CircleGridShaderMaterial._ShaderMaterial = value;
    }

    static get PreviewMaterial() {
        return CircleGridShaderMaterial.InstanceShaderMaterial();
    }

    static InstanceShaderMaterial(){
        const material = new BuiltinMaterial('CircleGrid', {
            uniforms: {
                uTime: {value: 1.0},
            },


            side: DoubleSide,
            transparent: true,
        });
        material.name = CircleGridShaderMaterial.Name;
        return material;
    }

    static Init() {
        CircleGridShaderMaterial._ShaderMaterial = CircleGridShaderMaterial.InstanceShaderMaterial();

        useDispatchSignal("instantiateShaderMaterial",CircleGridShaderMaterial);

        return CircleGridShaderMaterial._ShaderMaterial;
    }

    static Update() {
        if(!CircleGridShaderMaterial._ShaderMaterial) return;

        CircleGridShaderMaterial._ShaderMaterial.uniforms.uTime.value += .01
    }

    static UpdatePreview(previewMaterial: BuiltinMaterial) {
        previewMaterial.uniforms.uTime.value += .01
    }
}

