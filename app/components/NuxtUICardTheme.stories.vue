<script setup lang="ts">
import { UCard } from "#components";
</script>

<template>
  <Stories title="Nuxt UI/Card Theme">
    <Story title="Default">
      <UCard>
        <p class="text-base text-toned">Default card.</p>
      </UCard>
    </Story>

    <Story title="Soft Inset">
      <UCard variant="soft">
        <p class="text-base text-toned">Soft card variant.</p>
      </UCard>
    </Story>
  </Stories>
</template>
