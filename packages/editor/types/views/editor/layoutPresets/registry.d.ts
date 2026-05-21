import type { EditorLayoutPreset } from "./types";
export declare const DEFAULT_EDITOR_LAYOUT_PRESET: EditorLayoutPreset;
export declare const ASSEMBLY_LAYOUT_PRESET: EditorLayoutPreset;
export declare function resolveEditorLayoutPreset(layoutKey?: string | null): EditorLayoutPreset;
