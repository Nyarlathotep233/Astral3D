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
import {App, Export, Loader, Package} from "@astral3d/engine";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {createPrefabFile} from "@/utils/common/prefab";

const exportClass = new Export();
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

interface SceneStandaloneManifest {
  signature: string;
  version: number;
  exportedAt: string;
  sourceSceneId: string;
  sourceSceneInfo: ISceneInfo;
  firstPackageName: string;
  packageFiles: string[];
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

async function restoreSceneAfterImportFailure(sceneInfo: ISceneInfo) {
  globalConfigStore.loadingText = "导入失败，正在恢复原场景...";

  App.clear();
  if (!sceneInfo.zip) {
    window.viewer.options.hdr = "/static/resource/hdr/cloudy.hdr";
    window.viewer.loadEnv(true);
    App.project.setKey("sceneInfo", sceneInfo);
    return;
  }

  window.viewer.options.hdr = "";
  let restorePackage: Package | null = new Package(window.viewer);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("restore timeout"));
      }, 180000);

      restorePackage!.unpack({
        url: sceneInfo.zip,
        onComplete: () => {
          window.clearTimeout(timeout);
          resolve();
        }
      });
    });
  } finally {
    if (restorePackage) {
      restorePackage.dispose();
      restorePackage = null;
    }
  }

  App.project.setKey("sceneInfo", sceneInfo);
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

    const fileName = `${safeFilename(sceneInfo.sceneName || sceneInfo.id)}-${Date.now()}${PROJECT_JSON_SUFFIX}`;
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

async function exportProjectBundleZip() {
  const sceneInfo = App.project.getKey("sceneInfo") as ISceneInfo | undefined;
  if (!sceneInfo?.id) {
    window.$message?.error(window.$t("scene['The project does not exist!']"));
    return;
  }

  exportingProjectBundle.value = true;
  globalConfigStore.loading = true;
  globalConfigStore.loadingText = "正在生成项目包(.zip)...";

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

    const firstPackageName = String(exported.firstUploadResult || packageFiles[0]?.name || "");
    if (!firstPackageName) {
      throw new Error("Failed to find first package");
    }

    const archive = new JSZip();
    const packageFolder = archive.folder("packages") as JSZip;

    for (const pkg of packageFiles) {
      packageFolder.file(pkg.name, await pkg.arrayBuffer());
    }

    const groupPackages = packageFiles.map(file => file.name).filter(name => name !== firstPackageName);
    const manifest: SceneProjectZipManifest = {
      signature: ZIP_BUNDLE_SIGNATURE,
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      sourceSceneId: sceneInfo.id,
      sourceSceneInfo: JSON.parse(JSON.stringify(sceneInfo)),
      firstPackageName,
      packageFiles: packageFiles.map(file => file.name),
      initRequirements: {
        resources: {
          firstPackage: firstPackageName,
          groupPackages,
          packageFileCount: packageFiles.length,
          packageContentHint: ["scene.json", "config.json", "Textures/*", "Geometries/*", "Drawing/*"]
        }
      }
    };

    archive.file("project.json", JSON.stringify(manifest, null, 2));

    const zipBlob = await archive.generateAsync({type: "blob"});
    const fileName = `${safeFilename(sceneInfo.sceneName || sceneInfo.id)}-${Date.now()}${PROJECT_ZIP_SUFFIX}`;
    downloadBlobFile(zipBlob, fileName);

    window.$message?.success("项目包(.zip)导出成功");
  } catch (err) {
    console.error(err);
    window.$message?.error("项目包(.zip)导出失败");
  } finally {
    packageInstance.dispose();
    exportingProjectBundle.value = false;
    globalConfigStore.loading = false;
  }
}

function buildStandalonePreviewHtml(sceneName: string) {
  const escapedTitle = (sceneName || "Astral3D Standalone Preview")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const closeScriptTag = "</scr" + "ipt>";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedTitle}</title>
  <style>
    :root, :root > body, #app {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #0b1020;
      color: #dbe7ff;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    /* 防止全局样式污染 HtmlPanel 注入的嵌套 html/body，导致黑底方块 */
    .css3d-imported-content,
    .css3d-imported-content html,
    .css3d-imported-content body {
      background: transparent !important;
    }

    #status {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 10;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(16, 24, 48, 0.8);
      border: 1px solid rgba(130, 180, 255, 0.35);
      font-size: 12px;
      line-height: 1.5;
      max-width: calc(100vw - 24px);
      box-sizing: border-box;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="status">正在初始化 Standalone 预览...</div>

  <script src="./runtime/astral3d.umd.js">${closeScriptTag}
  <script>
    (async function () {
      const statusEl = document.getElementById("status");
      const setStatus = function (text) {
        if (statusEl) statusEl.textContent = String(text || "");
      };

      const ensure = function (value, message) {
        if (!value) throw new Error(message);
        return value;
      };

      try {
        const sdk = ensure(window.Astral3D, "Astral3D runtime 未加载");
        const manifestRes = await fetch("./project.json");
        if (!manifestRes.ok) throw new Error("读取 project.json 失败: HTTP " + manifestRes.status);
        const manifest = await manifestRes.json();
        const firstPackageName = ensure(manifest.firstPackageName, "project.json 缺少 firstPackageName");

        const viewer = new sdk.Viewer({
          container: ensure(document.getElementById("app"), "容器不存在"),
          edit: { enabled: false },
          grid: { enabled: false },
          request: { baseUrl: "" }
        });

        window.viewer = viewer;

        setStatus("正在加载场景首包...");
        const loader = new sdk.Package(viewer);
        await new Promise(function (resolve, reject) {
          const timer = window.setTimeout(function () {
            reject(new Error("场景加载超时（180s）"));
          }, 180000);

          loader.unpack({
            url: "./packages/" + firstPackageName,
            onProgress: function (progress) {
              const p = Number(progress || 0).toFixed(2);
              setStatus("正在加载场景... " + p + "%");
            },
            onComplete: function () {
              window.clearTimeout(timer);
              loader.dispose();
              resolve();
            }
          });
        });

        setStatus("场景加载完成");
        window.setTimeout(function () {
          if (statusEl) statusEl.style.display = "none";
        }, 1200);
      } catch (err) {
        console.error(err);
        setStatus("Standalone 预览初始化失败:\\n" + (err && err.message ? err.message : String(err)));
      }
    })();
  ${closeScriptTag}
</body>
</html>`;
}

async function fetchRuntimeFile(path: string) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`读取运行时文件失败: ${path} (HTTP ${res.status})`);
  }
  return await res.arrayBuffer();
}

async function exportStandalonePreviewZip() {
  const sceneInfo = App.project.getKey("sceneInfo") as ISceneInfo | undefined;
  if (!sceneInfo?.id) {
    window.$message?.error(window.$t("scene['The project does not exist!']"));
    return;
  }

  exportingProjectBundle.value = true;
  globalConfigStore.loading = true;
  globalConfigStore.loadingText = "正在生成 Standalone 预览包(.zip)...";

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

    const firstPackageName = String(exported.firstUploadResult || packageFiles[0]?.name || "");
    if (!firstPackageName) {
      throw new Error("Failed to find first package");
    }

    const archive = new JSZip();
    const packageFolder = archive.folder("packages") as JSZip;
    const runtimeFolder = archive.folder("runtime") as JSZip;

    for (const pkg of packageFiles) {
      packageFolder.file(pkg.name, await pkg.arrayBuffer());
    }

    const manifest: SceneStandaloneManifest = {
      signature: "h3d-scene-standalone-preview-package-zip",
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      sourceSceneId: sceneInfo.id,
      sourceSceneInfo: JSON.parse(JSON.stringify(sceneInfo)),
      firstPackageName,
      packageFiles: packageFiles.map(file => file.name),
    };

    // 运行时资源：MVP 仅注入核心 SDK UMD
    const runtimeUmd = await fetchRuntimeFile("/standalone-runtime/astral3d.umd.js");
    runtimeFolder.file("astral3d.umd.js", runtimeUmd);
    archive.file("project.json", JSON.stringify(manifest, null, 2));
    archive.file("index.html", buildStandalonePreviewHtml(sceneInfo.sceneName || sceneInfo.id));
    archive.file("README.txt", [
      "Standalone 预览包（MVP）",
      "",
      "打开方式：",
      "1. 解压后在该目录启动一个静态文件服务（例如 npx serve .）",
      "2. 浏览器访问 http://127.0.0.1:3000/index.html（或实际端口）",
      "",
      "说明：",
      "- 该包仅用于预览，不包含编辑能力。",
      "- 该包不依赖 astral 后端接口。",
      "- 若场景脚本主动调用外部接口，离线环境下可能失败。",
      "",
    ].join("\n"));

    const zipBlob = await archive.generateAsync({type: "blob"});
    const fileName = `${safeFilename(sceneInfo.sceneName || sceneInfo.id)}-${Date.now()}.h3d-standalone-preview.zip`;
    downloadBlobFile(zipBlob, fileName);

    window.$message?.success("Standalone 预览包导出成功");
  } catch (err) {
    console.error(err);
    window.$message?.error(err instanceof Error ? err.message : "Standalone 预览包导出失败");
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
  let sceneCleared = false;

  try {
    const packageBlobMap = new Map<string, Blob>();
    for (const [name, dataUrl] of Object.entries(bundleData.packageFiles)) {
      packageBlobMap.set(name, await dataUrlToBlob(dataUrl));
    }

    validateBundleFiles(bundleData, packageBlobMap);

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
    sceneCleared = true;

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

    // 导入到“当前场景”：保持当前场景元数据，避免污染后续保存参数
    App.project.setKey("sceneInfo", currentSceneInfo);

    window.$message?.success(t("plugin.gltfHandler['Import success!']"));
  } catch (err) {
    console.error(err);

    // 先恢复 fetch/baseUrl，再尝试回滚场景，避免 import 失败后影响保存链路
    Package._fetch = previousPackageFetch;
    if (!window.viewer.options.request) {
      window.viewer.options.request = {baseUrl: previousBaseUrl};
    } else {
      window.viewer.options.request.baseUrl = previousBaseUrl;
    }

    if (sceneCleared) {
      try {
        await restoreSceneAfterImportFailure(currentSceneInfo);
        window.$message?.error("项目包导入失败，已恢复到导入前场景");
      } catch (restoreErr) {
        console.error(restoreErr);
        App.project.setKey("sceneInfo", currentSceneInfo);
        window.$message?.error("项目包导入失败，且恢复原场景失败，请刷新页面后重试");
      }
    } else {
      App.project.setKey("sceneInfo", currentSceneInfo);
      window.$message?.error("项目包导入失败");
    }
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

async function importProjectBundleZipFile(zipFile: File) {
  const zipContent = await new JSZip().loadAsync(zipFile);
  const manifestFile = zipContent.file("project.json");
  if (!manifestFile) {
    throw new Error("项目包缺少 project.json");
  }

  const manifest = JSON.parse(await manifestFile.async("string"));
  if (!isProjectBundleZipManifest(manifest)) {
    throw new Error("不是有效的项目包(.zip)");
  }

  const packageFilesMap: Record<string, string> = {};
  for (const fileName of manifest.packageFiles) {
    const packageFile = zipContent.file(`packages/${fileName}`);
    if (!packageFile) {
      throw new Error(`项目包缺少分包文件：${fileName}`);
    }

    const blob = await packageFile.async("blob");
    packageFilesMap[fileName] = await readAsDataUrl(blob);
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
    packageFiles: packageFilesMap,
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

  await importProjectBundleFile(bundleData);
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
      const prefabFile = await createPrefabFile(App.selected);
      downloadBlobFile(prefabFile, prefabFile.name);
      window.$message?.success("Prefab 导出成功");
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
