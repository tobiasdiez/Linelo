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
    /** One line explaining why this thread is shown now. */
    whyShown: string
    suggestions: Suggestion[]
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

  /** `GET /api/inbox` */
  interface InboxResponse {
    /** Newest unread first. */
    items: QueueItem[]
  }

  /** `GET /api/me`: the signed-in user and their mail accounts; `user: null` when signed out. */
  interface MeResponse {
    user: { name: string; email: string } | null
    accounts: MailAccount[]
  }

  /** `POST /api/mail/read` */
  interface ReadStateRequest {
    accountId: string
    messageIds: string[]
    read: boolean
  }
}
