import {request} from "@/http/request";

/**
 * 获取所有工程信息
 */
export function fetchGetAllScenes(params:Service.ListPageQueryParams) {
    return request.get<Service.ListPageResult<ISceneFetchData>>("/editor3d/scenes/getAll",{params});
}

/**
 * 获取工程
 */
export function fetchGetOneScene(id:string) {
    return request.get<ISceneFetchData>(`/editor3d/scenes/get/${id}`);
}

/**
 * 保存工程
 */
export function fetchAddScene(data) {
    return request.post<ISceneFetchData>(`/editor3d/scenes/add`,data);
}

/**
 * 更新工程
 */
export function fetchUpdateScene(id:string,data:ISceneFetchData) {
    return request.put<ISceneFetchData>(`/editor3d/scenes/update/${id}`,data);
}

export interface SceneSaveReceipt {
    scene: ISceneFetchData;
    operationId: string;
    expectedVersion: number;
    replayed: boolean;
    warnings?: string[];
}

/** 原子版本检查与持久 operationId 去重。 */
export function fetchSaveScene(id: string, scene: Omit<ISceneFetchData, "hasDrawing"> & {hasDrawing: number | boolean}, expectedVersion: number, operationId: string) {
    return request.post<SceneSaveReceipt>(`/editor3d/scenes/save/${encodeURIComponent(id)}`, {
        scene, expectedVersion, operationId,
    });
}

export function fetchSceneSaveOperation(id: string, operationId: string) {
    return request.get<SceneSaveReceipt | null>(`/editor3d/scenes/save/${encodeURIComponent(id)}/operations/${encodeURIComponent(operationId)}`);
}

/**
 * 删除工程
 * @param {number} id
 */
export function fetchDeleteScenes(id: string) {
    return request.delete(`/editor3d/scenes/del/${id}`,{});
}
