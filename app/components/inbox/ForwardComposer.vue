<script setup lang="ts">
import ComposerActions from './ComposerActions.vue'
import RailHeading from './RailHeading.vue'
import type { UInput } from '#components'
import parseRecipient from '~/utils/parse-recipient'

const NOTE_ROWS = 3
const MAX_NOTE_ROWS = 10

const {
  sender,
  hasAttachments = false,
  participants = [],
  busy = false,
} = defineProps<{
  /** Who sent the message being forwarded. */
  sender: Inbox.Participant
  /** The message has file attachments; they are forwarded with it. */
  hasAttachments?: boolean
  /** The people on the thread, so a bare address gets their name. */
  participants?: Inbox.Participant[]
  /** True while the message is being forwarded: the fields are read-only, focus stays where it is. */
  busy?: boolean
}>()

const emit = defineEmits<{
  forward: [to: Inbox.Participant]
  back: []
}>()

/** What was typed into the recipient field: an address, or `Name <address>`. */
const recipient = defineModel<string>('recipient', { default: '' })
const note = defineModel<string>('note', { default: '' })

const { isMe } = useCurrentUser()
const headingId = useId()
const recipientId = useId()
const hintId = useId()
const recipientField = useTemplateRef<InstanceType<typeof UInput>>('recipientField')
/**
 * The field was left with text in it, so a malformed address may be pointed out.
 * A draft kept from an earlier visit (Back, then Delegate again) counts as left.
 */
const leftWithText = ref(recipient.value.trim() !== '')

const parsed = computed(() => parseRecipient(recipient.value, participants))
const showInvalid = computed(
  () => leftWithText.value && recipient.value.trim() !== '' && !parsed.value,
)
/** One line where it fits: whose message goes along, and whether its attachments do. */
const summary = computed(() => {
  const attachments = hasAttachments ? ' and attachments' : ''
  if (isMe(sender)) {
    return `Forwards your message${attachments}.`
  }
  // A sender without a name has only an address, which does not take a possessive
  if (!sender.name || sender.name === sender.email) {
    return `Forwards the message from ${sender.email}${hasAttachments ? ', with attachments' : ''}.`
  }
  return `Forwards ${sender.name}'s message${attachments}.`
})

function onBlur(): void {
  if (recipient.value.trim() !== '') {
    leftWithText.value = true
  }
}

function forward(): void {
  if (parsed.value) {
    emit('forward', parsed.value)
  }
}

// Open ready to type the address
onMounted(() => {
  recipientField.value?.inputRef?.focus()
})
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-4">
    <div>
      <RailHeading :heading-id="headingId">Forward</RailHeading>
      <UCard variant="flush" class="has-[:focus-visible]:focus-ring">
        <template #header>
          <div class="flex items-center gap-2">
            <!-- The field's name is "Forward to"; the card only needs to show "To" -->
            <label :for="recipientId" class="text-xs text-muted">
              <span class="sr-only">Forward to</span><span aria-hidden="true">To</span>
            </label>
            <!-- Plain text: `type="email"` rejects `Name <address>`, and the `email` token would offer the user's own address -->
            <UInput
              :id="recipientId"
              ref="recipientField"
              v-model="recipient"
              type="text"
              inputmode="email"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="name@company.com"
              variant="none"
              class="min-w-0 flex-1"
              :ui="{ base: 'px-0 text-sm text-highlighted' }"
              :readonly="busy"
              :aria-invalid="showInvalid || undefined"
              :aria-describedby="showInvalid ? hintId : undefined"
              @blur="onBlur"
            />
          </div>
          <!-- Always there, so the line takes no new room when it appears and is announced -->
          <p :id="hintId" role="status" aria-live="polite" class="h-4 text-xs/4 text-muted">
            <template v-if="showInvalid">Enter an email address.</template>
          </p>
        </template>

        <!-- Capped like the reply on large screens, so Forward and Back stay on screen -->
        <UTextarea
          v-model="note"
          aria-label="Note"
          placeholder="Add a note (optional)"
          variant="none"
          size="lg"
          :rows="NOTE_ROWS"
          :maxrows="MAX_NOTE_ROWS"
          autoresize
          class="w-full"
          :readonly="busy"
          :ui="{ base: 'lg:max-h-[calc(100dvh-26rem)]' }"
        />

        <template #footer>
          <p class="text-xs text-muted">{{ summary }}</p>
        </template>
      </UCard>
    </div>

    <ComposerActions
      label="Forward"
      :can-submit="parsed !== undefined"
      :busy="busy"
      hint="Forwarding resolves this message."
      @submit="forward"
      @back="emit('back')"
    />
  </section>
</template>
