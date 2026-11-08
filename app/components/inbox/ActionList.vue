<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import RailActionBar from './RailActionBar.vue'
import RailHeading from './RailHeading.vue'
import decisionActions from '~/data/decision-actions'

const { busy = false, pending = undefined } = defineProps<{
  /**
   * Blocks the actions, and their keys, while one is being carried out. They stay
   * focusable (`aria-disabled`), so focus stays on the action that was pressed.
   */
  busy?: boolean
  /** The action being carried out, shown with a spinner. */
  pending?: Inbox.TerminalAction['kind']
}>()

const appConfig = useAppConfig()

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

function act(kind: Inbox.TerminalAction['kind']): void {
  if (!busy) {
    emit('action', kind)
  }
}

// `act` ignores them while busy
defineShortcuts(
  Object.fromEntries(decisionActions.map(action => [action.key, shortcut(() => act(action.kind))])),
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
        :aria-disabled="busy || undefined"
        :data-pending="pending === action.kind || undefined"
        @click="act(action.kind)"
      >
        <template #trailing>
          <UIcon
            v-if="pending === action.kind"
            :name="appConfig.ui.icons.loading"
            class="size-5 motion-safe:animate-spin"
          />
          <UKbd
            v-else
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
