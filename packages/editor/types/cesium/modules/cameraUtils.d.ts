import * as Cesium from 'cesium';
/**
 * @Date 2022-06-09
 * @Author 二三
 * @param {*} viewer Cesium.Viewer
 * @Description: cesium相机类
 */
export default class CameraUtils {
    viewer: Cesium.Viewer | null;
    entity: Cesium.Entity | null;
    constructor();
    init(): void;
    setViewer(viewer: any): void;
    /**
     * 修改鼠标操作方式
     */
    changeMouseOperate(): void;
    flyTo(lng: any, lat: any, distance: any, pitch?: number, heading?: number): void;
    /**
     * 销毁
     */
    destroy(): void;
}
