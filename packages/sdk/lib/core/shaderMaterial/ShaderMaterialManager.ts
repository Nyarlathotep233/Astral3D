import {ShaderMaterial, Vector2} from "three";
import {useAddSignal} from "@/hooks";
import {CircleGridShaderMaterial} from "@/core/shaderMaterial/modules/CircleGridShaderMaterial";
import {DynamicCheckerboardShaderMaterial} from "@/core/shaderMaterial/modules/DynamicCheckerboardShaderMaterial";
import {FlickerShaderMaterial} from "@/core/shaderMaterial/modules/FlickerShaderMaterial";
import {SlowSmokeShaderMaterial} from "@/core/shaderMaterial/modules/SlowSmokeShaderMaterial";
import {StreamerWallShaderMaterial} from "@/core/shaderMaterial/modules/StreamerWallShaderMaterial";
import { SnowingShaderMaterial } from "@/core/shaderMaterial/modules/SnowingShaderMaterial";
import App from "@/core/app/App";

const builtins = { CircleGridShaderMaterial, DynamicCheckerboardShaderMaterial, FlickerShaderMaterial,
    SlowSmokeShaderMaterial, SnowingShaderMaterial, StreamerWallShaderMaterial };

interface IShaderMaterialClass {
    Name: string,
    _ShaderMaterial: ShaderMaterial,
    Resolution?: Vector2,
    Update: () => void,
}

export class ShaderMaterialManager {
    shaderMaterials: IShaderMaterialClass[] = [];
    classMap: { [className: string]: string } = {};

    constructor() {
        useAddSignal("instantiateShaderMaterial", (shaderMaterialClass: IShaderMaterialClass) => {
            this.push(shaderMaterialClass);
        })
        useAddSignal("sceneResize", (width: number, height: number) => {
            const resolution = new Vector2(width, height);
            this.shaderMaterials.forEach(sm => {
                sm.Resolution = resolution;
            })
            for (const material of Object.values(App.materials)) {
                const shader = material as ShaderMaterial;
                if (shader.userData.h3dBuiltinMaterial && shader.uniforms?.uResolution?.value?.isVector2) {
                    shader.uniforms.uResolution.value.copy(resolution);
                }
            }
        })
        useAddSignal("sceneLoadComplete", () => {
            this.init();
        })
    }

    get needRender() {
        return this.shaderMaterials.length > 0 || Object.values(App.materials).some(material => material.userData.h3dBuiltinMaterial);
    }

    init() {
        this.shaderMaterials = [];
        if(!App.metadata._ShaderMaterialClassMap) return;

        this.classMap = App.metadata._ShaderMaterialClassMap;
        if (this.classMap) {
            for (let className in this.classMap) {
                const material = App.materials[this.classMap[className]] as ShaderMaterial;
                if (!material) continue;

                switch (className) {
                    case "CircleGridShaderMaterial":
                        CircleGridShaderMaterial.Material = material;
                        this.shaderMaterials.push(CircleGridShaderMaterial);
                        break;
                    case "DynamicCheckerboardShaderMaterial":
                        DynamicCheckerboardShaderMaterial.Material = material;
                        this.shaderMaterials.push(DynamicCheckerboardShaderMaterial);
                        break;
                    case "FlickerShaderMaterial":
                        FlickerShaderMaterial.Material = material;
                        this.shaderMaterials.push(FlickerShaderMaterial);
                        break;
                    case "SlowSmokeShaderMaterial":
                        SlowSmokeShaderMaterial.Material = material;
                        this.shaderMaterials.push(SlowSmokeShaderMaterial);
                        break;
                    case "StreamerWallShaderMaterial":
                        StreamerWallShaderMaterial.Material = material;
                        this.shaderMaterials.push(StreamerWallShaderMaterial);
                        break;
                    case "SnowingShaderMaterial":
                        SnowingShaderMaterial.Material = material;
                        this.shaderMaterials.push(SnowingShaderMaterial);
                        break;
                }
            }
        }
    }

    push(sm: IShaderMaterialClass) {
        this.shaderMaterials.push(sm);

        this.classMap[sm.Name] = sm._ShaderMaterial.uuid;
        App.metadata._ShaderMaterialClassMap = this.classMap;
    }

    update() {
        for (let i = 0; i < this.shaderMaterials.length; i++) {
            this.shaderMaterials[i].Update();
        }
        // Independently created materials keep their kind in serialized userData;
        // unlike the historical static singleton, every instance updates after reload.
        for (const material of Object.values(App.materials)) {
            const kind = material.userData.h3dBuiltinMaterial as keyof typeof builtins;
            const shader = material as ShaderMaterial;
            if (kind && builtins[kind] && shader.uniforms?.uTime) builtins[kind].UpdatePreview(shader);
        }
    }
}
