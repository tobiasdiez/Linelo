import type { ComputedRef } from 'vue'
import currentUser from '~/data/current-user'
import participants from '#shared/utils/participants'

interface CurrentUser {
  me: ComputedRef<Inbox.Participant>
  /** Whether the participant is the person using Linelo. */
  isMe: (participant: Inbox.Participant) => boolean
  /** "You" for the current user, otherwise the participant's name. */
  displayName: (participant: Inbox.Participant) => string
  /** Names joined for running text, with "you" for the current user. */
  listNames: (list: readonly Inbox.Participant[]) => string
}

/**
 * The person using Linelo.
 * TODO: Load the signed-in Microsoft account once account connection exists.
 */
function useCurrentUser(): CurrentUser {
  const me = computed(() => currentUser)

  function isMe(participant: Inbox.Participant): boolean {
    return participants.isSameAddress(participant, me.value)
  }

  function displayName(participant: Inbox.Participant): string {
    return isMe(participant) ? 'You' : participant.name
  }

  function listNames(list: readonly Inbox.Participant[]): string {
    return list.map(participant => (isMe(participant) ? 'you' : participant.name)).join(', ')
  }

  return { me, isMe, displayName, listNames }
}

export default useCurrentUser
