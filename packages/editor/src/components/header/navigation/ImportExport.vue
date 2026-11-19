<template>
  <n-dropdown :options="exportOptions" placement="bottom-start" trigger="click" @select="handleExportSelect">
    <n-button class="mr-2" :loading="exportingProjectBundle">
      <template #icon>
        <n-icon size="22">
          <DocumentExport/>
        </n-icon>
      </template>
      {{ t("layout.header.Export") }}
    </n-button>
  </n-dropdown>

  <n-button type="primary" :loading="importingProjectBundle" @click="handleImport">
    <template #icon>
      <n-icon>
        <DocumentImport/>
      </n-icon>
    </template>
    {{ t("layout.header.Import") }}
  </n-button>
</template>

<script setup lang="ts">
import {onMounted, ref} from "vue";
import {DocumentImport, DocumentExport} from "@vicons/carbon";
import JSZip from "jszip";
import {t} from "@/language";
import {App, Loader} from "@astral3d/engine";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {agentState} from "@/utils/integration/agentState";
import {loadAuthoringPackage, replaceAuthoringScene} from "@/utils/common/loadAuthoringScene";
import {instantiatePrefab} from "@/utils/common/prefab";

import { createSceneExport, downloadSceneExport, type SceneExportFormat } from "@/utils/common/sceneExport";
const globalConfigStore = useGlobalConfigStore();
const exportingProjectBundle = ref(false);
const importingProjectBundle = ref(false);

const BUNDLE_SIGNATURE = "h3d-scene-project-package";
const LEGACY_BUNDLE_SIGNATURE = "astral3d-scene-project-package";
const BUNDLE_VERSION = 1;
const ZIP_BUNDLE_SIGNATURE = "h3d-scene-project-package-zip";
const LEGACY_ZIP_BUNDLE_SIGNATURE = "astral3d-scene-project-package-zip";
const PROJECT_JSON_SUFFIX = ".h3d-project.json";
const PROJECT_ZIP_SUFFIX = ".h3d-project.zip";
const PROJECT_ZIP_SUFFIX_LIST = [".h3d-project.zip", ".haolink3d-project.zip", ".astral3d-project.zip"];

interface SceneProjectBundle {
  signature: string;
  version: number;
  exportedAt: string;
  sourceSceneId: string;
  sourceSceneInfo: ISceneInfo;
  firstPackageName: string;
  packageFiles: Record<string, string>;
  coverImageDataUrl?: string;
  initRequirements: {
    apis: Array<{
      name: string;
      method: "GET";
      path: string;
      purpose: string;
    }>;
    resources: {
      firstPackage: string;
      groupPackages: string[];
      packageFileCount: number;
      coverPicture: string;
      packageContentHint: string[];
    };
  };
}

interface SceneProjectZipManifest {
  signature: string;
  version: number;
  exportedAt: string;
  sourceSceneId: string;
  sourceSceneInfo: ISceneInfo;
  firstPackageName: string;
  packageFiles: string[];
  initRequirements: {
    resources: {
      firstPackage: string;
      groupPackages: string[];
      packageFileCount: number;
      packageContentHint: string[];
    };
  };
}

const exportOptions = [
  {
    label: t("layout.header['Export Object']"),
    key: "exportObject",
    children: [
      {
        label: "JSON",
        key: "exportObjectToJSON"
      },
      {
        label: "GLB",
        key: "exportObjectToGlb"
      },
      {
        label: "GLTF",
        key: "exportObjectToGltf"
      },
      {
        label: "OBJ",
        key: "exportObjectToObj"
      },
      {
        label: "PLY",
        key: "exportObjectToPly"
      },
      {
        label: t("layout.header['PLY (Binary)']"),
        key: "exportObjectToPlyBinary"
      },
      {
        label: "STL",
        key: "exportObjectToStl"
      },
      {
        label: t("layout.header['STL (Binary)']"),
        key: "exportObjectToStlBinary"
      },
      {
        label: "USDZ",
        key: "exportObjectToUSDZ"
      },
      {
        label: "Prefab",
        key: "exportObjectToPrefab"
      }
    ]
  },
  {
    label: t("layout.header['Export Scene']"),
    key: "exportScene",
    children: [
      {
        label: "JSON",
        key: "exportSceneToJSON"
      },
      {
        label: "GLB",
        key: "exportSceneToGlb"
      },
      {
        label: "GLTF",
        key: "exportSceneToGltf"
      },
      {
        label: "OBJ",
        key: "exportSceneToObj"
      },
      {
        label: "PLY",
        key: "exportSceneToPly"
      },
      {
        label: t("layout.header['PLY (Binary)']"),
        key: "exportSceneToPlyBinary"
      },
      {
        label: "STL",
        key: "exportSceneToStl"
      },
      {
        label: t("layout.header['STL (Binary)']"),
        key: "exportSceneToStlBinary"
      },
      {
        label: "USDZ",
        key: "exportSceneToUSDZ"
      },
      {
        label: t("layout.header['Project Package']"),
        key: "exportSceneProjectPackage"
      },
      {
        label: `${t("layout.header['Project Package']")} (.zip)`,
        key: "exportSceneProjectPackageZip"
      },
      {
        label: "Standalone 预览包 (.zip)",
        key: "exportSceneStandalonePreviewZip"
      }
    ]
  }
]

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

function isProjectBundlePayload(payload: unknown): payload is SceneProjectBundle {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as SceneProjectBundle;
  return [BUNDLE_SIGNATURE, LEGACY_BUNDLE_SIGNATURE].includes(data.signature)
      && data.version === BUNDLE_VERSION
      && typeof data.firstPackageName === "string"
      && !!data.packageFiles
      && typeof data.packageFiles === "object";
}

function isProjectBundleZipManifest(payload: unknown): payload is SceneProjectZipManifest {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as SceneProjectZipManifest;
  return [ZIP_BUNDLE_SIGNATURE, LEGACY_ZIP_BUNDLE_SIGNATURE].includes(data.signature)
      && data.version === BUNDLE_VERSION
      && typeof data.firstPackageName === "string"
      && Array.isArray(data.packageFiles);
}

function isProjectBundleZipFilename(filename: string) {
  const lower = filename.toLowerCase();
  return PROJECT_ZIP_SUFFIX_LIST.some((suffix) => lower.endsWith(suffix));
}

function validateBundleFiles(bundleData: SceneProjectBundle, packageBlobMap: Map<string, Blob>) {
  const expectedFileCount = bundleData.initRequirements?.resources?.packageFileCount;
  if (typeof expectedFileCount === "number" && expectedFileCount > packageBlobMap.size) {
    throw new Error("项目包文件不完整，请重新导出后再导入");
  }

  const expectedGroupPackages = Array.isArray(bundleData.initRequirements?.resources?.groupPackages)
      ? bundleData.initRequirements.resources.groupPackages
      : [];

  const missingGroupPackages = expectedGroupPackages.filter((name) => !packageBlobMap.has(name));
  if (missingGroupPackages.length > 0) {
    throw new Error(`项目包缺少分包文件：${missingGroupPackages.join(", ")}`);
  }
}

async function restoreSceneAfterImportFailure(sceneInfo: ISceneInfo, signal: AbortSignal) {
  signal.throwIfAborted();
  globalConfigStore.loadingText = "导入失败，正在恢复原场景...";
  App.clear();
  if (sceneInfo.zip) {
    window.viewer.options.hdr = "";
    await loadAuthoringPackage({url:sceneInfo.zip}, signal);
  } else {
    window.viewer.options.hdr = "/static/resource/hdr/cloudy.hdr";
    window.viewer.loadEnv(true);
  }
  App.project.setKey("sceneInfo", sceneInfo);
}

async function exportShared(format: SceneExportFormat, object = undefined) {
  exportingProjectBundle.value = true;
  globalConfigStore.loading = true;
  globalConfigStore.loadingText = "正在导出...";
  try {
    const result = await createSceneExport({format, object, onProgress: progress => {
      globalConfigStore.loadingText = `${Number.isFinite(progress) ? progress : 100}%`;
    }});
    downloadSceneExport(result);
    window.$message?.success("导出成功");
  } catch (error) {
    console.error(error);
    window.$message?.error(error instanceof Error ? error.message : "导出失败");
  } finally {
    exportingProjectBundle.value = false;
    globalConfigStore.loading = false;
  }
}
async function exportProjectBundle() { return exportShared('project-json'); }
async function exportProjectBundleZip() { return exportShared('project-zip'); }
async function exportStandalonePreviewZip() { return exportShared('standalone'); }

async function importProjectBundleFile(bundleData: SceneProjectBundle, epoch = agentState.documentEpoch, zipFiles?: Map<string, Blob>) {
  importingProjectBundle.value = true;
  globalConfigStore.loading = true;
  globalConfigStore.loadingText = "正在导入项目包...";
  const currentSceneInfo = structuredClone(App.project.getKey("sceneInfo"));
  try {
    const files = zipFiles ?? new Map<string, Blob>();
    if (!zipFiles) {
      for (const [name, dataUrl] of Object.entries(bundleData.packageFiles)) files.set(name, await dataUrlToBlob(dataUrl));
    }
    validateBundleFiles(bundleData, files);
    if (!files.has(bundleData.firstPackageName)) throw new Error("项目包缺少首包");
    await replaceAuthoringScene(currentSceneInfo.id, epoch, async signal => {
      try {
        window.viewer.options.hdr = "";
        await loadAuthoringPackage({
          url:bundleData.firstPackageName, files,
          onProgress: progress => { globalConfigStore.loadingText = `${progress.toFixed(2)}%`; },
        }, signal);
        App.project.setKey("sceneInfo", currentSceneInfo);
        window.$message?.success(t("plugin.gltfHandler['Import success!']"));
        return true;
      } catch (error) {
        signal.throwIfAborted();
        await restoreSceneAfterImportFailure(currentSceneInfo, signal);
        window.$message?.error(`项目包导入失败，已恢复最近保存的场景：${String(error)}`);
        return false;
      }
    });
  } catch (error) {
    window.$message?.error(`项目包导入失败：${String(error)}`);
  } finally {
    importingProjectBundle.value = false;
    globalConfigStore.loading = false;
  }
}

async function importProjectBundleZipFile(zipFile: File) {
  const epoch = agentState.documentEpoch;
  const zipContent = await new JSZip().loadAsync(zipFile);
  const manifestFile = zipContent.file("project.json");
  if (!manifestFile) {
    throw new Error("项目包缺少 project.json");
  }

  const manifest = JSON.parse(await manifestFile.async("string"));
  if (!isProjectBundleZipManifest(manifest)) {
    throw new Error("不是有效的项目包(.zip)");
  }

  const files = new Map<string, Blob>();
  for (const fileName of manifest.packageFiles) {
    const packageFile = zipContent.file(`packages/${fileName}`);
    if (!packageFile) {
      throw new Error(`项目包缺少分包文件：${fileName}`);
    }

    files.set(fileName, await packageFile.async("blob"));
  }

  const firstPackageName = manifest.firstPackageName;
  const groupPackages = Array.isArray(manifest.initRequirements?.resources?.groupPackages)
      ? manifest.initRequirements.resources.groupPackages
      : manifest.packageFiles.filter((name: string) => name !== firstPackageName);
  const packageFileCount = Number(manifest.initRequirements?.resources?.packageFileCount || manifest.packageFiles.length);
  const sourceSceneInfo = (manifest.sourceSceneInfo || {}) as ISceneInfo;

  const bundleData: SceneProjectBundle = {
    signature: BUNDLE_SIGNATURE,
    version: BUNDLE_VERSION,
    exportedAt: manifest.exportedAt || new Date().toISOString(),
    sourceSceneId: manifest.sourceSceneId || sourceSceneInfo.id || "",
    sourceSceneInfo: sourceSceneInfo,
    firstPackageName,
    packageFiles: {},
    initRequirements: {
      apis: [],
      resources: {
        firstPackage: firstPackageName,
        groupPackages,
        packageFileCount,
        coverPicture: sourceSceneInfo.coverPicture || "",
        packageContentHint: Array.isArray(manifest.initRequirements?.resources?.packageContentHint)
            ? manifest.initRequirements.resources.packageContentHint
            : ["scene.json", "config.json", "Textures/*", "Geometries/*", "Drawing/*"]
      }
    }
  };

  await importProjectBundleFile(bundleData, epoch, files);
}

function handleImport() {
  const form = document.createElement('form');
  form.style.display = 'none';
  document.body.appendChild(form);

  const fileInput = document.createElement('input');
  fileInput.multiple = true;
  fileInput.type = 'file';
  fileInput.addEventListener('change', async function () {
    const files = Array.from(fileInput.files || []);
    const target = files[0];

    try {
      const prefabFiles = files.filter(file => /\.h3dprefab\.zip$/i.test(file.name));
      if (prefabFiles.length > 0) {
        if (files.length !== 1) throw new Error("Prefab 请单独导入");

        await instantiatePrefab(target);
        window.$message?.success("Prefab 导入成功");
        return;
      }

      // 单文件且为json时，优先尝试导入项目包；失败则回退到普通导入
      if (files.length === 1 && target && /\.json$/i.test(target.name)) {
        try {
          const maybePayload = JSON.parse(await target.text());
          if (isProjectBundlePayload(maybePayload)) {
            window.$dialog.warning({
              title: window.$t('other.warning'),
              content: window.$t("core['Any unsaved data will be lost. Are you sure?']"),
              positiveText: window.$t('other.Ok'),
              negativeText: window.$t('other.Cancel'),
              onPositiveClick: async () => {
                await importProjectBundleFile(maybePayload);
              }
            });
            return;
          }
        } catch {
          // 非项目包json时走原有导入逻辑
        }
      }

      // 单文件且为项目zip包后缀时，走项目包zip导入分支；其他zip仍走原有导入逻辑
      if (files.length === 1 && target && /\.zip$/i.test(target.name) && isProjectBundleZipFilename(target.name)) {
        window.$dialog.warning({
          title: window.$t('other.warning'),
          content: window.$t("core['Any unsaved data will be lost. Are you sure?']"),
          positiveText: window.$t('other.Ok'),
          negativeText: window.$t('other.Cancel'),
          onPositiveClick: async () => {
            try {
              await importProjectBundleZipFile(target);
            } catch (err: any) {
              window.$message?.error(err?.message || String(err));
            }
          }
        });
        return;
      }

      await Loader.loadFiles(fileInput.files, undefined);
    } catch (err: any) {
      window.$message?.error(err?.message || String(err));
    } finally {
      form.reset();
    }
  });
  form.appendChild(fileInput);

  fileInput.click();
}

async function handleExportSelect(key: string) {
  if (key === "exportSceneStandalonePreviewZip") {
    await exportStandalonePreviewZip();
    return;
  }

  if (key === "exportSceneProjectPackageZip") {
    await exportProjectBundleZip();
    return;
  }

  if (key === "exportSceneProjectPackage" || key === "exportSceneProjectBundle") {
    await exportProjectBundle();
    return;
  }

  if (key.startsWith("exportObject")) {
    if (App.selected === null) {
      window.$message?.error(window.$t("prompt['No object selected.']"));
      return;
    }

    if (key === "exportObjectToPrefab") {
      await exportShared('prefab', App.selected as any);
      return;
    }
  }
  const suffix = key.replace(/^export(?:Object|Scene)To/, '');
  const formats: Record<string, SceneExportFormat> = {JSON:'json',Glb:'glb',Gltf:'gltf',Obj:'obj',Ply:'ply',PlyBinary:'ply-binary',Stl:'stl',StlBinary:'stl-binary',USDZ:'usdz'};
  const format = formats[suffix];
  if (format) await exportShared(format, key.startsWith('exportObject') ? App.selected as any : undefined);
}

onMounted(() => {
})
</script>

<style scoped lang="less"></style>
