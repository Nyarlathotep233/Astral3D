<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted, nextTick, useTemplateRef, reactive } from "vue";
import { useThemeVars } from 'naive-ui';
import { Upload, Delete, Link } from '@vicons/carbon';
import * as THREE from 'three';
import { App,Loader, PointCloudReconstructor,AddObjectCommand } from "@astral3d/engine";
import { t } from "@/language";
import { createBasicScene } from "@/utils/common/scenes";
import ReconstructorForm from "./pointCloudReconstructor/ReconstructorForm.vue";

const themeVars = useThemeVars();
const borderColor = computed(() => themeVars.value.borderColor);
const primaryColor = computed(() => themeVars.value.primaryColor);
const hoverColor = computed(() => themeVars.value.hoverColor);
const textColor3 = computed(() => themeVars.value.textColor3);

const formRef = useTemplateRef("formRef");
const viewerRef = useTemplateRef("viewerRef");
const uploadInputRef = useTemplateRef("uploadInputRef");

const loading = ref(false);
const loadingText = ref<string>(t("plugin.pointCloudReconstructor['The point cloud is being reconstructed...']"));

const fileList = ref<File[]>([]);
const stats = reactive({
    reconstructorDone: false,
    percentage:0,
    message:"",
    // 下面是统计信息
    totalPoints: "0",
    reconstructedObjects: 0,
    processingTime: "0s"
})

let tmpScene, tmpDispose;
const sceneAbort = new AbortController();
onBeforeUnmount(() => { sceneAbort.abort(); tmpDispose?.(); });
let reconstructor, startTime;
// 点云模型对象，重建好的对象
let pointCloud,reconstructedGroup;
let sceneReady: Promise<void>;
onMounted(() => {
    sceneReady = nextTick().then(async () => {
        const p = await createBasicScene(viewerRef.value as HTMLDivElement, sceneAbort.signal);
        tmpScene = p.scene;
        tmpDispose = p.dispose;
    });
    void sceneReady.catch(error => {
        if (!sceneAbort.signal.aborted) { console.error(error); window.$message?.error(String(error)); }
    });
})

// 拖拽文件进入
function handleFilesDrop(event: DragEvent) {
    const originFiles = event.dataTransfer?.files;

    if (!originFiles || !originFiles.length) return;

    const files: File[] = [];
    for (let i = 0; i < originFiles.length; i++) {
        const s = originFiles[i].name.split(".");
        if (["glb", "gltf", "ply", "pcd"].includes(s[s.length - 1].toLowerCase())) {
            files.push(originFiles[i]);
        }
    }

    if (files.length > 0) {
        // 暂时只支持单个模型处理
        fileList.value = [files[0]];
        handleFileLoad();
    }
}

// 手动选择文件
function handleSelectFile() {
    if (stats.reconstructorDone) {
        window.$dialog.warning({
            title: window.$t('other.warning'),
            content: window.$t("plugin.pointCloudReconstructor['Re-selecting the file will empty the previous reconstruction. Do you want to continue?']"),
            positiveText: window.$t('other.Ok'),
            negativeText: window.$t('other.Cancel'),
            onPositiveClick: async () => {
                fileList.value = [];

                stats.reconstructorDone = false;

                uploadInputRef.value?.click();
            },
        });
    } else {
        fileList.value = [];

        uploadInputRef.value?.click();
    }
}

// 文件变更
function handleUploadChange(event) {
    const files = event.target.files;

    if (files) {
        fileList.value = [files[0]];

        handleFileLoad();
    }
}

// 文件模型加载
async function handleFileLoad() {
    try { await sceneReady; } catch { return; }
    if (sceneAbort.signal.aborted) return;
    clearScene();

    const verifyExec = (object3D:THREE.Points) => {
        pointCloud = object3D;

        stats.totalPoints = object3D.geometry.attributes.position.count.toLocaleString();

        tmpScene.add(pointCloud);
    }

    const object3D = await Loader.loadFile(fileList.value[0], new THREE.LoadingManager(), null, false) as THREE.Points;
    if (sceneAbort.signal.aborted) return;
    if (object3D.type === "Points") {
        verifyExec(object3D);
    } else if (object3D.children.length === 1 && object3D.children[0].type === "Points") {
        verifyExec(object3D.children[0] as THREE.Points);
    } else {
        window.$message?.error(t("plugin.pointCloudReconstructor['The model is not a point cloud']"));

        fileList.value = [];
    }
}

// 删除已选择文件
function handleDeleteFile() {
    if (stats.reconstructorDone) {
        window.$dialog.warning({
            title: window.$t('other.warning'),
            content: window.$t("plugin.pointCloudReconstructor['This operation will empty the associated reconstructions. Do you want to continue?']"),
            positiveText: window.$t('other.Ok'),
            negativeText: window.$t('other.Cancel'),
            onPositiveClick: async () => {
                fileList.value = [];

                stats.reconstructorDone = false;

                clearScene();
            },
        });
    } else {
        fileList.value = [];

        clearScene();
    }
}

// 提交重建
function handleSubmit() {
    if (fileList.value.length === 0 || !pointCloud) return;

    const model = formRef.value?.model;
    if (!model) return;

    loading.value = true;

    // 防止二次重建
    if(stats.reconstructorDone && reconstructedGroup){
        // 移除原来的重建结果
        tmpScene.remove(reconstructedGroup);
        reconstructedGroup = null;

        // 显示点云
        pointCloud.visible = true;

        stats.reconstructedObjects = 0;
        stats.processingTime = "0s";
    }

    if (!reconstructor) {
        reconstructor = new PointCloudReconstructor();
    }

    reconstructor.colorTolerance = model.colorTolerance;
    reconstructor.distanceThreshold = model.distanceThreshold;
    reconstructor.minClusterSize = model.minClusterSize;
    reconstructor.downsampleResolution = model.downsampleResolution;

    // 处理几何数据
    reconstructor.processGeometry(pointCloud.geometry);

    startTime = performance.now();

    // 开始重建
    reconstructor.reconstruct(
        (progress, status) => {
            stats.percentage = Math.round(progress);

            stats.message = status;
        },
        (objectGroup, totalObjects) => {
            reconstructedGroup = objectGroup;

            tmpScene.add(reconstructedGroup);
                            
            // 更新统计
            stats.reconstructedObjects = totalObjects;
                            
            // 计算处理时间
            const endTime = performance.now();
            const duration = ((endTime - startTime) / 1000).toFixed(1);
            stats.processingTime = `${duration}s`;
                            
            // 隐藏点云
            pointCloud.visible = false;

            stats.reconstructorDone = true;
            loading.value = false;
                            
            // 更新状态
            stats.message = `重建完成: ${totalObjects}个对象 (${duration}秒)`;
        }
    )
}

// 重建结果导入场景
function handleImportScene() {
    if(!tmpScene || !reconstructedGroup) return;

    App.execute(new AddObjectCommand(reconstructedGroup.clone()));
}

// 关闭插件
function handleClose(){
    sceneAbort.abort();
    clearScene();

    tmpDispose && tmpDispose();

    reconstructor && reconstructor.dispose();
}

// 清除场景在此添加的内容
function clearScene(){
    pointCloud && tmpScene.remove(pointCloud);
    reconstructedGroup && tmpScene.remove(reconstructedGroup);
}

defineExpose({
    handleClose
})
</script>

<template>
    <n-spin :show="loading">
        <template #description>
            {{ loadingText }}
        </template>

        <n-progress type="line" :percentage="stats.percentage" indicator-placement="inside" :processing="loading" class="mb-3" />

        <div class="reconstructor-upload grid gap-2"
            :style="{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))' }">
            <div class="reconstructor-upload-card !h-150px" v-if="fileList.length === 0" @click="handleSelectFile"
                @dragover.stop.prevent @drop.stop.prevent="handleFilesDrop">
                <input v-show="false" type="file" ref="uploadInputRef" accept=".glb,.gltf,.ply,.pcd"
                    @change="handleUploadChange" />

                <n-icon size="48" :depth="3" class="mb-12px">
                    <Upload />
                </n-icon>
                <n-text class="mb-6px text-16px">
                    {{ t("plugin.pointCloudReconstructor['Select the Point Cloud model file']") + ":.glb,.gltf,.ply,.pcd" }}
                </n-text>
                <n-text depth="3">
                    {{ t("plugin.pointCloudReconstructor['Please semantically segment the point cloud first']") }}
                </n-text>
            </div>

            <template v-else>
                <div class="reconstructor-upload-list">
                    <div v-for="(file, index) in fileList" :key="index" class="reconstructor-upload-list-item">
                        <n-icon size="16">
                            <Link />
                        </n-icon>
                        <span class="reconstructor-upload-list-item-name" :title="file.name">{{ file.name }}</span>
                        <n-icon size="16" class="reconstructor-upload-list-item-del" @click.stop="handleDeleteFile()">
                            <Delete />
                        </n-icon>
                    </div>
                </div>
            </template>
        </div>

        <div ref="viewerRef" class="w-full h-400px mb-2 relative">
            <span class="absolute bottom-2 left-4">{{ stats.message }}</span>
        </div>

        <n-grid :x-gap="50" :cols="3">
            <n-gi>
                <n-card size="small" embedded hoverable content-class="flex flex-col justify-center items-center">
                    <div>总点数</div>
                    <div class="stats-text text-1.2rem mt-2">{{ stats.totalPoints }}</div>
                </n-card>
            </n-gi>

            <n-gi>
                <n-card size="small" embedded hoverable content-class="flex flex-col justify-center items-center">
                    <div>重建对象</div>
                    <div class="stats-text text-1.2rem mt-2">{{ stats.reconstructedObjects }}</div>
                </n-card>
            </n-gi>

            <n-gi>
                <n-card size="small" embedded hoverable content-class="flex flex-col justify-center items-center">
                    <div>处理时间</div>
                    <div class="stats-text text-1.2rem mt-2">{{ stats.processingTime }}</div>
                </n-card>
            </n-gi>
        </n-grid>

        <ReconstructorForm ref="formRef" />

        <div class="w-full flex justify-center mt-10px">
            <n-button  type="primary" :loading="loading" @click="handleSubmit">
                {{ t("plugin.pointCloudReconstructor.Reconstruction") }}
            </n-button>

            <template v-if="stats.reconstructorDone">
                <n-button type="primary" @click="handleImportScene" class="ml-4">
                    {{ t("plugin.gltfHandler.Import scene") }}
                </n-button>
            </template>
        </div>
    </n-spin>
</template>

<style scoped lang="less">
.reconstructor-upload {
    margin-bottom: 15px;

    &-card {
        position: relative;
        text-align: center;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.02);
        border: 1px dashed v-bind(borderColor);
        border-radius: 8px;
        cursor: pointer;
        outline: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        transition: border-color 0.3s, width 0.3s;

        &:hover {
            border-color: v-bind(primaryColor);
        }
    }

    &-list {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        transition: opacity 0.3s, height 0.3s;

        &::before {
            display: table;
            width: 0;
            height: 0;
            content: "";
        }

        &-item {
            color: v-bind(primaryColor);
            position: relative;
            height: 22px;
            font-size: 14px;
            display: flex;
            align-items: center;
            transition: background-color .3s;
            cursor: pointer;
            padding: 0.4rem 1rem;

            &:hover {
                background-color: v-bind(hoverColor);

                .reconstructor-upload-list-item-del {
                    opacity: 1;
                }
            }

            &-name {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                padding: 0 6px;
                line-height: 1.57;
                flex: auto;
                max-width: 85%;
                transition: all .3s;
            }

            &-del {
                position: absolute;
                right: 8px;
                color: v-bind(textColor3);
                cursor: pointer;
                opacity: 0;
                transition: all .3s;

                &:hover {
                    transform: scale(1.2);
                }

                &:active {
                    transform: scale(0.9);
                }
            }
        }
    }
}

.stats-text {
    color: v-bind(primaryColor);
}
</style>