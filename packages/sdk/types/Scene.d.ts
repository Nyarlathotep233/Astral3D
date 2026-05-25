declare namespace ITHREEScene {
    interface SceneJSON extends import("three").SceneJSON {
        object: Object3DJSONObject,
        images?: Array<ImageJSON | string>;
        geometries?: import("three").BufferGeometryJSON[];
        textures?: import("three").TextureJSON[];
        materials?: import("three").MaterialJSON[];
        skeletons?: import("three").SkeletonJSON[];
        animations?: import("three").AnimationClipJSON[];
    }

    interface Object3DJSONObject{
        "uuid": string,
        "type": "Scene",
        "name": string,
        "layers": number,
        "matrix": number[],
        "up": [0 | 1, 0 | 1, 0 | 1],
        "background"?: string,
        "environment"?: string,
        "environmentType"?: "ModelViewer";
        "backgroundRotation"?: [number, number, number, string],
        "environmentRotation"?: [number, number, number, string],
        "children"?: Array<string | import("three").Object3DJSONObject>
    }

    interface ImageJSON {
        uuid: string;
        url: import("three").SerializedImage;
    }

    interface MeshJSON extends import("three").MeshJSON {
        images: ImageJSON[];
        geometries: import("three").BufferGeometryJSON[];
        textures: import("three").TextureJSON[];
        materials: import("three").MaterialJSON[];
        skeletons?: import("three").SkeletonJSON[];
        animations?: import("three").AnimationClipJSON[];
    }
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
        "textures": Array<import('three').Texture>,
        "images": string[],
        "object": ITHREEScene.Object3DJSONObject,
        "geometries"?: Array<any>,
        //groupChildren?: Array<string>
    },
    scripts: {
        [uuid: string]: ISceneScript[]
    },
    controls: {
        state: string
    },
    totalZipNumber: number,
    sceneInfo: IAppProject.SceneInfo,
}
