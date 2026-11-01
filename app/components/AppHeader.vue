<script setup lang="ts">
const LOGO_SIZE = 26

const { me } = useCurrentUser()
</script>

<template>
  <header class="flex h-16 items-center justify-between px-6 lg:px-10">
    <div class="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight">
      <AppLogo :size="LOGO_SIZE" alt="" />
      Linelo
    </div>
    <UAvatar :alt="me.name" color="neutral" size="md" role="img" :aria-label="me.name" />
  </header>
</template>
