import * as THREE from "three";
export interface PrefabPackage {
    signature: string;
    version: number;
    name: string;
    rootUuid: string;
    savedAt: string;
    object: any;
    scripts: ISceneJson['scripts'];
}
export declare function createPrefabFile(object: THREE.Object3D): Promise<File>;
export declare function instantiatePrefab(source: string | Blob, position?: THREE.Vector3): Promise<THREE.Object3D<THREE.Object3DEventMap>>;
export declare const Prefab: {
    createPrefabFile: typeof createPrefabFile;
    instantiatePrefab: typeof instantiatePrefab;
};
