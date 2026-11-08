import type { ComputedRef } from 'vue'
import participants from '#shared/utils/participants'
import stateKeys from '~/data/state-keys'

interface CurrentUser {
  /** The signed-in user, `undefined` when signed out. */
  user: ComputedRef<Session.User | undefined>
  /** The user as a participant: the address of their first mailbox. */
  me: ComputedRef<Inbox.Participant>
  /** The user's address in the given mail account, for replies from that mailbox. */
  mailboxOf: (accountId: string) => Inbox.Participant
  /** Whether the participant is the person using Linelo, by any of their addresses. */
  isMe: (participant: Inbox.Participant) => boolean
  /** "You" for the current user, otherwise the participant's name. */
  displayName: (participant: Inbox.Participant) => string
  /** Names joined for running text, with "you" for the current user. */
  listNames: (list: readonly Inbox.Participant[]) => string
  /** Sets the signed-in user; the auth middleware does this from `/api/me`. */
  set: (user: Session.User) => void
}

/**
 * The person using Linelo. Kept in our own state (`current-user`), filled by the
 * auth middleware, so stories and tests can seed it without a server.
 */
function useCurrentUser(): CurrentUser {
  const user = useState<Session.User | undefined>(stateKeys.currentUser, () => undefined)

  const me = computed<Inbox.Participant>(() => {
    const signedIn = user.value
    return (
      signedIn?.accounts[0]?.address ?? { name: signedIn?.name ?? '', email: signedIn?.email ?? '' }
    )
  })
  const addresses = computed(() =>
    user.value
      ? [
          ...user.value.accounts.map(account => account.address),
          { name: user.value.name, email: user.value.email },
        ]
      : [],
  )

  function mailboxOf(accountId: string): Inbox.Participant {
    return user.value?.accounts.find(account => account.id === accountId)?.address ?? me.value
  }

  function isMe(participant: Inbox.Participant): boolean {
    return addresses.value.some(address => participants.isSameAddress(participant, address))
  }

  function displayName(participant: Inbox.Participant): string {
    return isMe(participant) ? 'You' : participant.name
  }

  function listNames(list: readonly Inbox.Participant[]): string {
    return list.map(participant => (isMe(participant) ? 'you' : participant.name)).join(', ')
  }

  function set(signedIn: Session.User): void {
    user.value = signedIn
  }

  return {
    user: computed(() => user.value),
    me,
    mailboxOf,
    isMe,
    displayName,
    listNames,
    set,
  }
}

export default useCurrentUser
