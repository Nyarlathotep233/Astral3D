import type { InjectionKey } from "vue";
import type { EditorLayoutPreset } from "./types";
export * from "./types";
export * from "./utils";
export { DEFAULT_EDITOR_LAYOUT_PRESET, ASSEMBLY_LAYOUT_PRESET, resolveEditorLayoutPreset, } from "./registry";
export declare const editorLayoutPresetKey: InjectionKey<import("vue").ComputedRef<EditorLayoutPreset>>;
export interface EditorLayoutModeContext {
    pinnedLayoutKey: import("vue").ComputedRef<string | undefined>;
    isFullLayout: import("vue").ComputedRef<boolean>;
    pinnedPreset: import("vue").ComputedRef<EditorLayoutPreset>;
    effectivePreset: import("vue").ComputedRef<EditorLayoutPreset>;
    canToggle: import("vue").ComputedRef<boolean>;
    toggle: () => void;
}
export declare const editorLayoutModeKey: InjectionKey<EditorLayoutModeContext>;
export declare function useInjectedEditorLayoutPreset(): import("vue").ComputedRef<EditorLayoutPreset>;
