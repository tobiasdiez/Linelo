<script setup lang="ts">
const DEFAULT_LOGO_SIZE = 96

const {
  alt = 'Linelo',
  size = DEFAULT_LOGO_SIZE,
} = defineProps<{
  alt?: string
  size?: number | string
}>()
</script>

<template>
  <img
    :src="'/logo.svg'"
    :alt="alt"
    :style="{ width: typeof size === 'number' ? `${size}px` : size }"
    class="app-logo"
  >
</template>

<style scoped>
.app-logo {
  display: block;
  height: auto;
}
</style>