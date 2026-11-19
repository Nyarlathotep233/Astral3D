/**
 * @file Package.ts
 * @description 场景打包解包
 * @create 2024-07-31
 * @update 2025-02-14
 * @version 5.0.0
 */
import { Mesh, Group, Bone } from "three";
import JSZip from "jszip";
import { BASE64_TYPES, TYPED_ARRAYS } from "@/constant";
import { unzip, zip, fetchController } from "@/utils";
import { PackageSkeleton } from "@/core/loader/Package.Skeleton";
import { useDispatchSignal } from "@/hooks";
import { ObjectLoader } from './ObjectLoader';
import App from "@/core/app/App";
import type Viewer from "@/core/viewer/Viewer";

interface IPackConfig {
    name: string; // 首包名称
    layer?: number; // 拆分的最深层级 0:拆分至最深层
    sceneInfo?: Partial<IAppProject.SceneInfo>; // 本次快照元数据，不修改编辑中的 App.project
    zipUploadFun: (zip: File) => Promise<any>; // 压缩包上传接口函数，多压缩包
    onProgress?: (progress: number) => void; // 打包进度回调
    onComplete?: (_: { firstUploadResult: any, totalSize: number, totalZipNumber: number }) => void; // 打包完成回调
}

interface IUnpackConfig {
    url: string, // 首包url
    files?: ReadonlyMap<string, Blob>; // In-memory project package, keyed by file name including the first package.
    deferHtmlPanels?: boolean; // Restore authored HTML options without mounting active content.
    onSceneLoad?: (sceneJson: ISceneJson, configJson: IAppProject.Config) => void, // 场景首包加载完成回调
    onProgress?: (progress: number) => void; // 场景加载进度回调
    onComplete?: () => void; // 场景加载完成回调.
    onError?: (error: Error) => void; // 下载、解析或资源依赖失败；不会继续触发完成回调
}

interface SourceData {
    name: string;
    json?: string | ArrayBuffer
    texture?: string | ArrayBuffer;
    geometry?: string;
    drawing?: string;
}

export class Package {
    protected viewer:Viewer;
    // 控制fetch并发
    static _fetch = fetchController(10, false);

    private totalSize: number = 0; // 总包体大小

    private geometryArr: any[];
    private imagesArr: any[];
    private materialsArr: any[];
    private textureArr: any[];
    private skeletonsArr: any[];

    // 解压时 对应文件夹前缀url
    private prefix_url: string;
    private loader: ObjectLoader;

    private geometryMap: Map<string, any>;
    private imagesMap: Map<string, any>;
    private materialsMap: Map<string, any>;
    private textureMap: Map<string, any>;
    private callFunNum: { value: number; };
    private skeletonClass: PackageSkeleton;
    private groupJsonPromises = new Map<string, Promise<any>>();
    private unpackAbort = new AbortController();
    private unpackFailed = false;
    private unpackErrorHandler?: (error: Error) => void;
    private packageFiles?: ReadonlyMap<string, Blob>;

    private failUnpack = (error: unknown) => {
        if (this.unpackFailed || this.unpackAbort.signal.aborted) return;
        this.unpackFailed = true;
        this.unpackAbort.abort();
        const failure = error instanceof Error ? error : new Error(String(error));
        if (this.unpackErrorHandler) this.unpackErrorHandler(failure);
        else console.error('Package unpack failed:', failure);
    };

    constructor(viewer:Viewer) {
        this.viewer = viewer;

        // 存储已参与打包过的geometry uuid
        this.geometryArr = [];
        // 存储已参与打包过的images uuid
        this.imagesArr = [];
        // 存储已参与打包过的materials uuid
        this.materialsArr = [];
        // 存储已参与打包过的texture uuid
        this.textureArr = [];
        // 存储已参与打包过的skeleton uuid
        this.skeletonsArr = [];

        /**  下面都是解包用  */
        this.prefix_url = "";
        this.loader = new ObjectLoader();

        this.geometryMap = new Map<string, any>();
        this.imagesMap = new Map<string, any>();
        this.materialsMap = new Map<string, any>();
        this.textureMap = new Map<string, any>();

        this.callFunNum = { value: 0 };

        this.skeletonClass = new PackageSkeleton();
    }

    /*  -------------------------------------------- 切片打包 ---------------------------------------------------   */

    /**
     * 处理 geometry json
     * @param arr 几何数据数组
     */
    private handleGeometryJson(arr) {
        function handler(value) {
            if (value instanceof Array) {
                return zip(value, false);
            }
            return value;
        }

        return arr.map((geometry) => {
            if (geometry.data) {
                const data = geometry.data;
                if (data.attributes) {
                    for (let key in data.attributes) {
                        data.attributes[key].array = handler(data.attributes[key].array);
                    }
                }
                if (data.index) {
                    data.index.array = handler(data.index.array);
                }
            }
            return geometry;
        })
    }

    /**
     * 处理 image json
     * @param imageJson
     * @param zipData 存储待压缩数据
     * @returns {string} 返回贴图存储文件名称
     */
    handleImage(imageJson:ITHREEScene.ImageJSON, zipData:SourceData[]): string {
        if (typeof imageJson.url === "string") {
            const name = imageJson.uuid + `.${BASE64_TYPES[imageJson.url.split(",")[0]]}`;
            zipData.push({ name, texture: imageJson.url });
            return name;
        }

        // 20250707:three的toJSON方法暂不支持KTX2纹理，会返回{url:{},uuid:"xxxxx"}
        if (!imageJson.url.type) {
            const name = imageJson.uuid + `.ktx2`;
            zipData.push({ name, texture: JSON.stringify(imageJson.url) });
            return name;
        }

        const name = `${imageJson.url.type}!${imageJson.url.width}!${imageJson.url.height}!${imageJson.uuid}.env`;
        const buffer = new TYPED_ARRAYS[imageJson.url.type](imageJson.url.data);
        zipData.push({ name, texture: buffer.buffer });
        return name;
    }

    /**
     * 处理 mesh json
     * @param mesh
     * @param json group json
     * @param zipData 存储待压缩数据
     */
    handleMesh(mesh: Mesh, json:ITHREEScene.SceneJSON, zipData:SourceData[], includeObject = true) {
        const meshJson: any = mesh.toJSON() as unknown as ITHREEScene.MeshJSON;

        // 处理几何数据
        if (meshJson.geometries) {
            const geometries: any = [];
            meshJson.geometries.forEach((geometry) => {
                if (this.geometryArr.indexOf(geometry.uuid) === -1) {
                    this.geometryArr.push(geometry.uuid);
                    geometries.push(geometry);
                }
            })

            !json.geometries && (json.geometries = []);
            json.geometries.push(...this.handleGeometryJson(geometries));
        }

        // Shape/Extrude parameters refer to Shape UUIDs. Shapes are parsed per
        // package, so deduplicate within this JSON rather than across packages.
        if (meshJson.shapes) {
            const output = json as any;
            output.shapes ||= [];
            for (const shape of meshJson.shapes) {
                if (!output.shapes.some((existing) => existing.uuid === shape.uuid)) output.shapes.push(shape);
            }
        }

        // 处理贴图image
        if (meshJson.images) {
            meshJson.images.forEach((image) => {
                if (this.imagesArr.indexOf(image.uuid) === -1) {
                    this.imagesArr.push(image.uuid);

                    !json.images && (json.images = []);

                    const name = this.handleImage(image, zipData)
                    if(name){
                        json.images.push(name);
                    }
                }
            })
        }

        // 处理贴图texture
        if (meshJson.textures) {
            meshJson.textures.forEach((texture) => {
                if (this.textureArr.indexOf(texture.uuid) === -1) {
                    this.textureArr.push(texture.uuid);

                    !json.textures && (json.textures = []);

                    json.textures.push(texture);
                }
            })
        }

        // 处理材质material
        if (meshJson.materials) {
            meshJson.materials.forEach((material) => {
                if (this.materialsArr.indexOf(material.uuid) === -1) {
                    this.materialsArr.push(material.uuid);

                    !json.materials && (json.materials = []);

                    json.materials.push(material);
                }
            })
        }

        // 处理骨骼动画
        if (meshJson.skeletons) {
            meshJson.skeletons.forEach((skeleton) => {
                if (this.skeletonsArr.indexOf(skeleton.uuid) === -1) {
                    this.skeletonsArr.push(skeleton.uuid);

                    !json.skeletons && (json.skeletons = []);

                    json.skeletons.push(skeleton);
                }
            })
        }

        // 处理动画
        if (meshJson.animations) {
            !json.animations && (json.animations = []);

            json.animations.push(...meshJson.animations);
        }

        // object 字段存入group json(parent json)
        if (includeObject && meshJson.object) {
            !json.object.children && (json.object.children = []);

            json.object.children.push(meshJson.object);
        }
    }

    /**
     * 按 group 分组各打包为1个zip文件
     * @param {IPackConfig} packConfig
     * @remarks 首包保存scene基本信息 和 图纸信息 及 基础配置
     * @remarks 前面已打包的几何数据和材质贴图不会再次打包
     */
    async pack(packConfig: IPackConfig) {
        const objectUuids = new Set<string>();
        const validate = (object) => {
            if (object.ignore) return;
            if (objectUuids.has(object.uuid)) throw new Error(`Cannot save duplicate object UUID: ${object.uuid} (${object.name || object.type})`);
            objectUuids.add(object.uuid);
            for (const child of object.children) validate(child);
        };
        validate(this.viewer.scene);
        const maxGroupLayer = packConfig.layer || 0;

        this.totalSize = 0;

        // 首包保存scene基本信息,不clone子级
        const newScene = this.viewer.scene.clone(false);
        newScene.children = [];

        const sceneJson = newScene.toJSON() as unknown as ITHREEScene.SceneJSON;
        // scene uuid需要和原来一致，防止绑定在scene的脚本无法还原
        sceneJson.object.uuid = this.viewer.scene.uuid;
        sceneJson.object.children = [];

        // 20250718: 环境类型是ModelViewer时需要特殊处理，因为scene.toJSON()不会处理renderTargetTexture
        if(newScene.environment && newScene.environment.isRenderTargetTexture){
            sceneJson.object.environmentType = "ModelViewer";
        }

        const sceneZipData: SourceData[] = [];
        // 处理背景和环境贴图
        if (!sceneJson.images) sceneJson.images = [];
        sceneJson.images = sceneJson.images.map((image) => this.handleImage(image as ITHREEScene.ImageJSON, sceneZipData));

        // 保存场景中需打包的group数组
        let groupArr: Group[] = [];
        const groupLayers = new Map<string, number>();

        // 处理 scene 子级
        this.viewer.scene.children.forEach((child) => {
            if (child.ignore) return;

            // 3DTiles 处理
            if (child.isTilesGroup || child.type === "TilesGroup") {
                const targetGroup = child.clone(false);
                const tilesJson = targetGroup.toJSON().object;

                sceneJson.object.children?.push(tilesJson);

                return;
            }

            if (child.type === "Group" || child.children?.length > 0) {
                sceneJson.object.children?.push(child.uuid);

                groupLayers.set(child.uuid, 1);
                groupArr.push(child as Group);

                child.traverseByCondition((c) => {
                    // 不递归自身
                    if (c.uuid === child.uuid) return;

                    // 3DTiles 此处不处理
                    if (c.isTilesGroup || c.type === "TilesGroup") return;

                    if (c.type === "Group" || c.children?.length > 0) {
                        const groupLayer = (groupLayers.get(c.parent?.uuid) || 0) + 1;
                        groupLayers.set(c.uuid, groupLayer);
                        if (groupLayer <= maxGroupLayer || maxGroupLayer === 0) {
                            groupArr.push(c);
                        }
                    }
                }, (c) => !c.ignore)
            } else {
                this.handleMesh(<Mesh>child, sceneJson, sceneZipData);
            }
        })

        // 将所有几何数据取出 单独存储
        if (sceneJson.geometries) {
            // 为避免数据量过大超过V8引擎对于字符串2^32的限制，分为多个切片（10个几何数据为一组）json
            const transferNum = Math.ceil(sceneJson.geometries.length / 10);
            for (let i = 0; i < transferNum; i++) {
                const name = `geometries_${i}.json`;
                const geometry = JSON.stringify(sceneJson.geometries.slice(i * 10, (i + 1) * 10));
                sceneZipData.push({ name, geometry });
            }
            sceneJson.geometries = [];
        }

        const drawingInfo = App.project.getKey("drawing");
        const sceneInfo = Object.assign({}, App.project.getKey("sceneInfo"), packConfig.sceneInfo, {
            // 覆盖原zip包位置
            zip:"",
            hasDrawing: drawingInfo.isUploaded ? 1 : 0,
        });

        // 图纸
        if (drawingInfo.isUploaded) {
            // 图片
            sceneZipData.push({
                name: sceneInfo.id + `.${BASE64_TYPES[drawingInfo.imgSrc.split(",")[0]]}`,
                drawing: drawingInfo.imgSrc
            });

            // 标记
            sceneZipData.push({ name: "drawingMark.txt", drawing: zip(drawingInfo.markList) });

            // 图片信息(宽高信息等，以便于其他地方使用可计算标记左上距离百分比)
            sceneZipData.push({ name: "drawingImgInfo.json", drawing: JSON.stringify(drawingInfo.imgInfo) });

            console.log(sceneZipData,drawingInfo)
        }

        // 项目配置
        sceneZipData.push({
            name: "config.json",
            json: JSON.stringify({
                // 项目运行是否启用xr
                xr: App.project.getKey("xr"),
                // 项目渲染器配置
                renderer: App.project.getKey("renderer"),
                // 项目级联阴影映射
                csm: App.project.getKey("csm"),
                // 项目后处理配置
                effect: App.project.getKey("effect"),
                // 项目天气配置
                weather: App.project.getKey('weather')
            })
        });

        const totalNum = groupArr.length + 1;
        sceneZipData.push({
            name: "scene.json",
            json: JSON.stringify({
                // 解包时需要还原的编辑器场景信息
                metadata: App.metadata,
                camera: this.viewer.camera.toJSON(),
                scene: sceneJson,
                scripts: App.scripts,
                controls: {
                    state: this.viewer.modules.controls.toJSON(),
                },
                totalZipNumber: totalNum,
                sceneInfo: sceneInfo,
            })
        });

        // 首包上传
        const firstUploadResult = await this.zip(sceneZipData, packConfig.name, packConfig.zipUploadFun);

        // 进度
        let progress = 0;
        packConfig.onProgress && packConfig.onProgress(parseFloat((progress / groupArr.length * 100).toFixed(2)));

        // 遍历打包group并上传
        for (const group of groupArr) {
            // clone(false) 不克隆子元素
            const g = group.clone(false);
            g.children = [];

            // 空 group
            let json: any = g.toJSON() as unknown as ITHREEScene.SceneJSON;
            json.geometries = [];
            json.images = [];
            json.textures = [];
            json.materials = [];
            json.shapes = [];
            json.skeletons = [];
            json.animations = [];
            json.object.uuid = group.uuid;
            json.object.children = [];

            // 存储待压缩数据
            const zipData: SourceData[] = [];

            // A Mesh/Line/Points with children is also a package root. Its own
            // resource references must survive alongside the child resources.
            this.handleMesh(g as unknown as Mesh, json, zipData, false);

            group.children.forEach((child) => {
                // 被groupArr包含的子级后面会单独处理，此处仅引用其uuid
                if (groupArr.find(item => item.uuid === child.uuid)) {
                    json.object.children?.push(child.uuid);
                    return;
                }

                // 3DTiles 处理
                if (child.isTilesGroup || child.type === "TilesGroup") {
                    const targetGroup = child.clone(false);
                    const tilesJson = targetGroup.toJSON().object;

                    json.object.children?.push(tilesJson);

                    return;
                }

                this.handleMesh(<Mesh>child, json, zipData);
            })

            // 将所有几何数据取出 单独存储
            if (json.geometries) {
                // 为避免数据量过大超过V8引擎对于字符串2^32的限制，分为多个切片（10个几何数据为一组）json
                const transferNum = Math.ceil(json.geometries.length / 10);
                for (let i = 0; i < transferNum; i++) {
                    const name = `geometries_${i}.json`;
                    const geometry = JSON.stringify(json.geometries.slice(i * 10, (i + 1) * 10));
                    zipData.push({ name, geometry });
                }
                json.geometries = [];
            }

            // json 打包
            // 还原uuid
            json.object.uuid = group.uuid;
            const name = `${group.uuid}.json`;
            const content = JSON.stringify(json);
            zipData.push({ name, json: content });

            await this.zip(zipData, group.uuid, packConfig.zipUploadFun);

            progress++;
            packConfig.onProgress && packConfig.onProgress(parseFloat((progress / groupArr.length * 100).toFixed(2)));
        }

        // reset
        groupArr = [];
        this.geometryArr = [];
        this.imagesArr = [];
        this.materialsArr = [];
        this.textureArr = [];

        packConfig.onComplete && packConfig.onComplete({ firstUploadResult, totalSize: this.totalSize, totalZipNumber: totalNum });

        return { firstUploadResult, totalSize: this.totalSize, totalZipNumber: totalNum };
    }

    /**
     * zip 打包
     * @param sourceData 待打包数据
     * @param {string | number} zipName 打包文件名
     * @return {Promise<any>} 返回包上传接口结果
     */
    private async zip(sourceData: SourceData[], zipName: string | number, zipUploadFun: (zip: File) => Promise<any>): Promise<any> {
        const jszip = new JSZip();
        const imgFolder = jszip.folder("Textures") as JSZip; // 贴图文件夹
        const geometriesFolder = jszip.folder("Geometries") as JSZip; // 几何数据文件夹
        let drawingFolder = jszip.folder("Drawing") as JSZip; // 图纸文件夹

        sourceData.forEach((item) => {
            if (item.texture) {
                imgFolder.file(item.name, item.texture, {
                    compression: "DEFLATE",//"STORE",//"DEFLATE
                    compressionOptions: {
                        level: 7
                    }
                });
            } else if (item.geometry) {
                geometriesFolder.file(item.name, item.geometry, {
                    compression: "DEFLATE",//"STORE",//"DEFLATE
                    compressionOptions: {
                        level: 7
                    }
                });
            } else if (item.json) {
                jszip.file(item.name, item.json, {
                    compression: "DEFLATE",//"STORE",//"DEFLATE
                    compressionOptions: {
                        level: 7
                    }
                });
            } else if (item.drawing) {
                drawingFolder.file(item.name, item.drawing, {
                    compression: "DEFLATE",//"STORE",//"DEFLATE
                    compressionOptions: {
                        level: 9
                    }
                });
            }
        })

        const content = await jszip.generateAsync({ type: 'blob' });

        const zipFile = new File([content], `${zipName}.zip`, { type: "application/zip" });

        this.totalSize += zipFile.size;

        // 上传zip包
        return await zipUploadFun(zipFile);
    }

    /*  -------------------------------------------- 解包 ---------------------------------------------------   */

    /**
     * 还原几何数据
     * @param arr
     * @private
     */
    private unGzipGeometryJson(arr) {
        // 几何数据array 还原
        function handler(value) {
            if (typeof value === "string") {
                return unzip(value, false);
            }
            return value;
        }

        return arr.map((geometry) => {
            if (geometry.data) {
                const data = geometry.data;
                if (data.attributes) {
                    for (let key in data.attributes) {
                        data.attributes[key].array = handler(data.attributes[key].array);
                    }
                }
                if (data.index) {
                    data.index.array = handler(data.index.array);
                }
            }
            return geometry;
        })
    }

    /**
     * 还原贴图
     * @param imageName
     * @param data
     */
    private unGzipImage(imageName: string, data) {
        const nameSplit = imageName.split(".");
        if (nameSplit[1] === "env") {
            const urlSplit = nameSplit[0].split("!");
            this.imagesMap.set(urlSplit[3], {
                uuid: urlSplit[3],
                url: {
                    type: urlSplit[0],
                    width: parseInt(urlSplit[1]),
                    height: parseInt(urlSplit[2]),
                    /**
                     * sceneJson打zip包前原数据为Array,此处解压后我们使用ArrayBuffer，不还原为Array
                     * 还原为Array这样写 Array.from(new TYPED_ARRAYS[urlSplit[0]](textureMap.get(urlSplit[3] + ".env")))
                     **/
                    data: data
                }
            });
        } else {
            this.imagesMap.set(nameSplit[0], {
                uuid: nameSplit[0],
                url: data
            });
        }
    }

    /**
     * 记录materials、texture、geometry已加载的uuid
     * @param object3D 模型json
     */
    private recordUuid(object3D) {
        if (object3D.geometries) {
            object3D.geometries.forEach((geometry) => {
                this.geometryMap.set(geometry.uuid, geometry);
            })
        }
        if (object3D.materials) {
            object3D.materials.forEach((material) => {
                this.materialsMap.set(material.uuid, material);
            })
        }
        if (object3D.textures) {
            object3D.textures.forEach((texture) => {
                this.textureMap.set(texture.uuid, texture);
            })
        }
    }

    /**
     * 从首包开始解包
     * @param {IUnpackConfig} unpackConfig
     */
    public unpack(unpackConfig: IUnpackConfig) {
        this.unpackAbort.abort();
        this.unpackAbort = new AbortController();
        this.unpackFailed = false;
        this.unpackErrorHandler = unpackConfig.onError;
        this.packageFiles = unpackConfig.files;
        this.loader.deferHtmlPanels = unpackConfig.deferHtmlPanels === true;
        this.groupJsonPromises.clear();
        const signal = this.unpackAbort.signal;
        unpackConfig.onProgress && unpackConfig.onProgress(0);
        let totalZipNumber = 0, progress = 0;

        const match = unpackConfig.url.match( /(.*[\\/])?([a-zA-Z0-9]+-V\d+)(?=[\\/]|$)/);
        this.prefix_url = this.viewer.options.request?.baseUrl + (match ? match[0] : unpackConfig.url.substring(0, unpackConfig.url.lastIndexOf("/")));

        // indexDb存储
        // const db = window.VIEWPORT.modules["db"];
        //const dbKey = `${useProjectState.getState().sceneId}-${useProjectState.getState().version.id}`;

        const that = this;
        this.callFunNum = new Proxy({ value: 0 }, {
            set(target, p, value) {
                if (signal.aborted || that.unpackFailed) return true;
                if (target[p] < value) {
                    progress += (value - target[p]) / totalZipNumber * 100;
                    unpackConfig.onProgress && unpackConfig.onProgress(progress);
                }
                target[p] = value;

                if (value <= 0) {
                    const done = () => {
                        // 重置清除map
                        that.geometryMap.clear();
                        that.imagesMap.clear();
                        that.materialsMap.clear();
                        that.textureMap.clear();
                        // @ts-ignore 清除loader
                        that.loader = undefined;
                    }

                    const complete = () => {
                        done();

                        // 场景内容加载完毕后注入脚本执行逻辑
                        that.viewer.installScripts();

                        that.viewer.dispatchEvent({type:"loaded"})

                        that.skeletonClass.clear();

                        // 关闭IndexDB 否则新的标签页无法正常打开
                        // db.close();

                        unpackConfig.onComplete && unpackConfig.onComplete();
                    }

                    try { complete(); } catch (error) { that.failUnpack(error); }
                }
                return true;
            }
        });

        // map 存储 json 解析完成后执行的 function; key 为 uuid
        const funcMap = new Map<string, Function>();

        const loadScene = (sceneJson: ISceneJson,drawingInfo:IDrawingInfo | null, configJson: IAppProject.Config) => {
            if (signal.aborted) return;
            App.fromJSON(sceneJson, signal, unpackConfig.deferHtmlPanels ? this.loader : undefined).then(async (scene) => {
                if (signal.aborted) return;
                // 还原控制器
                if (sceneJson.controls?.state) {
                    this.viewer.modules.controls.fromJSON(sceneJson.controls.state, true);
                }

                // 管理3DTiles
                scene.traverseByCondition((c) => {
                    if (c.isTilesGroup || c.type === "TilesGroup") {
                        this.viewer.addTiles(c,"none");
                    }
                }, (c) => !c.ignore)

                if (drawingInfo) {
                    const projectDrawing = App.project.getKey("drawing");

                    projectDrawing.isCad = drawingInfo.imgSrc.split(".").pop() === "dxf";
                    projectDrawing.imgSrc = drawingInfo.imgSrc;
                    projectDrawing.markList = drawingInfo.markList;
                    projectDrawing.imgInfo = drawingInfo.imgInfo;
                    projectDrawing.isUploaded = true;
                }

                // 还原项目配置
                if (configJson) {
                    App.project.setKey('xr',configJson.xr || false);

                    if (configJson.renderer) {
                        App.project.setKey("renderer",configJson.renderer);
                        // fps需要通过 App.FPS 进行set才能正确计算单帧渲染时长
                        App.FPS = Number(configJson.renderer.fps);
                    }

                    if(configJson.csm){
                        const projectCSM = App.project.getKey("csm");
                        let _csmNotChange = true;

                        Object.keys(configJson.csm).forEach(csmKey => {
                            if (projectCSM[csmKey] !== configJson.csm[csmKey]){
                                projectCSM[csmKey] = configJson.csm[csmKey];
                                _csmNotChange = false;
                            }
                        })

                        if (!_csmNotChange){
                            App.csm.enabled = projectCSM.enabled;
                        }
                    }

                    if(configJson.effect){
                        Object.keys(configJson.effect).forEach((key) => {
                            App.project.setKey(`effect.${key}`,configJson.effect[key]);
                        });
                    }

                    if (configJson.weather) {
                        const projectWeather = App.project.getKey("weather");

                        if (configJson.weather.fog) {
                            Object.keys(configJson.weather.fog).forEach((key) => {
                                projectWeather.fog[key] = configJson.weather.fog[key];
                            });
                            useDispatchSignal("sceneFogSettingsChanged");
                        }

                        if (configJson.weather.rain) {
                            Object.keys(configJson.weather.rain).forEach((key) => {
                                projectWeather.rain[key] = configJson.weather.rain[key];
                            });
                            useDispatchSignal("sceneRainSettingsChanged");
                        }

                        if (configJson.weather.snow) {
                            Object.keys(configJson.weather.snow).forEach((key) => {
                                projectWeather.snow[key] = configJson.weather.snow[key];
                            });
                            useDispatchSignal("sceneSnowSettingsChanged");
                        }
                    }
                }

                // 添加indexDB表存储zip包
                // await db.addStore(dbKey);

                unpackConfig.onSceneLoad && unpackConfig.onSceneLoad(sceneJson, configJson);

                // 防止项目只有一个包的情况造成不触发proxy set
                if (this.callFunNum.value === 0) {
                    this.callFunNum.value = 0;
                    unpackConfig.onProgress && unpackConfig.onProgress(100);
                }

                // 开始执行funcMap中的function
                funcMap.forEach((func, uuid) => {
                    func.call(this, uuid, scene, uuid);
                })
            }).catch(this.failUnpack)
        }

        const networkGet = () => {
            // 下载场景包
            const first = this.packageFiles
                ? this.readPackageFile(unpackConfig.url)
                : fetch(this.viewer.options.request?.baseUrl + unpackConfig.url, {signal})
                    .then(zipRes => { if (!zipRes.ok) throw new Error(`Package request failed: HTTP ${zipRes.status}`); return zipRes.blob(); });
            first
                .then(async (file) => {
                    unpackConfig.onProgress && unpackConfig.onProgress(1);

                    // @ts-ignore
                    let sceneJson: ISceneJson = undefined, configJson: IAppProject.Config = undefined;

                    // 开始解压首包
                    const zip = new JSZip();

                    // 几何数据数组
                    let geometries: Array<any> = [];

                    // 图纸信息
                    let drawingInfo:IDrawingInfo = {
                        imgSrc: "",
                        markList: [],
                        imgInfo: {
                            width: 0,
                            height: 0
                        }
                    }

                    const res = await zip.loadAsync(file);

                    /**
                     * res.files里包含整个zip里的文件描述、目录描述列表
                     * res本身就是JSZip的实例
                     */
                    for (let key in res.files) {
                        //判断是否是目录
                        if (!res.files[key].dir) {
                            const fileName = res.files[key].name;

                            //找到我们压缩包所需要的json文件
                            if (fileName === "scene.json") { // 场景json
                                const content = await res.file(fileName)?.async('string') as string;
                                //得到scene.json文件的内容
                                sceneJson = JSON.parse(content);
                            } else if (fileName === "config.json") { // 项目配置json
                                const content = await res.file(fileName)?.async('string') as string;
                                configJson = JSON.parse(content);
                            } else if (fileName.substring(0, 9) === "Textures/") {
                                /**
                                 * 贴图
                                 * 分为两种情况：
                                 * 1.贴图为env格式（type!width!height!uuid.env），转换为arraybuffer格式，存入map
                                 * 2.贴图为普通图片格式，直接存入map
                                 **/
                                if (/\.env$/.test(fileName)) {
                                    // 转换回贴图原始信息，存入map
                                    const content = await res.file(fileName)?.async('arraybuffer');
                                    this.unGzipImage(fileName.replace("Textures/", ""), content);
                                } else {
                                    const content = await res.file(fileName)?.async('string')
                                    this.unGzipImage(fileName.replace("Textures/", ""), content);
                                }
                            } else if (/^Geometries\/geometries_\d*\.json$/.test(fileName)) {
                                const content = await res.file(fileName)?.async('string') as string;
                                geometries.push(...this.unGzipGeometryJson(JSON.parse(content)));
                            } else if (/^Geometries\/geometries_\d*\.zip$/.test(fileName)) {
                                /** 此处为兼容整体打包的版本 **/
                                    // geometry切片zip包，内部是json文件
                                const content = await res.file(fileName)?.async('blob') as Blob;
                                const zip = new JSZip();
                                const zipRes = await zip.loadAsync(content);
                                for (let zipKey in zipRes.files) {
                                    const content = await zip.file(zipRes.files[zipKey].name)?.async('string') as string;
                                    geometries.push(...this.unGzipGeometryJson(JSON.parse(content)));
                                }
                            } else if (fileName.substring(0, 8) === "Drawing/") {
                                /**
                                 * 图纸文件夹下的文件
                                 * 1. drawingMarking.txt 为图纸标注文件，须解压
                                 * 2. sceneId开头的图片是图纸
                                 */
                                if (res.files[key].name === "Drawing/drawingMark.txt") {
                                    const content = await res.file(res.files[key].name)?.async('string') as string;
                                    drawingInfo.markList = unzip(content)
                                } else if (res.files[key].name === "Drawing/drawingImgInfo.json") {
                                    drawingInfo.imgInfo = JSON.parse(await res.file(res.files[key].name)?.async('string') as string);
                                } else {
                                    drawingInfo.imgSrc = await res.file(res.files[key].name)?.async('string') as string;
                                }
                            }
                        }
                    }

                    signal.throwIfAborted();
                    if (!sceneJson?.scene?.object) throw new Error('Package is missing scene.json');
                    totalZipNumber = sceneJson.totalZipNumber || 0;

                    // 贴图还原至sceneJson
                    sceneJson.scene.images = sceneJson.scene.images.map((item) => {
                        const nameSplit = item.split(".");
                        if (nameSplit[1] === "env") {
                            const urlSplit = nameSplit[0].split("!");
                            return this.imagesMap.get(urlSplit[3])
                        } else {
                            return this.imagesMap.get(nameSplit[0])
                        }
                    });

                    // 几何数据还原至sceneJson
                    sceneJson.scene.geometries = geometries;

                    this.recordUuid(sceneJson.scene);

                    // Shared resources can be authored in any sibling/nested package.
                    // Read their resource tables before parsing to avoid dependency deadlocks.
                    const groupIds = (sceneJson.scene.object.children || []).filter((child) => typeof child === 'string') as string[];
                    if (new Set(groupIds).size !== groupIds.length) throw new Error('Package contains duplicate group UUID references');
                    await Promise.all(groupIds.map((uuid) => this.fetchGroupJson(uuid)));
                    signal.throwIfAborted();
                    this.resolveGroupResources(sceneJson.scene);

                    const newChildren: any = [];
                    // 遍历sceneJson.object.children,拉取group zip还原
                    sceneJson.scene.object.children?.forEach(objectJsonOruuid => {
                        if (typeof objectJsonOruuid === "string") {
                            // 保存uuid对应的function
                            funcMap.set(objectJsonOruuid, this.unpackGroup);

                            this.callFunNum.value++;
                        } else {
                            newChildren.push(objectJsonOruuid)
                        }
                    })
                    sceneJson.scene.object.children = newChildren;

                    // 图档信息
                    const _drawingInfo = drawingInfo.imgSrc ? drawingInfo : null;
                    loadScene(sceneJson,_drawingInfo, configJson);

                    //sceneJson.scene.groupChildren = [...funcMap.keys()];

                    // 解压处理好的数据添加至 indexDB -> Msy3D -> scene
                    // db.setItem(dbKey, sceneJson);
                }).catch(this.failUnpack)
        }

        // db.getItem(dbKey).then((dbData) => {
        //     if (dbData === undefined) {
        networkGet();
        //     }else{
        //         this.recordUuid(dbData.scene);
        //
        //         dbData.scene.images.forEach((image) => {
        //             this.imagesMap.set(image.uuid, image);
        //         })
        //
        //         dbData.scene.groupChildren.forEach((uuid) => {
        //             // 保存uuid对应的function
        //             funcMap.set(uuid, this.unpackGroup);
        //
        //             this.callFunNum.value++;
        //         })
        //
        //         loadScene(dbData);
        //     }
        // })
    }

    /**
     * 异步解压group zip
     * @param uuid
     * @param parent
     * @param rootGroupUuid
     */
    /** Read complete dependency tables before parsing to avoid cross-package deadlocks. */
    private fetchGroupJson(uuid: string, ancestors = new Set<string>()): Promise<any> {
        if (ancestors.has(uuid)) return Promise.reject(new Error(`Package ${uuid} contains a cyclic group reference`));
        const existing = this.groupJsonPromises.get(uuid);
        if (existing) return existing;
        const signal = this.unpackAbort.signal;
        const blob = this.packageFiles ? this.readPackageFile(uuid + '.zip') : new Promise<any>((resolve, reject) => {
            Package._fetch(`${this.prefix_url}/${uuid}.zip`, {signal, onSuccess: resolve, onError: reject});
        }).then(async response => {
            if (response.ok === false) throw new Error(`Package ${uuid}: HTTP ${response.status}`);
            return response.blob();
        });
        const pending = blob.then(async file => {
            signal.throwIfAborted();
            const archive = await JSZip.loadAsync(file);
            let json: any;
            const geometries: any[] = [];
            for (const entry of Object.values(archive.files)) {
                if (entry.dir) continue;
                if (entry.name === `${uuid}.json`) json = JSON.parse(await entry.async('string'));
                else if (entry.name.startsWith('Textures/')) this.unGzipImage(entry.name.slice(9), await entry.async(entry.name.endsWith('.env') ? 'arraybuffer' : 'string'));
                else if (/^Geometries\/geometries_\d*\.json$/.test(entry.name)) geometries.push(...this.unGzipGeometryJson(JSON.parse(await entry.async('string'))));
            }
            signal.throwIfAborted();
            if (!json?.object) throw new Error(`Package ${uuid} is missing ${uuid}.json`);
            json.geometries = geometries;
            json.images = (json.images || []).map(item => {
                if (typeof item !== 'string') return item;
                const stem = item.slice(0, item.lastIndexOf('.'));
                const imageId = item.endsWith('.env') ? stem.split('!')[3] : stem;
                const image = this.imagesMap.get(imageId);
                if (!image) throw new Error(`Package ${uuid}: missing image ${item}`);
                return image;
            });
            this.recordUuid(json);
            const children = (json.object.children || []).filter(child => typeof child === 'string');
            if (new Set(children).size !== children.length) throw new Error(`Package ${uuid} contains duplicate group references`);
            const nextAncestors = new Set(ancestors); nextAncestors.add(uuid);
            await Promise.all(children.map(child => this.fetchGroupJson(child, nextAncestors)));
            signal.throwIfAborted();
            return json;
        });
        this.groupJsonPromises.set(uuid, pending);
        return pending;
    }

    /** Resolve the root and embedded descendants, material arrays, all texture slots and uniforms. */
    private resolveGroupResources(group: any) {
        group.geometries ||= []; group.materials ||= []; group.textures ||= []; group.images ||= [];
        const requireEntry = (field: string, id: string, map: Map<string, any>) => {
            let value = group[field].find(item => item?.uuid === id);
            if (!value) {
                value = map.get(id);
                if (!value) throw new Error(`Package ${group.object?.uuid || ''}: missing ${field} ${id}`);
                group[field].push(value);
            }
            return value;
        };
        const texture = (id: string) => {
            const value = requireEntry('textures', id, this.textureMap);
            if (value.image) requireEntry('images', value.image, this.imagesMap);
        };
        const material = (id: string) => {
            const value = requireEntry('materials', id, this.materialsMap);
            for (const [key, item] of Object.entries(value)) if (typeof item === 'string' && (key === 'map' || key === 'matcap' || /Map$/.test(key))) texture(item);
            for (const uniform of Object.values(value.uniforms || {}) as any[]) if (uniform?.type === 't' && uniform.value) texture(uniform.value);
        };
        const visit = (object: any) => {
            if (!object || typeof object !== 'object') return;
            if (object.geometry) requireEntry('geometries', object.geometry, this.geometryMap);
            for (const id of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) material(id);
            for (const child of object.children || []) visit(child);
        };
        visit(group.object);
    }

    private unpackGroup(uuid: string, parent, rootGroupUuid) {
        const signal = this.unpackAbort.signal;
        void this.fetchGroupJson(uuid).then(async source => {
            signal.throwIfAborted();
            const json = { ...source, object: { ...source.object } };
            const children: string[] = [];
            json.object.children = (source.object.children || []).filter(child => {
                if (typeof child !== 'string') return true;
                children.push(child); this.callFunNum.value++; return false;
            });
            this.resolveGroupResources(json);
            const group = await this.loader.parseAsync(json);
            signal.throwIfAborted();
            const bones: Bone[] = [];
            group.getObjectsByProperty('type', 'Bone', bones);
            if (bones.length) this.skeletonClass.addBones(bones);
            if (json.skeletons) this.skeletonClass.handleSkeletons(json.skeletons, group);
            group.uuid = uuid;
            App.addObject(group, parent, undefined, true);
            group.traverseByCondition(object => {
                if (object.isTilesGroup || object.type === 'TilesGroup') this.viewer.addTiles(object, 'none');
            }, object => !object.ignore);
            this.callFunNum.value--;
            for (const child of children) this.unpackGroup(child, group, rootGroupUuid);
        }).catch(this.failUnpack);
    }

    /**
     * 销毁此类
     */
    private async readPackageFile(name: string): Promise<Blob> {
        const file = this.packageFiles?.get(name);
        if (!file) throw new Error(`Missing package file: ${name}`);
        return file;
    }

    dispose(){
        this.packageFiles = undefined;
        this.unpackFailed = true;
        this.unpackAbort.abort();
        this.groupJsonPromises.clear();
        this.unpackErrorHandler = undefined;
        // 1. 清空所有数组
        this.geometryArr = [];
        this.imagesArr = [];
        this.materialsArr = [];
        this.textureArr = [];
        this.skeletonsArr = [];

        // 2. 清空所有映射
        this.geometryMap.clear();
        this.imagesMap.clear();
        this.materialsMap.clear();
        this.textureMap.clear();

        // 3. 销毁 loader 和骨架处理器
        if (this.loader) {
            this.loader = null as any; // 清空引用
        }

        if (this.skeletonClass) {
            this.skeletonClass.clear(); // 清除骨架数据
            this.skeletonClass = null as any; // 清空引用
        }

        // 4. 重置其他属性
        this.prefix_url = "";
        this.callFunNum = { value: 0 }; // 重置为初始状态
        this.totalSize = 0;

        // 5. 释放 viewer 引用（注意：不销毁 viewer，仅移除引用）
        this.viewer = null as any;
    }
}
