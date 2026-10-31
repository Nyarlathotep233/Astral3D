import {BuiltinMaterial} from '../../rendering/BuiltinMaterial';
/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2025/01/08 
 * @description 贴相机的下雪效果
 */
import * as THREE from 'three';
import type CameraControls from 'camera-controls';

interface ISnowOption {
    size: number;
    density: number;
    speed: number;
    alpha: number;
}

export default class Snow {
    options: ISnowOption;
    mesh: THREE.Mesh;
    controls: CameraControls;

    constructor(option: ISnowOption, controls: CameraControls) {
        const defaultOption: ISnowOption = {
            size: 0.05,
            density: 1.0,
            speed: 1.0,
            alpha: 0.4,
        };

        this.options = Object.assign({}, defaultOption, option);

        this.controls = controls;

        this.mesh = this.createMesh();
        this.mesh.renderOrder = 100;

        this.updatePosition();
    }

    createMesh() {
        const geometry = new THREE.PlaneGeometry(200, 200);

        const uniforms = {
            iTime: {
                type: "f",
                value: 0.0
            },
            tDiffuse: { value: null },
            iResolution: {
                type: "v2",
                value: new THREE.Vector2(window.innerWidth, window.innerHeight).multiplyScalar(window.devicePixelRatio)
            },
            size: { value: this.options.size },
            speed: { value: this.options.speed },
            density: { value: this.options.density },
            alpha: {
                type: "f",
                value: this.options.alpha,
            },
        };

        const material = new BuiltinMaterial('Snow', {
            transparent: true,
            uniforms: uniforms,
            side: 2,
            depthTest: false, // 禁用深度测试
            depthWrite: false, // 禁用深度写入
            blending: THREE.AdditiveBlending, // 使用叠加混合模式
            
        });

        return new THREE.Mesh(geometry, material);
    }

    updatePosition() {
        if (this.controls && this.mesh) {
            const position = this.controls.getPosition(new THREE.Vector3());
            const center = this.controls.getTarget(new THREE.Vector3());

            if (this.mesh.position.x === center.x && this.mesh.position.z === center.z) return;

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
                material.uniforms[key].value = option[key];
            }
        }
    }

    update(deltaTime) {
        this.updatePosition();

        if (this.mesh.material && this.mesh.material instanceof BuiltinMaterial) {
            this.mesh.material.uniforms.iTime.value += deltaTime;
        }
    }

    dispose() {
        this.mesh.geometry.dispose();
        (<THREE.Material>this.mesh.material).dispose();
        this.mesh.removeFromParent();
    }
}