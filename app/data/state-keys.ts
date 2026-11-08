/**
 * The `useState` keys of everything that belongs to the signed-in user. Leaving
 * for sign-in clears all of them (`useSignInRedirect`).
 */
const stateKeys = {
  currentUser: 'current-user',
  /** Whether the server was asked who is signed in, so hydration does not ask again. */
  currentUserChecked: 'current-user-checked',
  inboxQueue: 'inbox-queue',
  inboxQueueStatus: 'inbox-queue-status',
  inboxQueueResolving: 'inbox-queue-resolving',
} as const

export default stateKeys
