/**
 * Inbox domain types, shared by the app and the server.
 * Declared as a global namespace because the lint setup allows only default exports.
 */
declare namespace Inbox {
  interface Participant {
    name: string
    email: string
  }

  interface Attachment {
    id: string
    name: string
    sizeBytes: number
  }

  interface Message {
    id: string
    from: Participant
    /**
     * Where replies go instead of `from`, when set (contact forms, ticketing systems
     * and mailing lists send from a no-reply address). Empty for most mail.
     */
    replyTo: Participant[]
    to: Participant[]
    cc: Participant[]
    /** ISO 8601 timestamp. */
    sentAt: string
    /**
     * Plain text, paragraphs separated by blank lines.
     * TODO: Render sanitized HTML bodies once that is its own feature.
     */
    body: string
    attachments: Attachment[]
    /** Not read yet in the mailbox. Mark as handled marks exactly these as read. */
    unread: boolean
  }

  /** A conversation, ordered oldest to newest. The last message is the one being decided. */
  interface Thread {
    /** Opaque and unique across accounts. */
    id: string
    /** The connected account the thread lives in, so actions reach the right mailbox. */
    accountId: string
    subject: string
    messages: [Message, ...Message[]]
  }

  interface TaskDraft {
    title: string
    /** Natural-language due date as understood by the task manager, for example "Wednesday". */
    due?: string
  }

  interface ReplySuggestion {
    kind: 'reply'
    id: string
    label: string
    draft: string
    followUpTask?: TaskDraft
  }

  interface HandledSuggestion {
    kind: 'handled'
    id: string
    label: string
  }

  interface TaskSuggestion {
    kind: 'task'
    id: string
    label: string
    task: TaskDraft
  }

  /** A structured suggestion. Up to three per item, addressed by position (1 to 3). */
  type Suggestion = ReplySuggestion | HandledSuggestion | TaskSuggestion

  interface QueueItem {
    /**
     * Identifies the decision: the thread plus its latest unread message. New mail
     * in a resolved thread gets a new key, so the thread can come back.
     */
    key: string
    thread: Thread
    /** Why this thread is shown now, in one or two sentences. */
    whyShown: string
    suggestions: Suggestion[]
    /** The band of its score. Never shown. */
    tier: Ranking.Tier
    /** A model's reading is behind the suggestions: they carry the AI badge. */
    assisted: boolean
  }

  type TerminalAction =
    | {
        kind: 'reply'
        body: string
        to: Participant[]
        cc: Participant[]
        /** Created after the reply was sent. */
        followUpTask?: TaskDraft
      }
    | { kind: 'handled' }
    | { kind: 'delegate'; to: Participant; note: string }
    | { kind: 'task'; task: TaskDraft }

  /** A resolved item and the action that resolved it, so undo knows what to revert. */
  interface Resolution {
    item: QueueItem
    kind: TerminalAction['kind']
  }

  /** Plain, serializable queue state, so it can live in `useState`. */
  interface QueueState {
    /** Items still to decide, in the order they are shown. */
    pending: QueueItem[]
    /** Items resolved in this session, most recent last. Used for undo and to keep them out of refreshes. */
    resolved: Resolution[]
  }

  interface ReplyRecipients {
    to: Participant[]
    cc: Participant[]
  }

  /** A connected account whose mailbox feeds the inbox. */
  interface MailAccount {
    id: string
    /** The provider id, for example `microsoft`. */
    provider: string
    address: Participant
  }

  /** `GET /api/inbox?limit=&start=` */
  interface InboxResponse {
    /** In the order to decide them. */
    items: QueueItem[]
    /**
     * Nothing worth showing yet, and a sync could change that (`items` is then empty):
     * the page asks for the starting batch, or runs the sync to its end.
     */
    preparing: boolean
  }

  /** `POST /api/inbox/sync` */
  interface SyncRequest {
    /** The starting batch: the newest 50 unread messages are read and judged first. */
    start: boolean
  }

  /**
   * `POST /api/inbox/sync`: one sync step for each of the user's mailboxes. `done`: nothing is
   * left to judge in any of them, which includes messages the judge did not answer for (they
   * keep the rules' score until a later sync asks again); `busy`: another step was working on a
   * mailbox (another tab), ask again a second later; `more` otherwise.
   */
  interface SyncResponse {
    status: Ranking.StepResult
  }

  /** `GET /api/me`: the signed-in user and their mail accounts; `user: null` when signed out. */
  interface MeResponse {
    user: { name: string; email: string } | null
    accounts: MailAccount[]
  }

  /**
   * `POST /api/mail/read`: `read` resolves the messages (Mark as handled), `read: false` brings
   * them back (Undo); both are recorded in the index of unread mail too.
   */
  interface ReadStateRequest {
    accountId: string
    messageIds: string[]
    read: boolean
  }

  /** A request body as the server validated it: the request, or the first field that does not fit. */
  type Validated<Request> =
    | { value: Request; field?: undefined }
    | { value?: undefined; field: string }

  /** What a reply and a forward have in common: the message acted on, and what to mark as read. */
  interface MessageActionRequest {
    accountId: string
    /** The message acted on: the latest unread one of the thread. */
    messageId: string
    /** The thread's unread messages, marked as read once the mail is sent. */
    markAsRead: string[]
  }

  /** `POST /api/mail/reply` */
  interface ReplyRequest extends MessageActionRequest {
    /** Plain text, paragraphs separated by blank lines. */
    body: string
    to: Participant[]
    cc: Participant[]
  }

  /** `POST /api/mail/forward` */
  interface ForwardRequest extends MessageActionRequest {
    /** Exactly one recipient for now; a list, so several can follow without a new shape. */
    to: Participant[]
    /** Plain text; may be empty. */
    note: string
  }

  /**
   * Why an API call failed, when the server says (`data.reason`): Linelo lost access
   * to the mailbox, the account did not grant a permission the call needs, or the
   * mailbox did not confirm a send (`server/mail/http-error.ts`).
   */
  type ApiErrorReason = 'reconnect' | 'consent' | 'uncertain'
}
