import { Hooks } from "@astral3d/engine";

export const GRID_VISIBILITY_STORAGE_KEY = "editor:scene-setting:grid-visible";
export const HELPERS_VISIBILITY_STORAGE_KEY = "editor:scene-setting:helpers-visible";

function readPersistedBoolean(key: string, fallback: boolean) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch (error) {
    console.warn("[SceneVisibility] read localStorage failed:", error);
  }

  return fallback;
}

function persistBoolean(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (error) {
    console.warn("[SceneVisibility] write localStorage failed:", error);
  }
}

export function readGridVisible() {
  return readPersistedBoolean(GRID_VISIBILITY_STORAGE_KEY, true);
}

export function readHelpersVisible() {
  return readPersistedBoolean(HELPERS_VISIBILITY_STORAGE_KEY, true);
}

export function applyGridVisible(value = readGridVisible()) {
  Hooks.useDispatchSignal("showGridChanged", value);
}

export function applyHelpersVisible(value = readHelpersVisible()) {
  if (!window.viewer) return;

  window.viewer.edit = {
    enabled: value,
    helpers: true,
    gizmo: true,
  };

  window.viewer.render();
}

export function applyPersistedSceneVisibility() {
  applyGridVisible();
  applyHelpersVisible();
}

export function setGridVisible(value: boolean) {
  persistBoolean(GRID_VISIBILITY_STORAGE_KEY, value);
  applyGridVisible(value);
}

export function setHelpersVisible(value: boolean) {
  persistBoolean(HELPERS_VISIBILITY_STORAGE_KEY, value);
  applyHelpersVisible(value);
}
