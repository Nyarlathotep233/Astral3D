import {TilesFadePlugin} from '3d-tiles-renderer/plugins';
import {StandardNodeLibrary} from 'three/webgpu';
import {uniform, screenCoordinate, screenSize, vec2, floor, mod} from 'three/tsl';
import {assertSupportedMaterials} from './renderer';

// Retain the library's tile visibility/timing algorithm, replacing its GLSL adapter.
// The application does not register BatchedTilesPlugin.
const library = new StandardNodeLibrary();
const materials = object => Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
export class TilesFadeNodePlugin extends TilesFadePlugin {
    constructor() {
        super();
        const params = new WeakMap();
        const originals = new WeakMap();
        this._fadeMaterialManager = {
            fading: 0,
            prepareScene(scene) {
                assertSupportedMaterials(scene);
                scene.traverse(object => {
                    if (!object.material || originals.has(object)) return;
                    const original = object.material;
                    originals.set(object, original);
                    const mapped = materials(object).map(material => {
                        const mapped = library.fromMaterial(material);
                        const node = mapped === material ? material.clone() : mapped;
                        if (!node) throw new Error(`Unsupported tile material: ${material.type}`);
                        const fadeIn = uniform(0), fadeOut = uniform(0), active = uniform(false);
                        const p = floor(mod(vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y)), 4));
                        const bayer2 = v => mod(v.y.mul(3).add(v.x.mul(2)), 4);
                        const dither = bayer2(mod(p, 2)).mul(4).add(bayer2(floor(mod(p, 4).mul(.5)))).add(.5).div(16);
                        const mask = active.not().or(dither.lessThan(fadeIn).and(dither.greaterThanEqual(fadeOut)));
                        node.maskNode = node.maskNode ? node.maskNode.and(mask) : mask;
                        params.set(node, {fadeIn, fadeOut, active});
                        return node;
                    });
                    object.material = Array.isArray(original) ? mapped : mapped[0];
                });
            },
            setFade(scene, fadeIn, fadeOut) {
                scene?.traverse(object => materials(object).forEach(material => {
                    const state = params.get(material);
                    if (!state) return;
                    const active = (fadeIn !== 0 && fadeIn !== 1) || (fadeOut !== 0 && fadeOut !== 1);
                    if (state.active.value !== active) this.fading += active ? 1 : -1;
                    state.fadeIn.value = fadeIn;
                    state.fadeOut.value = fadeOut;
                    state.active.value = active;
                }));
            },
            deleteScene(scene) {
                this.setFade(scene, 1, 0);
                scene?.traverse(object => {
                    if (!originals.has(object)) return;
                    materials(object).forEach(material => { params.delete(material); material.dispose(); });
                    object.material = originals.get(object);
                    originals.delete(object);
                });
            },
        };
    }
}
