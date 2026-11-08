<script setup lang="ts">
import ActionList from './ActionList.vue'
import MessageComposer from './MessageComposer.vue'
import RailHeading from './RailHeading.vue'
import SuggestionCard from './SuggestionCard.vue'
import SuggestionList from './SuggestionList.vue'
import latestMessage from '#shared/utils/latest-message'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

type RailMode = 'decide' | 'reply'
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
  /** Delegating is not built yet; the parent explains that. */
  delegate: []
}>()

/** `decide` shows suggestions and actions, `reply` the composer. */
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
// Reply from the mailbox the thread lives in
const recipients = computed(() =>
  replyAllRecipients(latestMessage(item.thread), mailboxOf(item.thread.accountId)),
)

/** The control that started the action in flight, shown with a spinner once the wait is noticeable. */
const pressed = shallowRef<{ action?: Inbox.TerminalAction['kind']; suggestionId?: string }>({})
const showPending = ref(false)
const pendingTimer: { id?: ReturnType<typeof setTimeout> } = {}

watch(
  () => busy,
  isBusy => {
    clearTimeout(pendingTimer.id)
    showPending.value = false
    if (isBusy) {
      pendingTimer.id = setTimeout(() => {
        showPending.value = true
      }, PENDING_DELAY_MS)
    }
  },
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
      emit('delegate')
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

function back(): void {
  mode.value = 'decide'
}

// Back returns focus to the control that opened the composer
watch(
  mode,
  value => {
    if (value !== 'decide') {
      return
    }
    if (chosenSuggestionId.value) {
      suggestionList.value?.focusSuggestion(chosenSuggestionId.value)
    } else {
      actionList.value?.focusReply()
    }
  },
  { flush: 'post' },
)

/*
 * The actions stay focusable while busy, but the composer's buttons are disabled,
 * which drops focus. If the action fails, the item stays, and focus goes back.
 */
const focusBeforeBusy = shallowRef<HTMLElement>()
watch(
  () => busy,
  async isBusy => {
    if (isBusy) {
      focusBeforeBusy.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
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

    <template v-else>
      <section v-if="chosenReply" :aria-labelledby="replyingHeadingId">
        <RailHeading :heading-id="replyingHeadingId" ai>Replying with</RailHeading>
        <SuggestionCard :suggestion="chosenReply" :position="chosenPosition" selected />
      </section>
      <MessageComposer
        v-model:body="draft"
        v-model:add-follow-up="addFollowUp"
        :recipients="recipients"
        :follow-up-task="chosenReply?.followUpTask"
        :busy="busy"
        @send="send"
        @back="back"
      />
    </template>
  </aside>
</template>
