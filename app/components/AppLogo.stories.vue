<script setup lang="ts">
import AppLogo from './AppLogo.vue'
</script>

<template>
  <Stories title="App Logo" :component="AppLogo">
    <Story title="Standard">
      <AppLogo />
    </Story>
  </Stories>
</template>
