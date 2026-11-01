import type { ComputedRef, WritableComputedRef } from 'vue'

const MANUAL_DRAFT_KEY = 'manual'

interface ReplyDrafts {
  /** The reply text for the chosen suggestion, or for a manual reply. */
  draft: WritableComputedRef<string>
  /** Whether the chosen suggestion's follow-up task should be created after sending. */
  addFollowUp: WritableComputedRef<boolean>
}

/**
 * Reply drafts and follow-up choices, kept per suggestion (and one for a manual
 * reply) for as long as the component lives, so going back and reopening the
 * composer does not lose work.
 */
function useReplyDrafts(chosenReply: ComputedRef<Inbox.ReplySuggestion | undefined>): ReplyDrafts {
  const drafts = reactive(new Map<string, string>())
  const followUps = reactive(new Map<string, boolean>())
  const key = computed(() => chosenReply.value?.id ?? MANUAL_DRAFT_KEY)

  const draft = computed({
    get: () => drafts.get(key.value) ?? chosenReply.value?.draft ?? '',
    set: value => {
      drafts.set(key.value, value)
    },
  })
  const addFollowUp = computed({
    get: () => followUps.get(key.value) ?? false,
    set: value => {
      followUps.set(key.value, value)
    },
  })

  return { draft, addFollowUp }
}

export default useReplyDrafts
