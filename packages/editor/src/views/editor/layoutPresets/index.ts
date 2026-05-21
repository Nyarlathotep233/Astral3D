import { inject, type ComputedRef, type InjectionKey } from "vue";
import type { EditorLayoutPreset } from "./types";

export * from "./types";
export * from "./utils";
export {
  DEFAULT_EDITOR_LAYOUT_PRESET,
  ASSEMBLY_LAYOUT_PRESET,
  resolveEditorLayoutPreset,
} from "./registry";

export const editorLayoutPresetKey: InjectionKey<ComputedRef<EditorLayoutPreset>> =
  Symbol("editorLayoutPreset");

export function useInjectedEditorLayoutPreset(): ComputedRef<EditorLayoutPreset> {
  const preset = inject(editorLayoutPresetKey);
  if (!preset) {
    throw new Error("editorLayoutPreset is not provided");
  }
  return preset;
}

export interface EditorLayoutModeContext {
  pinnedLayoutKey: ComputedRef<string | undefined>;
  isFullLayout: ComputedRef<boolean>;
  pinnedPreset: ComputedRef<EditorLayoutPreset>;
  effectivePreset: ComputedRef<EditorLayoutPreset>;
  canToggle: ComputedRef<boolean>;
  toggle: () => void;
}

export const editorLayoutModeKey: InjectionKey<EditorLayoutModeContext> =
  Symbol("editorLayoutMode");
