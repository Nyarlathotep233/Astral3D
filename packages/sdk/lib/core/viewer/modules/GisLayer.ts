import * as THREE from "three";
import { GlobeControls, TilesRenderer } from "3d-tiles-renderer";
import {
    ImageOverlayPlugin,
    XYZTilesOverlay,
    XYZTilesPlugin,
} from "3d-tiles-renderer/three/plugins";
import {
    Ellipsoid,
    Geodetic,
    PointOfView,
} from "@takram/three-geospatial";
import {
    getECIToECEFRotationMatrix,
    getMoonDirectionECI,
    getSunDirectionECI,
    PrecomputedTexturesGenerator,
    SkyMaterial,
    StarsGeometry,
    StarsMaterial,
} from "@takram/three-atmosphere";
import { useDispatchSignal } from "@/hooks";
import type Viewer from "../Viewer";

export type ProjectType = 0 | 1;

export interface GeoPosition {
    longitude: number;
    latitude: number;
    height: number;
}

export interface GisInitialView {
    longitude: number;
    latitude: number;
    altitude: number;
}

export interface GisConfig {
    tiandituToken: string;
    initialView: GisInitialView;
    atmosphereDateTime: string;
}

const defaultAtmosphereDate = new Date();
defaultAtmosphereDate.setHours(12, 0, 0, 0);

export const DEFAULT_GIS_CONFIG: GisConfig = {
    tiandituToken: "",
    initialView: {
        longitude: 104,
        latitude: 35,
        altitude: 20_000_000,
    },
    atmosphereDateTime: defaultAtmosphereDate.toISOString(),
};

const STARS_DATA_URL = new URL(
    `${import.meta.env.BASE_URL}resource/gis/stars.bin`,
    import.meta.url,
).href;

const ATMOSPHERE_EXPOSURE = 10;

const LOCAL_TO_ENU = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
);

function assertGeoPosition(position: GeoPosition) {
    if (
        !Number.isFinite(position.longitude) ||
        !Number.isFinite(position.latitude) ||
        !Number.isFinite(position.height) ||
        position.longitude < -180 ||
        position.longitude > 180 ||
        position.latitude < -90 ||
        position.latitude > 90
    ) {
        throw new RangeError("Invalid WGS84 position");
    }
}

function parseAtmosphereDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new RangeError("Invalid GIS atmosphere date time");
    }
    return date;
}

function applyAtmosphereExposure(material: SkyMaterial | StarsMaterial) {
    // The Vanilla example applies exposure 10 in its tone-mapping pass. Keep the
    // adjustment local to GIS atmosphere materials instead of changing Astral's renderer.
    const uniforms = material.uniforms;
    uniforms.SUN_SPECTRAL_RADIANCE_TO_LUMINANCE.value = uniforms
        .SUN_SPECTRAL_RADIANCE_TO_LUMINANCE.value.clone()
        .multiplyScalar(ATMOSPHERE_EXPOSURE);
    uniforms.SKY_SPECTRAL_RADIANCE_TO_LUMINANCE.value = uniforms
        .SKY_SPECTRAL_RADIANCE_TO_LUMINANCE.value.clone()
        .multiplyScalar(ATMOSPHERE_EXPOSURE);
}

function toECEF(position: GeoPosition) {
    return new Geodetic(
        THREE.MathUtils.degToRad(position.longitude),
        THREE.MathUtils.degToRad(position.latitude),
        position.height,
    ).toECEF();
}

export function getGeoPosition(object: THREE.Object3D): GeoPosition | null {
    const gis = object.userData?.gis;
    if (gis?.type !== "geo-anchor") return null;

    return {
        longitude: Number(gis.longitude),
        latitude: Number(gis.latitude),
        height: Number(gis.height),
    };
}

export function applyGeoAnchorTransform(anchor: THREE.Object3D, position: GeoPosition) {
    assertGeoPosition(position);

    anchor.userData.gis = {
        type: "geo-anchor",
        longitude: position.longitude,
        latitude: position.latitude,
        height: position.height,
    };
    anchor.matrixAutoUpdate = false;
    anchor.matrix
        .copy(Ellipsoid.WGS84.getEastNorthUpFrame(toECEF(position)))
        .multiply(LOCAL_TO_ENU);
    anchor.matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
    anchor.updateMatrixWorld(true);
}

function tiandituUrl(layer: "img" | "cva", token: string) {
    return `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${encodeURIComponent(token)}`;
}

export class GisLayer {
    public enabled = false;
    public controls: GlobeControls | null = null;
    public tiles: TilesRenderer | null = null;
    public atmosphereGroup: THREE.Group | null = null;

    private viewer: Viewer;
    private config: GisConfig | null = null;
    private loadErrorShown = false;
    private atmosphereErrorShown = false;
    private atmosphereGeneration = 0;
    private atmosphereGenerator: PrecomputedTexturesGenerator | null = null;
    private sky: THREE.Mesh | null = null;
    private skyMaterial: SkyMaterial | null = null;
    private stars: THREE.Points | null = null;
    private starsMaterial: StarsMaterial | null = null;
    private readonly atmosphereRotation = new THREE.Matrix4();
    private readonly sunDirection = new THREE.Vector3();
    private readonly moonDirection = new THREE.Vector3();

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    enable(config: GisConfig, options: { applyInitialView?: boolean } = {}) {
        if (!config?.tiandituToken) {
            throw new Error("Tianditu token is required");
        }

        this.disable();
        config.atmosphereDateTime ||= DEFAULT_GIS_CONFIG.atmosphereDateTime;
        parseAtmosphereDateTime(config.atmosphereDateTime);
        this.config = config;

        const tiles = new TilesRenderer();
        const labels = new XYZTilesOverlay({
            url: tiandituUrl("cva", config.tiandituToken),
            levels: 19,
            dimension: 256,
            color: 0xffffff,
            opacity: 1,
        });
        const labelOverlay = labels as any;
        const fetchLabel = labelOverlay.fetch.bind(labelOverlay);
        labelOverlay.fetch = async (...args) => {
            try {
                const response = await fetchLabel(...args);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response;
            } catch (error) {
                this.notifyLoadError(error);
                throw error;
            }
        };
        const processLabel = labelOverlay.imageSource.processBufferToTexture.bind(labelOverlay.imageSource);
        labelOverlay.imageSource.processBufferToTexture = async (buffer) => {
            try {
                return await processLabel(buffer);
            } catch (error) {
                this.notifyLoadError(error);
                throw error;
            }
        };

        tiles.registerPlugin(new ImageOverlayPlugin({
            renderer: this.viewer.renderer,
            overlays: [labels],
        }));
        tiles.registerPlugin(new XYZTilesPlugin({
            shape: "ellipsoid",
            levels: 19,
            tileDimension: 256,
            url: tiandituUrl("img", config.tiandituToken),
        }));
        tiles.setCamera(this.viewer.camera);
        tiles.setResolutionFromRenderer(this.viewer.camera, this.viewer.renderer);
        tiles.group.name = "GIS Base Map";
        tiles.group.ignore = true;
        // XYZ image tiles use transparent materials, so render them before business overlays.
        tiles.group.renderOrder = -1;
        tiles.addEventListener("load-error", (event) => {
            this.notifyLoadError(event.error);
        });

        const controls = new GlobeControls(
            tiles.group,
            this.viewer.camera,
            this.viewer.renderer.domElement,
            tiles,
        );
        controls.enableDamping = true;
        controls.adjustHeight = false;
        controls.addEventListener("start", () => {
            controls.adjustHeight = true;
        });
        controls.addEventListener("change", () => {
            useDispatchSignal("cameraChanged", this.viewer.camera, controls);
        });

        this.tiles = tiles;
        this.controls = controls;
        this.enabled = true;
        this.viewer.scene.add(tiles.group);
        this.createAtmosphere();
        this.viewer.modules.controls.enabled = false;
        this.viewer.modules.viewHelper.hidden = true;

        if (options.applyInitialView !== false) {
            this.flyTo({
                longitude: config.initialView.longitude,
                latitude: config.initialView.latitude,
                height: 0,
            }, config.initialView.altitude);
        }
    }

    private notifyLoadError(error: unknown) {
        if (this.loadErrorShown) return;
        this.loadErrorShown = true;
        console.error("[GIS] Tianditu tile load failed", error);
        (window as any).$message?.error("天地图影像或注记加载失败，请检查 Token 或网络");
    }

    private createAtmosphere() {
        if (!this.config) return;

        const generation = ++this.atmosphereGeneration;
        const group = new THREE.Group();
        group.name = "GIS Atmosphere";
        group.ignore = true;

        const generator = new PrecomputedTexturesGenerator(this.viewer.renderer);
        const skyMaterial = new SkyMaterial();
        applyAtmosphereExposure(skyMaterial);
        Object.assign(skyMaterial, generator.textures);
        const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMaterial);
        sky.frustumCulled = false;
        group.add(sky);

        this.atmosphereGroup = group;
        this.atmosphereGenerator = generator;
        this.sky = sky;
        this.skyMaterial = skyMaterial;
        this.viewer.scene.add(group);
        this.applyAtmosphereDateTime(this.config.atmosphereDateTime);

        generator.update().then(() => {
            if (generation === this.atmosphereGeneration) {
                this.viewer.render();
            }
        }).catch((error: unknown) => {
            if (generation !== this.atmosphereGeneration) return;
            this.notifyAtmosphereError(error);
            this.clearAtmosphere();
        });

        void fetch(STARS_DATA_URL).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
        }).then((data) => {
            if (generation !== this.atmosphereGeneration || !this.atmosphereGenerator) return;

            const starsMaterial = new StarsMaterial({
                intensity: 10 * ATMOSPHERE_EXPOSURE,
            });
            applyAtmosphereExposure(starsMaterial);
            Object.assign(starsMaterial, this.atmosphereGenerator.textures);
            const stars = new THREE.Points(new StarsGeometry(data), starsMaterial);
            stars.frustumCulled = false;

            this.starsMaterial = starsMaterial;
            this.stars = stars;
            group.add(stars);
            this.applyAtmosphereDateTime(this.config!.atmosphereDateTime);
            this.viewer.render();
        }).catch((error: unknown) => {
            if (generation === this.atmosphereGeneration) {
                this.notifyAtmosphereError(error);
            }
        });
    }

    private notifyAtmosphereError(error: unknown) {
        if (this.atmosphereErrorShown) return;
        this.atmosphereErrorShown = true;
        console.error("[GIS] Atmosphere initialization failed", error);
        (window as any).$message?.warning("GIS 大气初始化失败，已保留场景背景");
    }

    private applyAtmosphereDateTime(value: string) {
        const date = parseAtmosphereDateTime(value);
        getECIToECEFRotationMatrix(date, this.atmosphereRotation);
        getSunDirectionECI(date, this.sunDirection).applyMatrix4(this.atmosphereRotation);
        getMoonDirectionECI(date, this.moonDirection).applyMatrix4(this.atmosphereRotation);

        this.skyMaterial?.sunDirection.copy(this.sunDirection);
        this.skyMaterial?.moonDirection.copy(this.moonDirection);
        this.starsMaterial?.sunDirection.copy(this.sunDirection);
        this.stars?.setRotationFromMatrix(this.atmosphereRotation);
    }

    setAtmosphereDateTime(value: string) {
        parseAtmosphereDateTime(value);
        if (!this.config) return;

        this.config.atmosphereDateTime = value;
        this.applyAtmosphereDateTime(value);
        this.viewer.render();
    }

    private clearAtmosphere() {
        ++this.atmosphereGeneration;
        this.atmosphereGroup?.removeFromParent();
        this.sky?.geometry.dispose();
        this.skyMaterial?.dispose();
        this.stars?.geometry.dispose();
        this.starsMaterial?.dispose();
        this.atmosphereGenerator?.dispose();

        this.atmosphereGroup = null;
        this.atmosphereGenerator = null;
        this.sky = null;
        this.skyMaterial = null;
        this.stars = null;
        this.starsMaterial = null;
    }

    disable() {
        this.enabled = false;
        this.clearAtmosphere();
        this.controls?.dispose();
        this.controls = null;

        if (this.tiles) {
            this.tiles.group.removeFromParent();
            this.tiles.dispose();
        }
        this.tiles = null;
        this.config = null;
        this.loadErrorShown = false;
        this.atmosphereErrorShown = false;

        if (this.viewer.modules) {
            this.viewer.modules.controls.enabled = true;
            this.viewer.modules.viewHelper.hidden = false;
        }
    }

    rebindRenderer() {
        if (!this.enabled || !this.config) return;
        const config = this.config;
        this.enable(config, { applyInitialView: false });
    }

    update(delta: number) {
        if (!this.enabled || !this.tiles || !this.controls) return false;

        this.controls.update(delta);
        this.viewer.camera.updateMatrixWorld();
        this.tiles.setCamera(this.viewer.camera);
        this.tiles.setResolutionFromRenderer(this.viewer.camera, this.viewer.renderer);
        this.tiles.update();
        return true;
    }

    screenToGeodetic(x: number, y: number): GeoPosition | null {
        const width = this.viewer.container.offsetWidth;
        const height = this.viewer.container.offsetHeight;
        if (width === 0 || height === 0) return null;

        this.viewer.camera.updateMatrixWorld();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(
            new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1),
            this.viewer.camera,
        );

        const intersection = Ellipsoid.WGS84.getIntersection(raycaster.ray);
        if (!intersection) return null;

        const geodetic = new Geodetic().setFromECEF(intersection);
        return {
            longitude: THREE.MathUtils.radToDeg(geodetic.longitude),
            latitude: THREE.MathUtils.radToDeg(geodetic.latitude),
            height: geodetic.height,
        };
    }

    createGeoAnchor(object: THREE.Object3D, position: GeoPosition) {
        const anchor = new THREE.Group();
        anchor.name = `地理锚点 - ${object.name || object.type}`;
        applyGeoAnchorTransform(anchor, position);
        anchor.add(object);
        return anchor;
    }

    setGeoPosition(anchor: THREE.Object3D, position: GeoPosition) {
        applyGeoAnchorTransform(anchor, position);
        useDispatchSignal("objectChanged", anchor);
        useDispatchSignal("sceneGraphChanged");
    }

    flyTo(position: GeoPosition, distance = this.config?.initialView.altitude ?? 20_000_000) {
        assertGeoPosition(position);

        const target = toECEF(position);
        new PointOfView(distance, 0, -Math.PI / 2).decompose(
            target,
            this.viewer.camera.position,
            this.viewer.camera.quaternion,
            this.viewer.camera.up,
        );
        this.viewer.camera.updateMatrixWorld(true);
        this.controls?.setCamera(this.viewer.camera);
        this.controls?.adjustCamera(this.viewer.camera);
        this.viewer.render();
    }

    rehydrateAnchors(scene: THREE.Object3D) {
        scene.traverse((object) => {
            const position = getGeoPosition(object);
            if (position) applyGeoAnchorTransform(object, position);
        });

        if (this.tiles && this.tiles.group.parent !== this.viewer.scene) {
            this.viewer.scene.add(this.tiles.group);
        }
    }

    dispose() {
        this.disable();
    }
}
