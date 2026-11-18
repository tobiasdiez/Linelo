<script setup lang="ts">
import ComposerActions from './ComposerActions.vue'
</script>

<template>
  <Stories title="Inbox/Composer Actions" :component="ComposerActions">
    <Story title="Ready">
      <ComposerActions
        class="max-w-96"
        label="Send reply"
        can-submit
        hint="Sending resolves this message."
      />
    </Story>
    <Story title="Nothing To Send">
      <ComposerActions
        class="max-w-96"
        label="Forward"
        :can-submit="false"
        hint="Forwarding resolves this message."
      />
    </Story>
    <Story title="Sending">
      <ComposerActions
        class="max-w-96"
        label="Send reply"
        can-submit
        busy
        hint="Sending resolves this message."
      />
    </Story>
  </Stories>
</template>
