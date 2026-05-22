import type { EditorLayoutPreset } from "./types";

export const DEFAULT_EDITOR_LAYOUT_PRESET: EditorLayoutPreset = {
  key: "default",
  name: "默认布局",
};

export const ASSEMBLY_LAYOUT_PRESET: EditorLayoutPreset = {
  key: "assembly",
  name: "装配布局",
  pluginFab: false,
  left: {
    sceneTree: true,
    assetLibraries: [],
  },
  bottom: {
    panes: ["resource"],
    defaultPane: "resource",
  },
  resource: {
    sources: ["builtin"],
    defaultSource: "builtin",
    builtin: {
      categories: ["prefabs", "models"],
      defaultCategory: "models",
      prefabs: {
        items: "*",
      },
    },
  },
  right: {
    tabs: ["scene", "object", "script"],
    defaultTab: "script",
  },
};

const TOWER_CRANE_ASSEMBLY_LAYOUT_PRESET: EditorLayoutPreset = {
  key: "tower-crane-assembly",
  name: "塔吊装配布局",
  pluginFab: false,
  left: {
    sceneTree: true,
    assetLibraries: [],
  },
  bottom: {
    panes: ["resource"],
    defaultPane: "resource",
  },
  resource: {
    sources: ["builtin"],
    defaultSource: "builtin",
    builtin: {
      categories: ["prefabs", "models"],
      defaultCategory: "prefabs",
      models: {
        subCategories: ["shape", "plant"],
        defaultSubCategory: "shape",
      },
      prefabs: {
        items: ["tower-crane"],
      },
    },
  },
  right: {
    tabs: ["scene", "object", "script"],
    defaultTab: "script",
  },
};


const LAYOUT_PRESET_REGISTRY: Record<string, EditorLayoutPreset> = {
  default: DEFAULT_EDITOR_LAYOUT_PRESET,
  assembly: ASSEMBLY_LAYOUT_PRESET,
  "tower-crane-assembly": TOWER_CRANE_ASSEMBLY_LAYOUT_PRESET,
};

export function resolveEditorLayoutPreset(
  layoutKey?: string | null
): EditorLayoutPreset {
  if (!layoutKey) return DEFAULT_EDITOR_LAYOUT_PRESET;
  return LAYOUT_PRESET_REGISTRY[layoutKey] ?? DEFAULT_EDITOR_LAYOUT_PRESET;
}
