export type IncludeList<T extends string> = "*" | T[];
export type AssetLibraryKey = "cad" | "bim";
export type BottomPaneKey = "resource" | "animation" | "logs";
export type ResourceSourceKey = "builtin" | "public";
export type BuiltinCategoryKey = "prefabs" | "models" | "materials" | "particles" | "billboard" | "htmlPanel" | "tiles" | "lights" | "cameras";
export type ModelSubCategoryKey = "shape" | "building" | "person" | "plant" | "animal" | "vehicle" | "mehicle" | "furniture" | "outdoor" | "other";
export type SidebarTabKey = "scene" | "renderer" | "effect" | "weather" | "history" | "drawing" | "object" | "geometry" | "material" | "animations" | "script" | "particle" | "billboard" | "htmlPanel" | "3DTiles";
export interface EditorLayoutPreset {
    key: string;
    name: string;
    /** 左下角可选插件悬浮球，未设置时显示 */
    pluginFab?: boolean;
    left?: {
        sceneTree?: boolean;
        assetLibraries?: IncludeList<AssetLibraryKey>;
    };
    bottom?: {
        panes?: IncludeList<BottomPaneKey>;
        defaultPane?: BottomPaneKey;
    };
    resource?: {
        sources?: IncludeList<ResourceSourceKey>;
        defaultSource?: ResourceSourceKey;
        builtin?: {
            categories?: IncludeList<BuiltinCategoryKey>;
            defaultCategory?: BuiltinCategoryKey;
            models?: {
                subCategories?: IncludeList<ModelSubCategoryKey>;
                defaultSubCategory?: ModelSubCategoryKey;
                items?: Record<string, IncludeList<string>>;
            };
            prefabs?: {
                items?: IncludeList<string>;
            };
        };
    };
    right?: {
        tabs?: IncludeList<SidebarTabKey>;
        defaultTab?: SidebarTabKey;
    };
}
