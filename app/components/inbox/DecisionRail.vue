<script setup lang="ts">
import ActionList from './ActionList.vue'
import ForwardComposer from './ForwardComposer.vue'
import RailHeading from './RailHeading.vue'
import ReplyComposer from './ReplyComposer.vue'
import SuggestionCard from './SuggestionCard.vue'
import SuggestionList from './SuggestionList.vue'
import latestUnreadMessage from '#shared/utils/latest-unread-message'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

/** Deciding, or composing for the action of that name. */
type RailMode = 'decide' | ComposerAction
/** The actions that open a composer instead of resolving at once. */
type ComposerAction = Extract<Inbox.TerminalAction['kind'], 'reply' | 'delegate'>
/** A choice that resolves the item at once, without the composer. */
type InstantChoice =
  | Pick<Inbox.HandledSuggestion, 'kind'>
  | Pick<Inbox.TaskSuggestion, 'kind' | 'task'>

const MAX_SUGGESTIONS = 3
/** Waits shorter than this show no spinner, so quick answers do not flicker. */
const PENDING_DELAY_MS = 300

const { item, busy = false } = defineProps<{
  item: Inbox.QueueItem
  /** True while an action is being carried out; the actions are disabled then. */
  busy?: boolean
}>()

const emit = defineEmits<{
  resolve: [action: Inbox.TerminalAction]
}>()

/** `decide` shows suggestions and actions, `reply` the reply composer, `delegate` the forward composer. */
const mode = defineModel<RailMode>('mode', { default: 'decide' })
/** The reply suggestion the composer started from; empty for a manual reply. */
const chosenSuggestionId = defineModel<string | undefined>('chosenSuggestionId')

const { mailboxOf } = useCurrentUser()
const replyingHeadingId = useId()
const suggestionList = useTemplateRef<InstanceType<typeof SuggestionList>>('suggestionList')
const actionList = useTemplateRef<InstanceType<typeof ActionList>>('actionList')

const suggestions = computed(() => item.suggestions.slice(0, MAX_SUGGESTIONS))
const suggestedTask = computed(() =>
  suggestions.value.find((entry): entry is Inbox.TaskSuggestion => entry.kind === 'task'),
)
const chosenReply = computed(() =>
  suggestions.value.find(
    (entry): entry is Inbox.ReplySuggestion =>
      entry.kind === 'reply' && entry.id === chosenSuggestionId.value,
  ),
)
const chosenPosition = computed(
  () => suggestions.value.findIndex(entry => entry.id === chosenReply.value?.id) + 1,
)
const { draft, addFollowUp } = useReplyDrafts(chosenReply)
/** The message being decided, replied to and forwarded; the thread may end with the user's own reply. */
const decidedMessage = computed(() => latestUnreadMessage(item.thread))
// Reply from the mailbox the thread lives in
const recipients = computed(() =>
  replyAllRecipients(decidedMessage.value, mailboxOf(item.thread.accountId)),
)
/** Everyone on the thread, so a bare address typed into the forward field gets its name. */
const threadParticipants = computed(() =>
  item.thread.messages.flatMap(message => [
    message.from,
    ...message.replyTo,
    ...message.to,
    ...message.cc,
  ]),
)
// The forward draft, kept across Back and reopening until the item is resolved
const forwardRecipient = ref('')
const forwardNote = ref('')

/** The control that started the action in flight, shown with a spinner once the wait is noticeable. */
const pressed = shallowRef<{ action?: Inbox.TerminalAction['kind']; suggestionId?: string }>({})
const showPending = ref(false)
const pendingTimer: { id?: ReturnType<typeof setTimeout> } = {}
/** Where focus was when the action started, to put it back if the action fails. */
const focusBeforeBusy = shallowRef<HTMLElement>()

/*
 * While busy: the spinner on the pressed control once the wait is noticeable. The
 * actions and composer fields keep focus while busy, but a control that gets
 * disabled (Back, the follow-up checkbox) drops it. If the action fails, the item
 * stays, and focus goes back.
 */
watch(
  () => busy,
  async isBusy => {
    clearTimeout(pendingTimer.id)
    showPending.value = false
    if (isBusy) {
      focusBeforeBusy.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      pendingTimer.id = setTimeout(() => {
        showPending.value = true
      }, PENDING_DELAY_MS)
      return
    }
    await nextTick()
    // Only if focus was dropped, not if the user moved it elsewhere in the meantime
    const focusWasDropped = !document.activeElement || document.activeElement === document.body
    if (focusWasDropped && focusBeforeBusy.value?.isConnected) {
      focusBeforeBusy.value.focus()
    }
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => clearTimeout(pendingTimer.id))

function toAction(choice: InstantChoice): Inbox.TerminalAction {
  return choice.kind === 'task' ? { kind: 'task', task: choice.task } : { kind: 'handled' }
}

function openReply(suggestion?: Inbox.ReplySuggestion): void {
  chosenSuggestionId.value = suggestion?.id
  mode.value = 'reply'
}

function choose(suggestion: Inbox.Suggestion): void {
  if (suggestion.kind === 'reply') {
    openReply(suggestion)
  } else {
    pressed.value = { suggestionId: suggestion.id }
    emit('resolve', toAction(suggestion))
  }
}

function act(kind: Inbox.TerminalAction['kind']): void {
  pressed.value = { action: kind }
  switch (kind) {
    case 'reply': {
      openReply()
      break
    }
    case 'delegate': {
      mode.value = kind
      break
    }
    case 'handled': {
      emit('resolve', toAction({ kind }))
      break
    }
    case 'task': {
      // Prefer the suggested task, which has a better title and a due date
      emit(
        'resolve',
        toAction(suggestedTask.value ?? { kind, task: { title: item.thread.subject } }),
      )
    }
  }
}

function send(): void {
  const reply = { kind: 'reply', body: draft.value, ...recipients.value } as const
  const followUpTask = addFollowUp.value ? chosenReply.value?.followUpTask : undefined
  emit('resolve', followUpTask ? { ...reply, followUpTask } : reply)
}

function forward(to: Inbox.Participant): void {
  emit('resolve', { kind: 'delegate', to, note: forwardNote.value })
}

function back(): void {
  mode.value = 'decide'
}

// Back returns focus to the control that opened the composer being left
watch(
  mode,
  (value, previous) => {
    // Only when a composer closes; this also narrows `previous` to the composer's action
    if (value !== 'decide' || previous === 'decide') {
      return
    }
    if (previous === 'reply' && chosenSuggestionId.value) {
      suggestionList.value?.focusSuggestion(chosenSuggestionId.value)
    } else {
      actionList.value?.focusAction(previous)
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <aside aria-label="Decide" :aria-busy="busy" class="flex flex-col gap-5 lg:sticky lg:top-4">
    <template v-if="mode === 'decide'">
      <!--
        Room for three suggestions, so the actions keep their place from one message to the next.
        Without suggestions (mail is not ranked yet) the actions move up instead of leaving a gap.
      -->
      <div v-if="suggestions.length > 0" class="lg:min-h-76">
        <SuggestionList
          ref="suggestionList"
          :suggestions="suggestions"
          :busy="busy"
          :pending="showPending ? pressed.suggestionId : undefined"
          @choose="choose"
        />
      </div>
      <ActionList
        ref="actionList"
        :busy="busy"
        :pending="showPending ? pressed.action : undefined"
        @action="act"
      />
    </template>

    <template v-else-if="mode === 'reply'">
      <section v-if="chosenReply" :aria-labelledby="replyingHeadingId">
        <RailHeading :heading-id="replyingHeadingId" ai>Replying with</RailHeading>
        <SuggestionCard :suggestion="chosenReply" :position="chosenPosition" selected />
      </section>
      <ReplyComposer
        v-model:body="draft"
        v-model:add-follow-up="addFollowUp"
        :recipients="recipients"
        :follow-up-task="chosenReply?.followUpTask"
        :busy="busy"
        @send="send"
        @back="back"
      />
    </template>

    <ForwardComposer
      v-else-if="mode === 'delegate'"
      v-model:recipient="forwardRecipient"
      v-model:note="forwardNote"
      :sender="decidedMessage.from"
      :has-attachments="decidedMessage.attachments.length > 0"
      :participants="threadParticipants"
      :busy="busy"
      @forward="forward"
      @back="back"
    />
  </aside>
</template>
