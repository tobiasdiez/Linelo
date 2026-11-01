<script setup lang="ts">
import RailActionBar from './RailActionBar.vue'
import { UButton } from '#components'
</script>

<template>
  <Stories title="Inbox/Rail Action Bar" :component="RailActionBar">
    <Story title="With Hint">
      <div class="max-w-96">
        <RailActionBar>
          <UButton label="Send reply" color="primary" variant="solid" size="lg" block />
          <UButton label="Back" size="lg" block />
          <template #hint>
            <p class="mt-2 text-center text-xs text-muted">Sending resolves this message.</p>
          </template>
        </RailActionBar>
      </div>
    </Story>
  </Stories>
</template>
