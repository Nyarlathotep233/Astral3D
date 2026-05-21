<script lang="ts" setup>
import {inject} from "vue";
import { useRouter } from 'vue-router';
import NavigationOperation from '@/components/header/NavigationOperation.vue';
import RightOperation from '@/components/header/RightOperation.vue';
import Logo from "@/components/header/Logo.vue";

const router = useRouter();

const sceneInfo = inject<ISceneInfo>("sceneInfo");

function handleLogoClick(){
  // 回首页
  router.push('/');
}
</script>

<template>
  <div class="flex items-center">
    <Logo class="w-36px h-36px mr-15px cursor-pointer" @click="handleLogoClick" />

    <NavigationOperation />
  </div>

  <h3 class="header-title truncate m-0 flex-1 min-w-0 px-2 text-center">{{ sceneInfo?.sceneName }}</h3>

  <RightOperation />
</template>

<style lang="less" scoped>
.header-title {
  line-height: var(--header-height);
}

.n-menu.n-menu--horizontal {
  width: auto;

  :deep(.n-menu-item-content) {
    padding: 0 0.5rem;
  }
}
</style>
