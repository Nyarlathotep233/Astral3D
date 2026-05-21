import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  DEFAULT_EDITOR_LAYOUT_PRESET,
  resolveEditorLayoutPreset,
  type EditorLayoutPreset,
} from "@/views/editor/layoutPresets";

/** URL 中保留的精简布局 key（如 assembly） */
export function getPinnedLayoutKey(
  layoutQuery: string | string[] | null | undefined
): string | undefined {
  const layoutKey = Array.isArray(layoutQuery) ? layoutQuery[0] : layoutQuery;
  if (!layoutKey) return undefined;

  const preset = resolveEditorLayoutPreset(layoutKey);
  return preset.key === DEFAULT_EDITOR_LAYOUT_PRESET.key ? undefined : layoutKey;
}

/** 是否临时展开为完整布局（仅当前编辑会话，不写 URL） */
const isFullLayoutOverride = ref(false);

export function useEditorLayoutMode() {
  const route = useRoute();

  const pinnedLayoutKey = computed(() =>
    getPinnedLayoutKey(route.query.layout)
  );

  const isFullLayout = computed(() => isFullLayoutOverride.value);

  const canToggle = computed(() => !!pinnedLayoutKey.value);

  const pinnedPreset = computed(() =>
    resolveEditorLayoutPreset(pinnedLayoutKey.value)
  );

  const effectivePreset = computed<EditorLayoutPreset>(() =>
    isFullLayout.value
      ? DEFAULT_EDITOR_LAYOUT_PRESET
      : resolveEditorLayoutPreset(pinnedLayoutKey.value)
  );

  function toggle() {
    if (!canToggle.value) return;
    isFullLayoutOverride.value = !isFullLayoutOverride.value;
  }

  watch(pinnedLayoutKey, () => {
    isFullLayoutOverride.value = false;
  });

  return {
    pinnedLayoutKey,
    isFullLayout,
    pinnedPreset,
    effectivePreset,
    canToggle,
    toggle,
  };
}
