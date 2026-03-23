/**
 * 获取所有工程信息
 */
export declare function fetchGetAllScenes(params: Service.ListPageQueryParams): Promise<Service.RequestResult<T>>;
/**
 * 获取工程
 */
export declare function fetchGetOneScene(id: string): Promise<Service.RequestResult<T>>;
/**
 * 保存工程
 */
export declare function fetchAddScene(data: any): Promise<Service.RequestResult<T>>;
/**
 * 更新工程
 */
export declare function fetchUpdateScene(id: string, data: ISceneFetchData): Promise<Service.RequestResult<T>>;
/**
 * 删除工程
 * @param {number} id
 */
export declare function fetchDeleteScenes(id: string): Promise<Service.RequestResult<T>>;
