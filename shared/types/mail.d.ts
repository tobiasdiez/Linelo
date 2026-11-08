/**
 * The provider-neutral server mail layer (`server/mail`). Everything provider-specific
 * lives behind `Mail.Provider`; the rest of the server and the app only see `Inbox.*`.
 * Declared as a global namespace because the lint setup allows only default exports,
 * and kept in `shared` so the server's unit tests, which run without Nitro, see it too.
 */
declare namespace Mail {
  /** Why a mail call failed: the provider no longer accepts our credentials, or it is not reachable right now. */
  type ErrorKind = 'reconnect' | 'unavailable'

  interface Connection {
    account: { id: string; address: Inbox.Participant }
    /** A valid access token; refreshes when needed. `force` refreshes even if the stored one looks valid. */
    accessToken: (options?: { force?: boolean }) => Promise<string>
  }

  /**
   * A thread as a provider lists it: its id is the provider's own (a conversation id),
   * unique within the account. The inbox makes it unique across accounts.
   */
  type Thread = Omit<Inbox.Thread, 'accountId'>

  interface Provider {
    /**
     * The scopes an account of this provider needs on top of sign-in to be a mailbox,
     * requested at sign-in. An account that was granted fewer is not a mailbox.
     */
    mailScopes: readonly string[]
    /** Unread conversations of the inbox, newest unread first, each with its thread. */
    listUnreadThreads: (connection: Connection, options: { limit: number }) => Promise<Thread[]>
    /** Marks messages read or unread. */
    setRead: (connection: Connection, messageIds: readonly string[], read: boolean) => Promise<void>
  }

  /** A connected mail account with the adapter of its provider. */
  interface Mailbox {
    providerId: string
    provider: Provider
    connection: Connection
  }

  /** Where access tokens of stored accounts come from. Throws a `MailError` when there is none. */
  interface TokenSource {
    accessToken: (
      account: { id: string; userId: string },
      options: { force: boolean },
    ) => Promise<string>
  }
}
