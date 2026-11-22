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

  /** What a provider lists about a message without loading its thread: its envelope and its own text. */
  interface Envelope {
    id: string
    /** The provider's conversation id: the `id` of the `Thread` it belongs to. */
    threadId: string
    from: Inbox.Participant
    to: Inbox.Participant[]
    cc: Inbox.Participant[]
    subject: string
    /** ISO 8601. */
    receivedAt: string
    /** The provider's short plain-text preview of the body (Graph: 255 characters). */
    preview: string
    /** The message's own complete text, without quoted history where the provider can tell. */
    text: string
    marks: Marks
  }

  /** What the provider and the mailbox owner marked a message with. */
  interface Marks {
    /** Has a List-Unsubscribe header; `undefined` only from a provider that cannot read headers. */
    unsubscribable?: boolean
    importance: 'low' | 'normal' | 'high'
    /** Flagged for follow-up by the mailbox owner. */
    flagged: boolean
    /** The provider's own sorting, where it has one (Outlook: Focused or Other). */
    sorting?: 'focused' | 'other'
  }

  /** An unread message as the list step sees it: ids and time only. */
  type ListedMessage = Pick<Envelope, 'id' | 'threadId' | 'receivedAt'>

  /** Which envelopes `listUnread` returns. */
  interface Listing {
    /** The most messages to return; fewer only when the mailbox has no more. */
    limit: number
    /** Only messages received at or before this time (ISO 8601), to continue from a message. */
    before?: string
  }

  /** Whom a sent message went to. */
  interface SentEnvelope {
    to: Inbox.Participant[]
    cc: Inbox.Participant[]
    /** ISO 8601. */
    sentAt: string
  }

  /** What `loadThreads` found. A conversation that failed to load is in neither list. */
  interface LoadedThreads {
    /** The threads with something unread, in the order asked for. */
    threads: Thread[]
    /** Conversations that loaded with nothing unread left (read or deleted elsewhere). */
    finished: string[]
  }

  interface Provider {
    /**
     * The scopes an account of this provider needs on top of sign-in to be a mailbox,
     * requested at sign-in. An account that was granted fewer is not a mailbox.
     */
    mailScopes: readonly string[]
    /**
     * The ids of the newest `limit` unread messages, newest first, paged inside the adapter:
     * fewer only when the mailbox has no more unread mail. Unread mail is mail that waits on
     * the owner, in any folder except those for deleted, junk, sent, draft, archived and
     * scheduled mail.
     */
    listUnreadIds: (connection: Connection, options: { limit: number }) => Promise<ListedMessage[]>
    /**
     * The envelopes of unread messages, as `listUnreadIds` counts them, with their texts,
     * newest first; fewer than `limit` only at the end, or when mail was read meanwhile. A
     * page holds every unread message from its oldest one up to `before`: the sync takes
     * what a page lacks in that span as read.
     */
    listUnread: (connection: Connection, listing: Listing) => Promise<Envelope[]>
    /** The threads of these conversations, in this order. One with nothing unread left is left out of `threads`. */
    loadThreads: (connection: Connection, threadIds: readonly string[]) => Promise<LoadedThreads>
    /** The recipients of the newest sent messages, newest first. */
    listSent: (connection: Connection, options: { limit: number }) => Promise<SentEnvelope[]>
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
