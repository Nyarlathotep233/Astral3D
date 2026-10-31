<template>
    <div>
        <div class="flex justify-between mb-3">
            <n-input :placeholder="t('prompt.Please enter a grouping name for the dataset')" class="max-w-64 mr-2"
                v-model:value="pattern" @update:value="">
                <template #prefix>
                    <n-icon :component="Search" />
                </template>
            </n-input>

            <n-button type="primary" @click="handleAddGroup">
                <template #icon>
                    <n-icon :size="30">
                        <Add />
                    </n-icon>
                </template>
            </n-button>
        </div>

        <n-tree :show-irrelevant-nodes="false" :pattern="pattern" :data="data" block-line show-line default-expand-all
            :override-default-node-click-behavior="handleOverride" :node-props="handleNodeProps" key-field="id"
            label-field="name" />

        <n-dropdown trigger="manual" placement="bottom-start" :show="showDropdown" :options="options" :x="x" :y="y"
            @select="handleDropdownSelect" @clickoutside="handleDropdownClickoutside" />

        <!-- 数据集组模态框 -->
        <DataSetGroupModal v-model:show="showGroupModal" :model="currentGroup" :treeData="data" @refresh="getTreeData" />
    </div>
</template>

<script lang="ts" setup>
import { ref, reactive,onMounted } from "vue";
import type { DropdownOption, TreeOption, TreeOverrideNodeClickBehaviorReturn } from 'naive-ui';
import { Search, Add } from '@vicons/carbon';
import { t } from "@/language";
import DataSetGroupModal from "./DataSetGroupModal.vue";

const pattern = ref("");
const data: IDataSet.IGroup[] = [
    {
        name: '0',
        id: '0',
        children: [
            {
                name: '0-0',
                id: '0-0',
                children: [
                    { name: '0-0-0', id: '0-0-0' },
                    { name: '0-0-1', id: '0-0-1' }
                ]
            },
            {
                name: '0-1',
                id: '0-1',
                children: [
                    { name: '0-1-0', id: '0-1-0' },
                    { name: '0-1-1', id: '0-1-1' }
                ]
            }
        ]
    },
    {
        name: '1',
        id: '1',
        children: [
            {
                name: '1-0',
                id: '1-0'
            },
            {
                name: '1-1',
                id: '1-1'
            }
        ]
    }
]

function getTreeData(){}

// 子节点选中，含子节点则展开
function handleOverride({ option }): TreeOverrideNodeClickBehaviorReturn {
    if (option.children) {
        return 'toggleExpand'
    }
    return 'default'
}

/* 新增/修改模态框 */
const showGroupModal = ref(false);
const currentGroup = reactive<IDataSet.IGroup>({
    id: "",
    pid: "",
    name: ""
});

function handleAddGroup(){
    currentGroup.id = "";
    currentGroup.pid = "";
    currentGroup.name = "";

    showGroupModal.value = true;
}

/* 树右键菜单相关 */
const showDropdown = ref(false);
const options = ref<DropdownOption[]>([
    {
        label: t("home.Delete"),
        key: 'delete',
        disabled: true
    },
    {
        label: t("layout.sider.script.Edit"),
        key: 'edit'
    }
]);
const x = ref(0)
const y = ref(0)

// 绑定节点属性以实现右键菜单
function handleNodeProps(_props: { option: TreeOption }) {
    return {
        onClick() { },
        onContextmenu(e: MouseEvent): void {
            showDropdown.value = true;
            x.value = e.clientX;
            y.value = e.clientY;

            e.preventDefault();
        }
    }
}

function handleDropdownSelect() {
    showDropdown.value = false;
}

function handleDropdownClickoutside() {
    showDropdown.value = false;
}

onMounted(() => {
    getTreeData();
})
</script>