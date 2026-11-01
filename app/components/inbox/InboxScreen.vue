<script setup lang="ts">
import DecisionRail from './DecisionRail.vue'
import ThreadView from './ThreadView.vue'

const { item, busy = false } = defineProps<{
  item: Inbox.QueueItem
  /** True while an action is being carried out. */
  busy?: boolean
}>()

const emit = defineEmits<{
  resolve: [action: Inbox.TerminalAction]
  delegate: []
}>()
</script>

<template>
  <!-- Fixed rail width, so opening the composer never reflows the message being read -->
  <div
    class="mx-auto grid w-full max-w-6xl items-start gap-10 px-6 pt-4 pb-40 lg:grid-cols-[minmax(0,1fr)_24rem] lg:px-10 lg:pb-12"
  >
    <ThreadView
      :thread="item.thread"
      :why-shown="item.whyShown"
      class="motion-safe:animate-fade-in"
    />
    <!-- Opacity only: a transform here would detach the fixed action bar below `lg` while animating -->
    <DecisionRail
      :item="item"
      :busy="busy"
      class="motion-safe:animate-fade-in"
      @resolve="emit('resolve', $event)"
      @delegate="emit('delegate')"
    />
  </div>
</template>
