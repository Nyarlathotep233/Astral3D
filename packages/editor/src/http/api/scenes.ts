import {request} from "@/http/request";

function normalizeScene<T extends ISceneFetchData>(scene: T): T {
    if (typeof scene.gisConfig === "string") {
        scene.gisConfig = scene.gisConfig.trim()
            ? JSON.parse(scene.gisConfig)
            : undefined;
    }
    return scene;
}

function serializeScene(scene) {
    return {
        ...scene,
        gisConfig: scene.gisConfig && typeof scene.gisConfig !== "string"
            ? JSON.stringify(scene.gisConfig)
            : scene.gisConfig,
    };
}

/**
 * 获取所有工程信息
 */
export function fetchGetAllScenes(params:Service.ListPageQueryParams) {
    return request.get<Service.ListPageResult<ISceneFetchData>>("/editor3d/scenes/getAll",{params}).then((res) => {
        res.data?.items?.forEach(normalizeScene);
        return res;
    });
}

/**
 * 获取工程
 */
export function fetchGetOneScene(id:string) {
    return request.get<ISceneFetchData>(`/editor3d/scenes/get/${id}`).then((res) => {
        if (res.data) normalizeScene(res.data);
        return res;
    });
}

/**
 * 保存工程
 */
export function fetchAddScene(data) {
    return request.post<ISceneFetchData>(`/editor3d/scenes/add`,serializeScene(data)).then((res) => {
        if (res.data) normalizeScene(res.data);
        return res;
    });
}

/**
 * 更新工程
 */
export function fetchUpdateScene(id:string,data:ISceneFetchData) {
    return request.put<ISceneFetchData>(`/editor3d/scenes/update/${id}`,serializeScene(data)).then((res) => {
        if (res.data) normalizeScene(res.data);
        return res;
    });
}

/**
 * 删除工程
 * @param {number} id
 */
export function fetchDeleteScenes(id: string) {
    return request.delete(`/editor3d/scenes/del/${id}`,{});
}
