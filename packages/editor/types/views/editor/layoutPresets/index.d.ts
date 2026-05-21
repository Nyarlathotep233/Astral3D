import type { InjectionKey } from "vue";
import type { EditorLayoutPreset } from "./types";
export * from "./types";
export * from "./utils";
export { DEFAULT_EDITOR_LAYOUT_PRESET, ASSEMBLY_LAYOUT_PRESET, resolveEditorLayoutPreset, } from "./registry";
export declare const editorLayoutPresetKey: InjectionKey<EditorLayoutPreset>;
