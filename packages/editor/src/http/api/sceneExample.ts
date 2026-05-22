/**
 * @author MaHaiBing
 * @email  mlt131220@163.com
 * @date   2024/7/28 14:54
 * @description 示例场景
 */
import {request} from "@/http/request";
import {Service} from "~/network";

export const ADMIN_KEY_STORAGE_KEY = "H3D_ADMIN_KEY";
export const ADMIN_KEY_HEADER = "X-H3D-Admin-Key";

function getAdminKeyHeaders() {
    const adminKey = typeof window === "undefined" ? "" : window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || "";
    return adminKey ? {[ADMIN_KEY_HEADER]: adminKey} : {};
}

/**
 * 获取所有示例场景
 */
export function fetchSceneExampleList(params) {
    return request.get<Service.ListPageResult<ISceneFetchData>>("/editor3d/sceneExample",{params});
}

/**
 * 获取示例场景
 */
export function fetchSceneExample(id) {
    return request.get(`/editor3d/sceneExample/${id}`);
}

/**
 * 新增示例场景
 */
export function fetchAddSceneExample(data) {
    return request.post(`/editor3d/sceneExample`,data,{headers:getAdminKeyHeaders()});
}

/**
 * 从已有场景生成示例模板
 */
export function fetchCreateSceneExampleFromScene(sceneId: string, data: {sceneName?: string; sceneType?: string; sceneIntroduction?: string; templateKey?: string}) {
    return request.post<ISceneFetchData>(`/editor3d/sceneExample/fromScene/${sceneId}`, data, {headers:getAdminKeyHeaders()});
}

/**
 * 更新示例场景
 */
export function fetchUpdateSceneExample(id: string, data) {
    return request.put(`/editor3d/sceneExample/${id}`,data,{headers:getAdminKeyHeaders()});
}

/**
 * 删除示例场景
 * @param {string} id
 */
export function fetchDeleteSceneExample(id: string) {
    return request.delete(`/editor3d/sceneExample/${id}`,{headers:getAdminKeyHeaders()});
}
