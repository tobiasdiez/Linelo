/**
 * Client-side work in flight that belongs to one session of the inbox (a sign-in, in this
 * page): requests to the mailbox, the sync, refills. `create` makes what a session starts
 * with; when the session token changes (leaving for sign-in clears it, see
 * `stateKeys.inboxSession`), the next session gets its own, so nothing of an ended
 * session can hold it up or be joined by it.
 */
function sessionScoped<Value>(create: () => Value): (session: string) => Value {
  const holder: { session?: string; value?: Value } = {}
  return session => {
    if (holder.session !== session || holder.value === undefined) {
      holder.session = session
      holder.value = create()
    }
    return holder.value
  }
}

/** Random 32-bit words in a session token: enough that two sessions of one page never share one. */
const TOKEN_WORDS = 2

/**
 * A new session token, for `useState(stateKeys.inboxSession, newSession)`. Not
 * `crypto.randomUUID`, which a page served over plain HTTP (other than localhost) lacks.
 */
function newSession(): string {
  return crypto.getRandomValues(new Uint32Array(TOKEN_WORDS)).join('-')
}

sessionScoped.newSession = newSession

export default sessionScoped
