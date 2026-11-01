<script setup lang="ts">
import AppHeader from './AppHeader.vue'
</script>

<template>
  <Stories title="App Header" :component="AppHeader">
    <Story title="Standard">
      <AppHeader />
    </Story>
  </Stories>
</template>
