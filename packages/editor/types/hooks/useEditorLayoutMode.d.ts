import { type EditorLayoutPreset } from "@/views/editor/layoutPresets";
/** URL 中保留的精简布局 key（如 assembly） */
export declare function getPinnedLayoutKey(layoutQuery: string | string[] | null | undefined): string | undefined;
export declare function useEditorLayoutMode(): {
    pinnedLayoutKey: import("vue").ComputedRef<string | undefined>;
    isFullLayout: import("vue").ComputedRef<boolean>;
    pinnedPreset: import("vue").ComputedRef<EditorLayoutPreset>;
    effectivePreset: import("vue").ComputedRef<EditorLayoutPreset>;
    canToggle: import("vue").ComputedRef<boolean>;
    toggle: () => void;
};
