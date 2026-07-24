declare interface ISceneInfo {
    id: string;
    sceneType: string;
    sceneName: string;
    sceneIntroduction: string;
    sceneVersion: number;
    projectType: 0 | 1;
    coverPicture: string;
    hasDrawing: boolean;
    zip: string,
    zipSize: string,
    gisConfig?: import("@astral3d/engine").GisConfig;
}

declare interface ISceneScript {
    "name": string,
    "source": string,
    "params"?: Record<string, unknown>
}

declare interface ISceneJson {
    metadata: {},
    camera: {
        "metadata": {
            "version": number,
            "type": "Object",
            "generator": "Object3D.toJSON"
        },
        "object": {
            "uuid": string,
            "type": "PerspectiveCamera",
            "name": string,
            "layers": number,
            "matrix": number[],
            "up": [0 | 1, 0 | 1, 0 | 1],
            "fov": number,
            "zoom": number,
            "near": number,
            "far": number,
            "focus": number,
            "aspect": number,
            "filmGauge": number,
            "filmOffset": number
        }
    },
    scene: {
        "uuid": string,
        "metadata": {
            "version": number,
            "type": "Object",
            "generator": "Object3D.toJSON"
        },
        "textures": Array<any>,
        "images": string[],
        "object": {
            "uuid": string,
            "type": "Scene",
            "name": string,
            "layers": number,
            "matrix": number[],
            "up": [0 | 1, 0 | 1, 0 | 1],
            "background": string,
            "environment": string,
            "backgroundRotation": [number, number, number, string],
            "environmentRotation": [number, number, number, string],
            "children": Array<string>
        },
        "geometries"?: Array<any>
    },
    scripts: {
        [uuid: string]: ISceneScript[]
    },
    controls: {
        type?: "camera-controls",
        state: string
    } | {
        type: "globe"
    },
    totalZipNumber: number,
    sceneInfo: ISceneInfo,
}

declare interface ISceneFetchData extends ISceneInfo {
    exampleSceneId?: string, // 所使用的示例场景id
    templateKey?: string,
    templateMeta?: string,
    sceneSource?: "INTERNAL" | "EXTERNAL" | string,
    externalSystem?: string,
    externalBizId?: string,
    externalMeta?: string,
    createTime?: string,
    updateTime?: string,
}
