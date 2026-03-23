import * as THREE from "three";
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import CesiumApp from "@/cesium/cesiumApp";
/**
 * @Date 2023-02-06
 * @Author 二三
 * @Description: cesium视图出口
 */
export default class ViewPort {
    app: CesiumApp;
    cesiumParentElement: HTMLElement;
    _three: {
        camera: THREE.PerspectiveCamera;
        scene: THREE.Scene;
        sceneHelpers: THREE.Scene;
        showSceneHelpers: boolean;
        renderer: THREE.WebGLRenderer;
        transformControls: TransformControls | null;
        box: THREE.Box3;
    };
    threeSelectionBox: THREE.Box3Helper;
    minWGS84: Array<number>;
    maxWGS84: Array<number>;
    animationFrameID: number | null;
    constructor(dom: any);
    init(): void;
    /**
     * 相关signals注册
     */
    signalsRegister(isAdd?: boolean): void;
    /**
     *
     */
    addButtonToViewer(): void;
    /**
     * cesium 开始加载后的相关操作
     */
    handleCesiumEvent(): void;
    /**
     * 初始化three变换控制器
     */
    initThreeTransformControls(): void;
    /**
     * 计算场景中心位置等信息
     */
    calcCenter(): void;
    /**
     * 处理three canvas 的 transformControls，以便于场景融合;
     */
    handleThreeMouseMove(event: any): void;
    /**
     * 飞行至three场景
     */
    flyToThree(): void;
    /**
     * cesium 渲染
     */
    renderCesium(): void;
    /**
     * 两个画布相机融合
     */
    fusionCanvas(): void;
    /**
     * three 渲染器的渲染
     */
    renderThree(): void;
    loop(): void;
    destroy(): void;
}
