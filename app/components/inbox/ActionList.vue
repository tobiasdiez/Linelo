<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import RailActionBar from './RailActionBar.vue'
import RailHeading from './RailHeading.vue'
import decisionActions from '~/data/decision-actions'

const { busy = false } = defineProps<{
  /** Disables the actions, and their keys, while one is being carried out. */
  busy?: boolean
}>()

const emit = defineEmits<{
  action: [kind: Inbox.TerminalAction['kind']]
}>()

const headingId = useId()
const replyButton = shallowRef<HTMLElement>()

function setReplyButton(instance: Element | ComponentPublicInstance | null): void {
  const element: unknown = instance && '$el' in instance ? instance.$el : instance
  replyButton.value = element instanceof HTMLElement ? element : undefined
}

function focusReply(): void {
  replyButton.value?.focus()
}

defineShortcuts(
  computed(() =>
    busy
      ? {}
      : Object.fromEntries(
          decisionActions.map(action => [
            action.key,
            ignoreRepeats(() => emit('action', action.kind)),
          ]),
        ),
  ),
)

defineExpose({ focusReply })
</script>

<template>
  <section :aria-labelledby="headingId">
    <RailHeading :heading-id="headingId" class="max-lg:sr-only">Decide</RailHeading>
    <RailActionBar>
      <UButton
        v-for="action in decisionActions"
        :key="action.kind"
        :ref="action.kind === 'reply' ? setReplyButton : undefined"
        :label="action.label"
        :color="action.primary ? 'primary' : 'neutral'"
        :variant="action.primary ? 'solid' : 'outline'"
        size="lg"
        block
        class="justify-between"
        :aria-keyshortcuts="action.key.toUpperCase()"
        :disabled="busy"
        @click="emit('action', action.kind)"
      >
        <template #trailing>
          <UKbd
            :value="action.key.toUpperCase()"
            :color="action.primary ? 'primary' : 'neutral'"
            :variant="action.primary ? 'solid' : 'outline'"
            aria-hidden="true"
            class="max-sm:hidden"
          />
        </template>
      </UButton>
    </RailActionBar>
  </section>
</template>
