<script setup lang="ts">
import AppHeader from './AppHeader.vue'
</script>

<template>
  <Stories title="App Header" :component="AppHeader">
    <Story title="Standard">
      <div>
        <AppHeader />
      </div>
    </Story>
    <Story title="Account Menu Open">
      <div class="min-h-48">
        <AppHeader menu-open />
      </div>
    </Story>
  </Stories>
</template>
