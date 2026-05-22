export declare const GRID_VISIBILITY_STORAGE_KEY = "editor:scene-setting:grid-visible";
export declare const HELPERS_VISIBILITY_STORAGE_KEY = "editor:scene-setting:helpers-visible";
export declare function readGridVisible(): boolean;
export declare function readHelpersVisible(): boolean;
export declare function applyGridVisible(value?: boolean): void;
export declare function applyHelpersVisible(value?: boolean): void;
export declare function applyPersistedSceneVisibility(): void;
export declare function setGridVisible(value: boolean): void;
export declare function setHelpersVisible(value: boolean): void;
