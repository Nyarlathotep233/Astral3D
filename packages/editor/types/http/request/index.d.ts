export declare const request: {
    get: <T>(url: string, config?: import("axios").AxiosRequestConfig) => Promise<Service.RequestResult<T_1>>;
    post: <T>(url: string, data?: any, config?: import("axios").AxiosRequestConfig) => Promise<Service.RequestResult<T_1>>;
    put: <T>(url: string, data?: any, config?: import("axios").AxiosRequestConfig) => Promise<Service.RequestResult<T_1>>;
    delete: <T>(url: string, config: import("axios").AxiosRequestConfig) => Promise<Service.RequestResult<T_1>>;
};
