<script setup lang="ts">
import { UButton } from '#components'
</script>

<template>
  <Stories title="Nuxt UI/Button Theme">
    <Story title="Default">
      <UButton>Default neutral outline</UButton>
    </Story>
    <Story title="Ghost">
      <UButton variant="ghost" icon="i-lucide-settings-2">Neutral ghost</UButton>
    </Story>
    <Story title="Primary Solid">
      <UButton color="primary" variant="solid">Primary action</UButton>
    </Story>
    <Story title="Secondary Solid">
      <UButton color="secondary" variant="solid">Secondary action</UButton>
    </Story>
    <Story title="Prominent Sizes">
      <UButton size="xl">Neutral outline xl</UButton>
    </Story>
  </Stories>
</template>
