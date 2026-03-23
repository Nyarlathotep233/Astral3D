import MapLayer from "@/cesium/modules/mapLayer";
import CameraUtils from "@/cesium/modules/cameraUtils";
import * as Cesium from 'cesium';
import * as THREE from 'three';
import { VNode } from "vue";
export default class CesiumApp {
    dom: HTMLElement;
    cesiumParentElement: HTMLElement;
    viewer: Cesium.Viewer;
    helper: Cesium.EventHelper;
    module: {
        mapLayer: MapLayer;
        cameraUtils: CameraUtils;
    };
    _three: {
        camera: THREE.PerspectiveCamera;
        scene: THREE.Scene;
        sceneHelpers: THREE.Scene;
        showSceneHelpers: boolean;
        renderer: THREE.WebGLRenderer;
    };
    constructor(dom: any);
    getViewer(): Cesium.Viewer;
    /**
     * 场景事件监听
     */
    eventListener(): void;
    /**
     * 鼠标按下处理
     * @param event
     */
    onMouseDown(event: any): void;
    /**
     * 鼠标抬起处理
     * @param event
     */
    onMouseUp(event: any): void;
    /**
     * three 场景点击事件
     */
    handleClick(): void;
    /**
     * 初始化cesium 场景后的处理操作
     */
    handleInitCesiumAfter(): void;
    /**
     * 添加中国地图遮罩
     */
    addChinaMask(): void;
    /**
     * 获取与鼠标点击位置射线相交的对象数组
     */
    getIntersects(point: any): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>>[];
    /**
     * 添加VNode至 viewer._toolbar
     */
    addVNodeToViewer(vNode: VNode): void;
    /**
     * 重置cesium场景
     */
    reset(): void;
    /**
     * 销毁
     */
    destroy(): void;
}
