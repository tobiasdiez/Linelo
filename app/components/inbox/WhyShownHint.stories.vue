<script setup lang="ts">
import WhyShownHint from './WhyShownHint.vue'
import inboxBuilders from '~/data/inbox-builders'

const { whyShown } = inboxBuilders.storyItem('thread-vendor-review')
</script>

<template>
  <Stories title="Inbox/Why Shown Hint" :component="WhyShownHint">
    <Story title="Standard">
      <p class="flex items-center gap-1 p-4 text-xs text-muted">
        3 messages · Lena Hartmann, you, Priya Nair
        <WhyShownHint :text="whyShown" />
      </p>
    </Story>
  </Stories>
</template>
