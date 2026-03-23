import * as Cesium from 'cesium';
/**
 * @Date 2023-03-07
 * @Author 二三
 * @Description: cesium地图底图图层管理
 */
export default class MapLayer {
    viewer: Cesium.Viewer | null;
    layers: {
        [s: string]: {
            satellite?: Cesium.UrlTemplateImageryProvider | Cesium.WebMapTileServiceImageryProvider;
            mark?: Cesium.UrlTemplateImageryProvider;
            vector?: Cesium.UrlTemplateImageryProvider;
        };
    };
    constructor();
    setViewer(viewer: any): void;
    /**
     * 获取默认底图
     * @param layer 底图类型，默认卫星影像图 enum: satellite | vector
     */
    getDefaultLayer(layer?: 'satellite' | 'vector'): Cesium.UrlTemplateImageryProvider | Cesium.WebMapTileServiceImageryProvider | undefined;
    /**
     * 获取默认底图对应得标记图
     */
    getMarkMapByDefaultLayer(): Cesium.UrlTemplateImageryProvider | undefined;
}
