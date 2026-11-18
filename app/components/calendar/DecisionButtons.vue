<script setup lang="ts">
import calendarDecisionActions from '~/data/calendar-decision-actions'

const {
  title,
  layout = 'row',
  busy = false,
  pending = undefined,
} = defineProps<{
  /** The suggested event's title, for the buttons' names. */
  title: string
  /** `row`: compact, with key hints, in the active row from `lg` on. `bar`: full width, in the bar below `lg`. */
  layout?: 'row' | 'bar'
  /** A decision is being carried out: the buttons stay focusable (`aria-disabled`), but do nothing. */
  busy?: boolean
  /** The decision being carried out, shown with a spinner. */
  pending?: Calendar.DecisionVerb
}>()

const emit = defineEmits<{
  decide: [decision: Calendar.DecisionVerb]
}>()

const appConfig = useAppConfig()

function variantOf(primary: boolean): 'soft' | 'solid' | 'ghost' | 'outline' {
  if (layout === 'row') {
    return primary ? 'soft' : 'ghost'
  }
  return primary ? 'solid' : 'outline'
}

function decide(decision: Calendar.DecisionVerb): void {
  if (!busy) {
    emit('decide', decision)
  }
}
</script>

<template>
  <div :class="layout === 'row' ? 'flex items-center gap-1.5' : 'grid grid-cols-2 gap-2'">
    <UButton
      v-for="action in calendarDecisionActions"
      :key="action.verb"
      :label="action.label"
      :aria-label="action.labelFor(title)"
      :color="action.primary ? 'primary' : 'neutral'"
      :variant="variantOf(action.primary)"
      :size="layout === 'row' ? 'md' : 'lg'"
      :block="layout === 'bar'"
      :aria-keyshortcuts="action.key.toUpperCase()"
      :aria-disabled="busy || undefined"
      :data-pending="pending === action.verb || undefined"
      @click="decide(action.verb)"
    >
      <template v-if="layout === 'row' || pending === action.verb" #trailing>
        <UIcon
          v-if="pending === action.verb"
          :name="appConfig.ui.icons.loading"
          class="size-4 motion-safe:animate-spin"
        />
        <UKbd v-else :value="action.key.toUpperCase()" aria-hidden="true" />
      </template>
    </UButton>
  </div>
</template>
