/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2025/7/30 18:49
 * @description 资源预览类
 */
import * as THREE from 'three/webgpu';
import {createRenderer, initializeRenderer, assertSupportedMaterials, captureViewport} from '../rendering/renderer';
import CameraControls from 'camera-controls';
import { Timer } from 'three/webgpu';
import {CSS3DRenderer} from "three/examples/jsm/renderers/CSS3DRenderer.js";
import {PreviewOptions} from "@/core/preview/PreviewOptions.ts";
import Loader from "@/core/loader/Loader.ts";
import {createDivContainer, deepAssign, parseMaterialZip} from "@/utils";
import {getDefaultBillboardOptions} from "@/core/objects";
import {POSITION} from "@/constant";
import {Emitter} from '@/core/libs/three-nebula';
import ParticleEmitter from "@/core/objects/ParticleEmitter.ts"
import Billboard from "@/core/objects/Billboard.ts";
import Tiles from "../objects/Tile.ts";
import {focusObject} from "@/utils/scene/controls.ts";
import {ParticleSystem,TilesManage} from "@/core/viewer/modules";

export interface PreviewerEventMap {
    // 场景当前动画帧循环完成之后渲染之前触发，每一次渲染执行一次
    beforeRender: { };

    // 场景当前帧渲染完成之后触发，每一次渲染执行一次
    afterRender: {  };
}

export interface PreviewerModules {
    controls: CameraControls,
    particleSystem: ParticleSystem,
    tilesManage:TilesManage,
}

CameraControls.install({
    THREE: {
        Vector2: THREE.Vector2,
        Vector3: THREE.Vector3,
        Vector4: THREE.Vector4,
        Quaternion: THREE.Quaternion,
        Matrix4: THREE.Matrix4,
        Spherical: THREE.Spherical,
        Box3: THREE.Box3,
        Sphere: THREE.Sphere,
        Raycaster: THREE.Raycaster,
    }
});

export default class Preview extends THREE.EventDispatcher<PreviewerEventMap>  {
    public _container: HTMLElement;
    public options: IPreviewSetting;
    public renderer!: THREE.WebGPURenderer;
    public readonly ready: Promise<void>;
    public renderError: Error | null = null;
    private initialized = false;
    private destroyed = false;
    public camera!: THREE.PerspectiveCamera;
    public scene!: THREE.Scene;
    public modules!: PreviewerModules;
    public css3DRenderer!: CSS3DRenderer;

    public timer = new Timer();
    private resizeObserver: ResizeObserver | null = null;
    private resizeTimer: ReturnType<typeof setTimeout> | null = null;
    private resize!: () => void;

    constructor(options: IPreviewSetting) {
        super();

        this._container = options.container || createDivContainer();

        this.options = PreviewOptions();
        deepAssign(this.options, options);

        this.ready = this.initialize().catch(error => { this.failRendering(error); throw error; });
        void this.ready.catch(() => {});
    }

    private async initialize() {
        const {camera, scene, renderer,css3DRenderer} = await this.basicCreation();
        if (this.destroyed) { await renderer.dispose(); throw new Error('Preview is disposed'); }
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;
        this.css3DRenderer = css3DRenderer;
        this._container.appendChild(renderer.domElement);
        this._container.appendChild(css3DRenderer.domElement);

        this.modules = this.initModules();

        this.loadEnv({setBg:true});

        this.initialized = true;
        this.renderer.setAnimationLoop(this.animate.bind(this));

        this.resize = this.onResize();
        this.resize();
    }

    get container(): HTMLElement {
        return this._container;
    }

    set container(container: HTMLElement) {
        if (this.destroyed) throw new Error('Preview is disposed');
        this.resizeObserver?.disconnect();
        this._container = container;
        if (!this.initialized) return;
        this._container.appendChild(this.renderer.domElement);
        this._container.appendChild(this.css3DRenderer.domElement);
        this.resize = this.onResize();
        this.resize();
    }

    async basicCreation(){
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100 * 1000);
        camera.name = "Camera";
        camera.position.set(0, 5, 10);
        camera.lookAt(new THREE.Vector3());

        const scene = new THREE.Scene();
        scene.name = "Scene";

        const renderer = createRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        renderer.autoClear = false;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.xr.enabled = false;
        renderer.setClearColor(0x272727, 1);
        renderer.setPixelRatio(Math.max(Math.ceil(window.devicePixelRatio), 1));
        renderer.setSize(this._container.offsetWidth, this._container.offsetHeight);

        const css3DRenderer = new CSS3DRenderer();
        css3DRenderer.setSize(this._container.offsetWidth, this._container.offsetHeight);
        css3DRenderer.domElement.setAttribute("id", "astral-3d-preview-css3DRenderer");
        css3DRenderer.domElement.style.position = 'absolute';
        css3DRenderer.domElement.style.top = '0px';
        css3DRenderer.domElement.style.pointerEvents = 'none';

        await initializeRenderer(renderer, error => this.failRendering(error));
        return { camera,scene,renderer,css3DRenderer };
    }

    /**
     * 初始化功能模块
     */
    initModules():PreviewerModules {
        const controls = new CameraControls(this.camera,this.renderer.domElement);
        controls.addEventListener("update", () => {});

        return {
            controls,
            // 粒子系统
            particleSystem: new ParticleSystem(this),
            // 3d tiles管理器
            tilesManage: new TilesManage(this.scene,this.camera,this.renderer),
        }
    }

    /**
     * 加载默认环境和背景
     */
    loadEnv(
        options?:{
            setBg?: boolean,
            extension?: string,
            onLoad?: (texture: THREE.Texture) => void,
            onError?: (error: Error) => void
        }
    ) {
        if (!this.options.hdr) return;

        const params = Object.assign({
            setBg: true,
            extension: this.options.hdr.split(".").pop()?.toLowerCase() || 'hdr'
        },options)

        Loader.loadUrlTexture(params.extension, this.options.hdr, (texture: THREE.Texture) => {
            if (this.destroyed) {
                texture.dispose();
                params.onError?.(new Error('Preview is disposed'));
                return;
            }
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
            params.setBg && (this.scene.background = texture);

            this.render();

            params.onLoad && params.onLoad(texture)
        },(err) => params.onError && params.onError(err));
    }

    /**
     * 加载预览项
     */
    async load(fileOrUrl:string | File,type:string = "Model") {
        await this.ready;
        if (this.destroyed) throw new Error("Preview is disposed");
        if (this.renderError) throw this.renderError;
        let file = fileOrUrl;
            if(!(fileOrUrl instanceof File) && !["Texture","Billboard","HDR","Tiles"].includes(type)) {
                const response = await fetch(fileOrUrl);
                if (!response.ok) {
                    throw new Error(`Preview resource request failed: ${response.status}`);
                }

                const filename = fileOrUrl.substring(fileOrUrl.lastIndexOf("/") + 1);

                const blob = await response.blob();
                file = new File([blob], filename,{ type: blob.type });
            }
        if (this.destroyed) throw new Error('Preview is disposed');
        return new Promise((resolve, reject) => {
            this.clear();
            switch (type) {
                case "Model":
                    Loader.loadFile(file, new THREE.LoadingManager(),null,false).then((model) => {
                        if (this.destroyed) throw new Error('Preview is disposed');
                        this.scene.add(model);
                        focusObject(model,this.modules.controls);

                        resolve(model);
                    }).catch(error => {
                        reject(error);
                    })
                    break;
                case "Material":
                    parseMaterialZip(file as File)
                        .then((material) => {
                            if (this.destroyed) { material.dispose(); throw new Error('Preview is disposed'); }
                            const geometry = new THREE.SphereGeometry(1, 32, 32, 0, Math.PI * 2, 0, Math.PI);
                            const mesh = new THREE.Mesh(geometry, material);
                            this.scene.add(mesh);

                            focusObject(mesh,this.modules.controls);

                            resolve(mesh);
                        })
                        .catch(error => {
                            reject(error);
                        })
                    break;
                case "Texture":
                    let mapPath = file;
                    if(file instanceof File){
                        mapPath = URL.createObjectURL(file);
                    }

                    const geometry = new THREE.PlaneGeometry(1, 1);
                    const material = new THREE.MeshStandardMaterial({
                        side: THREE.DoubleSide,
                        map: new THREE.TextureLoader().load(mapPath as string,(texture) => {
                            if (this.destroyed) {
                                texture.dispose(); geometry.dispose(); material.dispose();
                                if (file instanceof File) URL.revokeObjectURL(mapPath as string);
                                reject(new Error('Preview is disposed'));
                                return;
                            }
                            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                            texture.repeat.set(1, 1);
                            if(file instanceof File){
                                URL.revokeObjectURL(mapPath as string)
                            }

                            const panel = new THREE.Mesh(geometry, material);

                            this.scene.add(panel);
                            focusObject(panel, this.modules.controls);

                            resolve(panel);
                        },undefined,(err) => reject(err))
                    });

                    break;
                case "Billboard":
                    const _ops = getDefaultBillboardOptions();
                    _ops.image.visible = true;
                    _ops.image.position = POSITION.LEFT;
                    if(file instanceof File){
                        _ops.name = file.name;
                        _ops.image.url = URL.createObjectURL(file);
                    } else {
                        _ops.name = file.substring(file.lastIndexOf("/") + 1);
                        _ops.image.url = file;
                    }

                    const billboard = new Billboard(_ops);

                    const handleBillboardImgLoaded = () => {
                        if(file instanceof File){
                            URL.revokeObjectURL(_ops.image.url);
                        }

                        billboard.removeEventListener("imgLoaded", handleBillboardImgLoaded);
                    }
                    billboard.addEventListener("imgLoaded", handleBillboardImgLoaded);

                    this.scene.add(billboard);
                    focusObject(billboard, this.modules.controls);

                    resolve(billboard);
                    break;
                case "HDR":
                    let hdrPath = file, extension = "hdr";
                    if(file instanceof File){
                        hdrPath = URL.createObjectURL(file);
                        extension = file.name.split(".").pop()?.toLowerCase() || "hdr"
                    }else {
                        extension = file.split(".").pop()?.toLowerCase() || "hdr";
                    }

                    this.options.hdr = hdrPath as string;
                    this.loadEnv({
                        setBg:true,
                        extension:extension,
                        onLoad:(texture) => {
                            if(file instanceof File){
                                URL.revokeObjectURL(hdrPath as string);
                            }

                            resolve(texture);
                        },
                        onError: (error) => {
                            if(file instanceof File){
                                URL.revokeObjectURL(hdrPath as string);
                            }

                            reject(error)
                        }
                    })
                    break;
                case "Tiles":
                    if(fileOrUrl instanceof File){
                        reject();
                        return;
                    }
                    if(!fileOrUrl.includes("tileset.json")) {
                        fileOrUrl = `${fileOrUrl}/tileset.json`;
                    }
                    const tiles = new Tiles({
                        url: fileOrUrl,
                        name: "AstralPreviewTiles",
                        reset2origin:true,
                    })
                    this.addTiles(tiles).then(() => {
                        this.modules.controls.fitToBox(tiles,true);
                    })

                    resolve(tiles);
                    break;
                default:
                    reject("A type for which previews are not yet supported");
                    break;
            }

            this.render();
        })
    }

    /**
     * 监听视窗变化（节流）
     */
    onResize(){
        const resize = () => {
            if (this.destroyed) return;
            this.camera.aspect = this._container.offsetWidth / this._container.offsetHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this._container.offsetWidth, this._container.offsetHeight);
            this.css3DRenderer.setSize(this._container.offsetWidth, this._container.offsetHeight);
        }

        this.resizeObserver = new ResizeObserver(() => {
            if (this.resizeTimer) return;
            this.resizeTimer = setTimeout(() => {
                resize();

                this.resizeTimer = null;
            }, 16)
        });
        this.resizeObserver.observe(this._container);

        return resize;
    }

    /**
     * 清空场景
     */
    clear(){
        if (!this.scene) return;
        for(let i = this.scene.children.length - 1; i >= 0; i--){
            const child = this.scene.children[i];
            if(!child.parent || child.ignore) continue;

            child.parent.remove(child);
        }

        this.render();
    }

    animate(){
        if (!this.initialized || this.destroyed || this.renderError) return;
        this.timer.update();

        const delta = this.timer.getDelta();

        // let needRender = this.modules.controls.update(delta);
        this.modules.controls.update(delta);

        this.modules.particleSystem.update(delta);
        // if (this.modules.particleSystem.needsUpdate) {
        //     needRender = true;
        // }

        // 3dTiles渲染
        this.modules.tilesManage.update()
        // if(this.modules.tilesManage.update()){
        //     needRender = true;
        // }

        // if (needRender) this.render();
        this.render();
    }

    render(){
        if (!this.initialized || this.destroyed || this.renderError) return;
        try {
        this.dispatchEvent({type: 'beforeRender'});
        assertSupportedMaterials(this.scene);

        this.renderer.autoClear = true;

        this.renderer.render(this.scene, this.camera);

        this.css3DRenderer.render(this.scene, this.camera);

        this.renderer.autoClear = true;

        this.dispatchEvent({type: 'afterRender'});
        } catch (error) { this.failRendering(error); }
    }

    failRendering(error: unknown) {
        if (this.renderError || this.destroyed) return;
        this.renderError = error instanceof Error ? error : new Error(String(error));
        this.renderer?.setAnimationLoop(null);
        console.error('[H3D] Preview stopped', this.renderError);
        (window as any).$message?.error(this.renderError.message);
    }

    /**
     * 销毁
     */
    dispose() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.initialized = false;
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeObserver?.disconnect();
        this.timer.dispose();
        if (!this.modules) return;
        this.resizeObserver?.unobserve(this._container);
        this.resizeObserver?.disconnect();

        Object.keys(this.modules).forEach(key => {
            if (this.modules[key].dispose) {
                this.modules[key].dispose();
            }
        })

        this.modules.controls.disconnect();

        this.clear();
        this.scene.background = null;
        this.scene.environment = null;

        this.renderer.domElement.remove();
        this.css3DRenderer.domElement.remove();

        this.renderer.setAnimationLoop(null);
        this.renderer.dispose();
        // @ts-ignore
        this.renderer = null;

        // @ts-ignore 清空EventDispatcher监听
        if(this._listeners){
            // @ts-ignore
            Object.keys(this._listeners).forEach(type => {
                // @ts-ignore
                this._listeners[type].forEach(listener => {
                    // @ts-ignore
                    this.removeEventListener(type, listener);
                })
            })
        }
    }

    /* -----------------暂时放在Preview下的工具方法-------------------- */

    /**
     * 添加粒子
     * @emitter 粒子发射器
     * @body 粒子主体
     */
    addParticle(emitter: Emitter, body: THREE.Sprite | THREE.Mesh, name: string = "Particles") {
        const particleEmitter = new ParticleEmitter(emitter);
        particleEmitter.name = name;

        ParticleSystem.Body3DMap.set(particleEmitter.uuid, body);

        this.modules.particleSystem.spriteSystem.addEmitter(emitter);

        this.scene.add(particleEmitter);

        return particleEmitter;
    }

    /**
     * 添加瓦片
     */
    addTiles(tiles:Tiles){
        return new Promise(resolve => {
            tiles.setCameraAndRenderer(this.camera, this.renderer);

            this.modules.tilesManage.addTiles(tiles).then(tiles => {
                resolve(tiles);
            })

            this.scene.add(tiles);
        })
    }

    /**
     * 移除瓦片
     */
    removeTiles(tiles:Tiles){
        this.scene.remove(tiles);

        this.modules.tilesManage.removeTiles(tiles);
    }

    /**
     * 获取画布的截屏图片
     * @returns Promise<HTMLImageElement> 截屏的图片对象
     */
    async getViewportImage() {
        await this.ready;
        if (this.destroyed) throw new Error('Preview is disposed');
        if (this.renderError) throw this.renderError;
        return captureViewport(this.renderer, () => {
            this.render();
            if (this.renderError) throw this.renderError;
        });
    }
}
