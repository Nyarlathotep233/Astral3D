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
import {t} from "@/language";
import {App, Export, Loader, Package} from "@astral3d/engine";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";

const exportClass = new Export();
const globalConfigStore = useGlobalConfigStore();
const exportingProjectBundle = ref(false);
const importingProjectBundle = ref(false);

const BUNDLE_SIGNATURE = "astral3d-scene-project-package";
const BUNDLE_VERSION = 1;

interface SceneProjectBundle {
  signature: typeof BUNDLE_SIGNATURE;
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
      }
    ]
  }
]

function downloadBlobFile(file: File | Blob, filename: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("readAsDataUrl failed"));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function resolveCoverImageDataUrl(coverPicture: string): Promise<string | undefined> {
  if (!coverPicture) return;

  try {
    // blob/data/http 链接直接读取，其余路径按服务静态目录读取
    const coverUrl = /^(blob:|data:|https?:)/.test(coverPicture) ? coverPicture : `/file/static/${coverPicture}`;
    const res = await fetch(coverUrl);
    if (!res.ok) return;

    const blob = await res.blob();
    return await readAsDataUrl(blob);
  } catch {
    return;
  }
}

function safeFilename(input: string) {
  return input.replace(/[\\/:*?"<>|]/g, "_");
}

function isProjectBundlePayload(payload: unknown): payload is SceneProjectBundle {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as SceneProjectBundle;
  return data.signature === BUNDLE_SIGNATURE
      && data.version === BUNDLE_VERSION
      && typeof data.firstPackageName === "string"
      && !!data.packageFiles
      && typeof data.packageFiles === "object";
}

async function exportProjectBundle() {
  const sceneInfo = App.project.getKey("sceneInfo") as ISceneInfo | undefined;
  if (!sceneInfo?.id) {
    window.$message?.error(window.$t("scene['The project does not exist!']"));
    return;
  }

  exportingProjectBundle.value = true;
  globalConfigStore.loading = true;
  globalConfigStore.loadingText = "正在生成项目包...";

  const packageInstance = new Package(window.viewer);
  const packageFiles: File[] = [];

  try {
    const exported = await packageInstance.pack({
      name: `${safeFilename(sceneInfo.sceneName || sceneInfo.id)}-${Date.now()}`,
      layer: 2,
      zipUploadFun: async (zipFile: File) => {
        const cloned = new File([await zipFile.arrayBuffer()], zipFile.name, {type: zipFile.type});
        packageFiles.push(cloned);
        return cloned.name;
      },
      onProgress: (progress) => {
        globalConfigStore.loadingText = `${progress}%`;
      }
    });

    const packageFilesMap: Record<string, string> = {};
    for (const file of packageFiles) {
      packageFilesMap[file.name] = await readAsDataUrl(file);
    }

    const firstPackageName = String(exported.firstUploadResult || packageFiles[0]?.name || "");
    if (!firstPackageName || !packageFilesMap[firstPackageName]) {
      throw new Error("Failed to find first package");
    }

    const coverImageDataUrl = await resolveCoverImageDataUrl(sceneInfo.coverPicture || "");
    const groupPackages = packageFiles.map(file => file.name).filter(name => name !== firstPackageName);

    const bundlePayload: SceneProjectBundle = {
      signature: BUNDLE_SIGNATURE,
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      sourceSceneId: sceneInfo.id,
      sourceSceneInfo: JSON.parse(JSON.stringify(sceneInfo)),
      firstPackageName,
      packageFiles: packageFilesMap,
      coverImageDataUrl,
      initRequirements: {
        apis: [
          {
            name: "fetchGetOneScene",
            method: "GET",
            path: "/api/editor3d/scenes/get/{sceneId}",
            purpose: "读取 sceneInfo（包含 zip 路径与基础配置）"
          },
          {
            name: "fetchSceneFirstPackage",
            method: "GET",
            path: "/file/static/{sceneInfo.zip}",
            purpose: "读取首包（scene.json/config.json/纹理/图纸等）"
          },
          {
            name: "fetchSceneGroupPackages",
            method: "GET",
            path: "/file/static/{zipPrefix}/{groupUuid}.zip",
            purpose: "按分组加载剩余场景资源包"
          }
        ],
        resources: {
          firstPackage: firstPackageName,
          groupPackages,
          packageFileCount: packageFiles.length,
          coverPicture: sceneInfo.coverPicture || "",
          packageContentHint: ["scene.json", "config.json", "Textures/*", "Geometries/*", "Drawing/*"]
        }
      }
    };

    const fileName = `${safeFilename(sceneInfo.sceneName || sceneInfo.id)}-${Date.now()}.astral3d-project.json`;
    const jsonBlob = new Blob([JSON.stringify(bundlePayload, null, 2)], {type: "application/json;charset=utf-8"});
    downloadBlobFile(jsonBlob, fileName);

    window.$message?.success("项目包导出成功");
  } catch (err) {
    console.error(err);
    window.$message?.error("项目包导出失败");
  } finally {
    packageInstance.dispose();
    exportingProjectBundle.value = false;
    globalConfigStore.loading = false;
  }
}

async function importProjectBundleFile(bundleData: SceneProjectBundle) {
  importingProjectBundle.value = true;
  globalConfigStore.loading = true;
  globalConfigStore.loadingText = "正在导入项目包...";

  let firstPackageUrl = "";
  let packageInstance: Package | null = null;
  const createdObjectUrls: string[] = [];

  const previousRequest = (window.viewer.options.request || {}) as Record<string, any>;
  const previousBaseUrl = String(previousRequest.baseUrl || "");
  const previousPackageFetch = Package._fetch;
  const currentSceneInfo = JSON.parse(JSON.stringify((App.project.getKey("sceneInfo") || {}) as ISceneInfo));

  try {
    const packageBlobMap = new Map<string, Blob>();
    for (const [name, dataUrl] of Object.entries(bundleData.packageFiles)) {
      packageBlobMap.set(name, await dataUrlToBlob(dataUrl));
    }

    const firstBlob = packageBlobMap.get(bundleData.firstPackageName);
    if (!firstBlob) {
      throw new Error("first package missing");
    }

    firstPackageUrl = URL.createObjectURL(firstBlob);
    createdObjectUrls.push(firstPackageUrl);

    const lookupPackageBlob = (url: string) => {
      const filename = decodeURIComponent(url.split("/").pop() || "");
      return packageBlobMap.get(filename);
    };

    Package._fetch = (url: string, options: { onSuccess?: (res: { blob: () => Blob }) => void, onError?: (err: unknown) => void } = {}) => {
      const blob = lookupPackageBlob(url);
      if (!blob) {
        options.onError?.(new Error(`missing package file: ${url}`));
        return;
      }
      options.onSuccess?.({
        blob: () => blob
      });
    };

    // 用对象URL导入首包，需要临时禁用 baseUrl 前缀拼接
    if (!window.viewer.options.request) {
      window.viewer.options.request = {baseUrl: ""};
    } else {
      window.viewer.options.request.baseUrl = "";
    }

    // 清空当前场景后导入
    App.clear();
    window.viewer.options.hdr = "";

    packageInstance = new Package(window.viewer);
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("import timeout"));
      }, 180000);

      packageInstance!.unpack({
        url: firstPackageUrl,
        onProgress: (progress) => {
          globalConfigStore.loadingText = `${progress.toFixed(2)}%`;
        },
        onComplete: () => {
          window.clearTimeout(timeout);
          resolve();
        }
      });
    });

    // 导入到“当前场景”：保持当前 sceneInfo 基础信息，覆盖场景内容与配置
    const importedSceneInfo = App.project.getKey("sceneInfo") as ISceneInfo;
    App.project.setKey("sceneInfo", {
      ...importedSceneInfo,
      id: currentSceneInfo.id,
      sceneName: currentSceneInfo.sceneName,
      sceneType: currentSceneInfo.sceneType,
      sceneIntroduction: currentSceneInfo.sceneIntroduction,
      sceneVersion: currentSceneInfo.sceneVersion,
      projectType: currentSceneInfo.projectType,
      coverPicture: currentSceneInfo.coverPicture,
      zip: currentSceneInfo.zip,
      zipSize: currentSceneInfo.zipSize,
      cesiumConfig: currentSceneInfo.cesiumConfig
    });

    window.$message?.success(t("plugin.gltfHandler['Import success!']"));
  } catch (err) {
    console.error(err);
    window.$message?.error("项目包导入失败");
  } finally {
    if (packageInstance) {
      packageInstance.dispose();
    }
    createdObjectUrls.forEach(url => URL.revokeObjectURL(url));
    Package._fetch = previousPackageFetch;
    if (!window.viewer.options.request) {
      window.viewer.options.request = {baseUrl: previousBaseUrl};
    } else {
      window.viewer.options.request.baseUrl = previousBaseUrl;
    }
    importingProjectBundle.value = false;
    globalConfigStore.loading = false;
  }
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
  if (key === "exportSceneProjectPackage" || key === "exportSceneProjectBundle") {
    await exportProjectBundle();
    return;
  }

  if (key.startsWith("exportObject")) {
    if (App.selected === null) {
      window.$message?.error(window.$t("prompt['No object selected.']"));
      return;
    }
  }

  // @ts-ignore
  exportClass[key]?.();
}

onMounted(() => {
})
</script>

<style scoped lang="less"></style>
