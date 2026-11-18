/**
 * The provider-neutral server mail layer (`server/mail`). Everything provider-specific
 * lives behind `Mail.Provider`; the rest of the server and the app only see `Inbox.*`.
 * Declared as a global namespace because the lint setup allows only default exports,
 * and kept in `shared` so the server's unit tests, which run without Nitro, see it too.
 */
declare namespace Mail {
  /**
   * Why a provider call failed: the provider no longer accepts our credentials, the
   * account did not grant a permission the call needs (`consent`), it is not reachable
   * right now, or (`uncertain`) it may have sent the mail but did not confirm it.
   */
  type ProviderErrorKind = 'reconnect' | 'consent' | 'unavailable' | 'uncertain'

  /** Why a mail call failed: as a provider says, or (`unknownAccount`) the account is not one of the user's mailboxes. */
  type ErrorKind = ProviderErrorKind | 'unknownAccount'

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

  /** A reply as the provider sends it: the request without what only the server needs. */
  type OutgoingReply = Omit<Inbox.ReplyRequest, 'accountId' | 'markAsRead'>

  /** A forward as the provider sends it. */
  type OutgoingForward = Omit<Inbox.ForwardRequest, 'accountId' | 'markAsRead'>

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
    /**
     * Sends a reply to the message, to exactly these recipients; the mailbox keeps a
     * copy in Sent Items. Rejects with a `MailError` of a `ProviderErrorKind`: `unavailable` only when nothing
     * was sent, `uncertain` when it may have been, `reconnect` when the credentials or
     * the permission to send are missing.
     */
    reply: (connection: Connection, reply: OutgoingReply) => Promise<void>
    /** Forwards the message, attachments included, with the note above it. Rejects as `reply` does. */
    forward: (connection: Connection, forward: OutgoingForward) => Promise<void>
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
