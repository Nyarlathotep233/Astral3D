<script setup lang="ts">
import { reactive, ref } from "vue";
import type { FormInst } from "naive-ui";
import { DEFAULT_GIS_CONFIG, type GisConfig } from "@astral3d/engine";

const formRef = ref<FormInst | null>(null);
const form = reactive<GisConfig>(structuredClone(DEFAULT_GIS_CONFIG));
const rules = {
  tiandituToken: {
    required: true,
    message: "请输入天地图 Token",
    trigger: ["input", "blur"],
  },
};

function getData() {
  return { ...form, initialView: { ...form.initialView } };
}

function validate() {
  return formRef.value?.validate();
}

defineExpose({ getData, validate });
</script>

<template>
  <n-form
    ref="formRef"
    :model="form"
    :rules="rules"
    label-placement="left"
    label-width="100"
    size="small"
  >
    <n-form-item label="天地图 Token" path="tiandituToken">
      <n-input v-model:value="form.tiandituToken" placeholder="请输入天地图 Token" />
    </n-form-item>
    <n-form-item label="初始经度">
      <n-input-number
        v-model:value="form.initialView.longitude"
        :min="-180"
        :max="180"
        :precision="6"
        class="w-full"
      />
    </n-form-item>
    <n-form-item label="初始纬度">
      <n-input-number
        v-model:value="form.initialView.latitude"
        :min="-90"
        :max="90"
        :precision="6"
        class="w-full"
      />
    </n-form-item>
    <n-form-item label="相机高度">
      <n-input-number
        v-model:value="form.initialView.altitude"
        :min="1"
        :precision="0"
        class="w-full"
      >
        <template #suffix>米</template>
      </n-input-number>
    </n-form-item>
  </n-form>
</template>
