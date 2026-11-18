<script setup lang="ts">
import ComposerActions from './ComposerActions.vue'
import type { UTextarea } from '#components'
import formatRecipients from '~/utils/format-recipients'

const MIN_ROWS = 5
const MAX_ROWS = 14

const {
  recipients,
  followUpTask = undefined,
  busy = false,
} = defineProps<{
  /** Who the reply goes to. Without anyone in "to" (a note to self) it cannot be sent. */
  recipients: Inbox.ReplyRecipients
  /** Offered as an optional task to create after sending. */
  followUpTask?: Inbox.TaskDraft
  /** True while the reply is being sent: the text is read-only, focus stays where it is. */
  busy?: boolean
}>()

const emit = defineEmits<{
  send: []
  back: []
}>()

const body = defineModel<string>('body', { default: '' })
const addFollowUp = defineModel<boolean>('addFollowUp', { default: false })

const editor = useTemplateRef<InstanceType<typeof UTextarea>>('editor')

const hasRecipients = computed(() => recipients.to.length > 0)
const canSend = computed(() => hasRecipients.value && body.value.trim().length > 0)
const recipientLabels = computed(() => formatRecipients(recipients))

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
      <template v-if="hasRecipients" #header>
        <!-- The addresses on hover, since the reply really goes to them -->
        <p class="text-xs text-muted" :title="recipientLabels.addresses">
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
        :readonly="busy"
        :ui="{ base: 'lg:max-h-[calc(100dvh-29rem)]' }"
      />

      <template v-if="followUpTask" #footer>
        <UCheckbox v-model="addFollowUp" :disabled="busy">
          <template #label>
            Also add to Todoist:
            <strong class="font-semibold text-default">{{ followUpTask.title }}</strong
            ><template v-if="followUpTask.due">, due {{ followUpTask.due }}</template>
          </template>
        </UCheckbox>
      </template>
    </UCard>

    <ComposerActions
      label="Send reply"
      :can-submit="canSend"
      :busy="busy"
      :hint="hasRecipients ? 'Sending resolves this message.' : 'No one to reply to.'"
      @submit="emit('send')"
      @back="emit('back')"
    />
  </div>
</template>
