import {BackSide, DirectionalLight, Material, Vector3} from 'three/webgpu';
import {CSMShadowNode} from 'three/addons/csm/CSMShadowNode.js';
import {useDispatchSignal} from '@/hooks';
import App from '@/core/app/App';

// Official node inserts its cascade placeholders on the first rendered frame.
// Mark them before insertion so saving cannot persist implementation-only objects.
class SceneCSMShadowNode extends CSMShadowNode {
    updateBefore(frame: any) {
        this.lights.forEach(light => { light.ignore = light.target.ignore = true; });
        return super.updateBefore(frame);
    }
}

class CSM {
    instance: CSMShadowNode | null = null;
    private light: DirectionalLight | null = null;
    private direction = new Vector3();
    constructor(options: IAppProject.CSM) { this.enabled = options.enabled; }
    get enabled() { return this.instance !== null; }
    set enabled(value: boolean) {
        if (this.instance) {
            this.instance.lights.forEach(light => light.shadow?.dispose());
            this.instance.dispose();
            this.light?.shadow.dispose();
            this.light?.removeFromParent();
            this.light?.target.removeFromParent();
            this.instance = null;
            this.light = null;
        }
        if (value) {
            const config = App.project.getKey('csm');
            const light = this.light = new DirectionalLight(config.lightColor, config.lightIntensity);
            light.ignore = light.target.ignore = true;
            light.castShadow = true;
            light.shadow.mapSize.setScalar(config.shadowMapSize);
            light.shadow.bias = -0.00001;
            light.shadow.camera.near = .1;
            light.shadow.camera.far = config.maxFar * 2;
            this.direction.set(config.lightDirectionX, config.lightDirectionY, config.lightDirectionZ);
            light.position.copy(this.direction).normalize().negate();
            App.scene.add(light, light.target);
            this.instance = new SceneCSMShadowNode(light, {cascades: 4, maxFar: config.maxFar, mode: config.mode, lightMargin: 200});
            this.instance.fade = config.fade;
            light.shadow.shadowNode = this.instance;
            Object.values(App.materials).forEach(material => this.setupMaterial(material));
        }
        useDispatchSignal('sceneGraphChanged');
    }
    reset() { if (this.enabled) this.enabled = true; }
    setupMaterial(material: Material) { if (this.enabled) material.shadowSide = BackSide; }
    updateProperty(_key: string, _value: unknown) { this.reset(); }
    updateLightColor(value: string) { this.light?.color.set(value); useDispatchSignal('sceneGraphChanged'); }
    updateLightIntensity(value: number) { if (this.light) this.light.intensity = value; useDispatchSignal('sceneGraphChanged'); }
    updateLightDirection(axis: 'x' | 'y' | 'z', value: number) {
        this.direction[axis] = value;
        this.light?.position.copy(this.direction).normalize().negate();
        useDispatchSignal('sceneGraphChanged');
    }
    updateFrustums() {
        if (this.instance?.mainFrustum) this.instance.updateFrustums();
        useDispatchSignal('sceneGraphChanged');
    }
    update() {
        // CSMShadowNode schedules cascade updates for the actual render camera.
        if (this.instance?.camera && this.instance.camera !== App.viewportCamera) {
            this.instance.camera = App.viewportCamera;
            this.instance.updateFrustums();
        }
        else if (this.instance?.mainFrustum) this.instance.updateFrustums();
    }
}
export {CSM};
