<script setup lang="ts">
import {ref} from "vue";
import {t} from "@/language";
import Logo from "@/components/header/Logo.vue";
import EsPluginList from "@/components/es/plugin/EsPluginList.vue";

withDefaults(defineProps<{
  visible:boolean
}>(),{
  visible:false
})

const emits = defineEmits(["update:visible"]);

const searchText = ref("");

function handleClose(){
  emits("update:visible",false);
}
</script>

<template>
  <n-modal :show="visible" @maskClick="handleClose" @esc="handleClose">
    <n-card class="es-tools-dialog fixed top-20vh w-90% max-w-800px" :bordered="false" role="dialog" aria-modal="true">
      <template #header>
        <n-input v-model:value="searchText" type="text" size="large" autofocus clearable class="font-500"
          placeholder="Hi, H3D Editor">
          <template #prefix>
            <Logo class="w-30px h-30px" />
          </template>
        </n-input>
      </template>

      <n-text depth="3" class="relative bottom-10px left-5px"> {{ t("plugin['Optional plug-in']") }} </n-text>

      <EsPluginList @close="handleClose" :search="searchText" />
    </n-card>
  </n-modal>
</template>

<style lang="less">
@media screen and (max-width: 800px) {
  .es-tools-dialog{
    left:5%;
  }
}
@media screen and (min-width: 800px) {
  .es-tools-dialog{
    left:calc(50% - 400px);
  }
}
</style>
