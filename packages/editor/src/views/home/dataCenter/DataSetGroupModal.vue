<template>
    <n-modal :show="show" @mask-click="handleClose">
        <n-card class="w-120 max-w-600px" :title="t('home.Data set group config')">
            <n-form :model="model" :rules="rules" ref="formRef" label-placement="left" label-width="auto">
                <n-form-item :label="t('home.Parent group')">
                    <n-cascader v-model:value="model.pid" expand-trigger="hover" :options="treeData"
                        check-strategy="child" show-path filterable clearable label-field="name" value-field="id" />
                </n-form-item>
                <n-form-item :label="t('home.Group name')" path="name">
                    <n-input v-model:value="model.name" />
                </n-form-item>

                <div class="flex justify-end mt-4">
                    <n-button @click="handleClose" class="mr-2">{{ t("other.Cancel") }}</n-button>
                    <n-button type="primary" @click="saveDataSet">{{ t("other.Ok") }}</n-button>
                </div>
            </n-form>
        </n-card>
    </n-modal>
</template>

<script lang="ts" setup>
import { useTemplateRef } from "vue";
import type { FormInst } from 'naive-ui'
import { t } from "@/language";

const props = withDefaults(defineProps<{
    show: boolean,
    treeData: IDataSet.IGroup[],
    model: IDataSet.IGroup
}>(), {
    show: false,
    treeData: () => [],
    model: () => ({
        id: '',
        pid: '',
        name: '',
    })
})
const emits = defineEmits(["update:show", "refresh"]);

const formRef = useTemplateRef<FormInst>("formRef");
const rules = {
    name: { required: true, message: t("prompt.Please enter a grouping name for the dataset"), trigger: 'blur' }
};

function handleClose() {
    emits("update:show", false);
}

function saveDataSet(e: MouseEvent) {
    e.preventDefault()

    formRef.value?.validate((errors) => {
        if (!errors) {
            if (!props.model.id) {
                // 新增

            } else {
                // 更新

            }

            // 刷新父页面表格
            emits("refresh");

            handleClose();
        }
    })
}
</script>