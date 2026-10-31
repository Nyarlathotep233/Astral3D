import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2025/01/07 
 * @description 贴相机的下雨效果
 */
import * as THREE from 'three';
import type CameraControls from 'camera-controls';

interface IRainOption {
    speed: number,
    color: string,
    size: number,
    radian: number,
    alpha: number,
}

export default class Rain{
    options: IRainOption;
    mesh:THREE.Mesh;
    controls: CameraControls;

    constructor(option: IRainOption, controls: CameraControls) {
        const defaultOption: IRainOption = {
            speed: 0.4,
            color: "#ffffff",
            size: 0.5,
            radian: 95 * THREE.MathUtils.DEG2RAD,
            alpha: 0.4
        };

        this.options = Object.assign({}, defaultOption, option);

        this.controls = controls;
        
        this.mesh = this.createMesh();

        this.updatePosition();
    }

    createMesh(){
        const geometry = new THREE.PlaneGeometry(200, 200);

        const uniforms = {
            u_time: {
                type: "f",
                value: 0.0
            },
            tDiffuse: { value: null },
            u_resolution: {
                type: "v2",
                value: new THREE.Vector2(window.innerWidth, window.innerHeight).multiplyScalar(window.devicePixelRatio)
            },
            alpha: {
                type: "f",
                value: this.options.alpha,
            },
            size: { value: this.options.size },
            radian: { value: this.options.radian * THREE.MathUtils.DEG2RAD },
            speed: { value: this.options.speed },
            color: { value: new THREE.Color(this.options.color) }
        };

        const material = new BuiltinMaterial('Rain', {
            transparent: true,
            uniforms: uniforms,
            side: 2,
            
        });

        return new THREE.Mesh(geometry, material);
    }

    updatePosition() {
        if (this.controls && this.mesh) {
            const position = this.controls.getPosition(new THREE.Vector3());
            const center = this.controls.getTarget(new THREE.Vector3());
            this.mesh.position.copy(center);
            if (position.y < 100) {
                this.mesh.position.y = -100;
            } else {
                this.mesh.position.y = 0;
            }
        }
    }

    updateOptions(option) {
        const material = <BuiltinMaterial>this.mesh.material;
        for (const key in option) {
            this.options[key] = option[key];

            if (material.uniforms[key]) {
                let value = option[key];

                switch(key){
                    case "radian":
                        value *= THREE.MathUtils.DEG2RAD;
                        break;
                    case "color":
                        value = new THREE.Color(value);
                        break;
                }
                material.uniforms[key].value = value;
            }
        }
    }

    update(deltaTime){
        this.updatePosition();

        if (this.mesh.material && this.mesh.material instanceof BuiltinMaterial) {
            this.mesh.material.uniforms.u_time.value += deltaTime;
        }
    }

    dispose(){
        this.mesh.geometry.dispose();
        (<THREE.Material>this.mesh.material).dispose();
        this.mesh.removeFromParent();        
    }
}