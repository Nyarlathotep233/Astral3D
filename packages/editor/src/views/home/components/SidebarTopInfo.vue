<script setup lang="ts">
withDefaults(defineProps<{
  collapsed: boolean
}>(), {
  collapsed: false
})
</script>

<template>
  <div class="pt-24px w-full flex justify-center items-center">
    <div class="min-w-40px">
      <Logo />
    </div>

    <transition enter-active-class="animate__animated animate__fadeInRight" leave-active-class="animate__animated animate__fadeOutRight">
      <div class="ml-8px brand-text" v-if="!collapsed">
        <n-gradient-text :size="22" type="success" class="brand-main">
          H3D Editor
        </n-gradient-text>
        <n-text depth="3" class="brand-sub">
          Haolink 3D
        </n-text>
      </div>
    </transition>
  </div>
</template>

<style scoped lang="less">
.brand-text{
  display:flex;
  flex-direction:column;
  line-height:1.05;
}
.brand-main{
  font-weight:700;
  letter-spacing:0.4px;
}
.brand-sub{
  margin-top:2px;
  font-size:11px;
  letter-spacing:1px;
  text-transform:uppercase;
}
</style>
