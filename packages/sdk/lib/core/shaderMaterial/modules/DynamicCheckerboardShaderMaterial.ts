import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2024/5/18 13:49
 * @description 动态棋盘着色器材质
 * @from  https://glslsandbox.com/e#109552.0
 */
import {DoubleSide} from "three";
import {useDispatchSignal} from "@/hooks";

export class DynamicCheckerboardShaderMaterial {
    static _ShaderMaterial: BuiltinMaterial;
    static Name = "DynamicCheckerboardShaderMaterial";

    static get Material() {
        if (!DynamicCheckerboardShaderMaterial._ShaderMaterial) {
            DynamicCheckerboardShaderMaterial.Init();
        }
        return DynamicCheckerboardShaderMaterial._ShaderMaterial;
    }

    static set Material(value: BuiltinMaterial) {
        DynamicCheckerboardShaderMaterial._ShaderMaterial = value;
    }

    static get PreviewMaterial() {
        return DynamicCheckerboardShaderMaterial.InstanceShaderMaterial();
    }

    static InstanceShaderMaterial() {
        const material = new BuiltinMaterial('DynamicCheckerboard', {
            uniforms:{
                uTime: {
                    value: 1.0
                }
            },


            side: DoubleSide,
            transparent: true,
        });
        material.name = DynamicCheckerboardShaderMaterial.Name;
        return material;
    }

    static Init() {
        DynamicCheckerboardShaderMaterial._ShaderMaterial = DynamicCheckerboardShaderMaterial.InstanceShaderMaterial();

        useDispatchSignal("instantiateShaderMaterial", DynamicCheckerboardShaderMaterial);

        return DynamicCheckerboardShaderMaterial._ShaderMaterial;
    }

    static Update() {
        if(!DynamicCheckerboardShaderMaterial._ShaderMaterial) return;

        DynamicCheckerboardShaderMaterial._ShaderMaterial.uniforms.uTime.value += .01
    }

    static UpdatePreview(previewMaterial : BuiltinMaterial) {
        previewMaterial.uniforms.uTime.value += .01
    }
}

