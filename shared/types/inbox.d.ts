/**
 * Inbox domain types, shared by the app and (later) the server.
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
     * TODO: Microsoft Graph returns HTML bodies; revisit once ingestion lands.
     */
    body: string
    attachments: Attachment[]
  }

  /** A conversation, ordered oldest to newest. The last message is the one being decided. */
  interface Thread {
    id: string
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

  /** Plain, serializable queue state, so it can live in `useState`. */
  interface QueueState {
    /** Items still to decide, in the order they are shown. */
    pending: QueueItem[]
    /** Resolved items, most recent last. Used for undo. */
    resolved: QueueItem[]
  }

  interface ReplyRecipients {
    to: Participant[]
    cc: Participant[]
  }
}
