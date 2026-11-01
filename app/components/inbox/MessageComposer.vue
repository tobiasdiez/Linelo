<script setup lang="ts">
import RailActionBar from './RailActionBar.vue'
import type { UTextarea } from '#components'
import formatRecipients from '~/utils/format-recipients'

const MIN_ROWS = 5
const MAX_ROWS = 14

const {
  recipients,
  followUpTask = undefined,
  busy = false,
} = defineProps<{
  recipients: Inbox.ReplyRecipients
  /** Offered as an optional task to create after sending. */
  followUpTask?: Inbox.TaskDraft
  /** True while the reply is being sent. */
  busy?: boolean
}>()

const emit = defineEmits<{
  send: []
  back: []
}>()

const body = defineModel<string>('body', { default: '' })
const addFollowUp = defineModel<boolean>('addFollowUp', { default: false })

const { macOS } = useKbd()
const editor = useTemplateRef<InstanceType<typeof UTextarea>>('editor')

const canSend = computed(() => body.value.trim().length > 0)
const recipientLabels = computed(() => formatRecipients(recipients))
const sendShortcut = computed(() => (macOS.value ? 'Meta+Enter' : 'Control+Enter'))

function send(): void {
  if (canSend.value && !busy) {
    emit('send')
  }
}

// Stay in the composer while sending: if sending fails, the draft is still here
function back(): void {
  if (!busy) {
    emit('back')
  }
}

// Both work while typing, which is where they are needed
defineShortcuts({
  escape: { usingInput: true, handler: ignoreRepeats(back) },
  meta_enter: { usingInput: true, handler: ignoreRepeats(send) },
})

// Open ready to edit or send: focused, with the caret at the end
onMounted(() => {
  const textarea = editor.value?.textareaRef
  if (textarea) {
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <UCard variant="flush" class="has-[textarea:focus-visible]:focus-ring">
      <template #header>
        <p class="text-xs text-muted">
          To <strong class="font-semibold text-default">{{ recipientLabels.to }}</strong>
          <template v-if="recipientLabels.cc"> · Cc {{ recipientLabels.cc }}</template>
        </p>
      </template>

      <!-- The rail is sticky on large screens: cap the height so Send and Back stay on screen -->
      <UTextarea
        ref="editor"
        v-model="body"
        aria-label="Reply"
        variant="none"
        size="lg"
        :rows="MIN_ROWS"
        :maxrows="MAX_ROWS"
        autoresize
        class="w-full"
        :ui="{ base: 'lg:max-h-[calc(100dvh-29rem)]' }"
      />

      <template v-if="followUpTask" #footer>
        <UCheckbox v-model="addFollowUp">
          <template #label>
            Also add to Todoist:
            <strong class="font-semibold text-default">{{ followUpTask.title }}</strong
            ><template v-if="followUpTask.due">, due {{ followUpTask.due }}</template>
          </template>
        </UCheckbox>
      </template>
    </UCard>

    <RailActionBar>
      <UButton
        label="Send reply"
        color="primary"
        variant="solid"
        size="lg"
        block
        class="justify-between"
        :disabled="!canSend"
        :loading="busy"
        :aria-keyshortcuts="sendShortcut"
        @click="send"
      >
        <template #trailing>
          <span aria-hidden="true" class="flex gap-0.5 max-sm:hidden">
            <UKbd value="meta" color="primary" variant="solid" />
            <UKbd value="enter" color="primary" variant="solid" />
          </span>
        </template>
      </UButton>
      <UButton
        label="Back"
        size="lg"
        block
        class="justify-between"
        aria-keyshortcuts="Escape"
        :disabled="busy"
        @click="back"
      >
        <template #trailing>
          <UKbd value="escape" aria-hidden="true" class="max-sm:hidden" />
        </template>
      </UButton>
      <template #hint>
        <p class="mt-2 text-center text-xs text-muted">Sending resolves this message.</p>
      </template>
    </RailActionBar>
  </div>
</template>
