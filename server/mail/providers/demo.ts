import MailError from '../mail-error'
import createInboxFixtures from '#shared/data/inbox-fixtures'
import participants from '#shared/utils/participants'

/*
 * Development only: the example threads behind the same interface as a real
 * mailbox, so the whole flow runs without Microsoft credentials. Read state and
 * sent mail live in memory and reset with the dev server.
 */

interface DemoMailbox {
  threads: Mail.Thread[]
  /** Read state changed in this mailbox, by message id; everything else is as in the fixtures. */
  readState: Map<string, boolean>
}

interface Dependencies {
  /** The time the example threads are relative to. */
  now?: () => Date
}

/** Graph's length of a preview. */
const PREVIEW_LENGTH = 255

/** How Outlook would mark the example messages: personal mail sorted under Focused, the newsletter a list. */
const DEFAULT_MARKS: Mail.Marks = {
  unsubscribable: false,
  importance: 'normal',
  flagged: false,
  sorting: 'focused',
}
const DEMO_MARKS: Readonly<Record<string, Partial<Mail.Marks>>> = {
  'newsletter-1': { unsubscribable: true, sorting: 'other' },
}

/** An unread message and the thread it belongs to. */
interface UnreadMessage {
  message: Inbox.Message
  thread: Mail.Thread
}

function newestFirst(first: { sentAt: string }, second: { sentAt: string }): number {
  return Date.parse(second.sentAt) - Date.parse(first.sentAt)
}

function toEnvelope({ message, thread }: UnreadMessage): Mail.Envelope {
  return {
    id: message.id,
    threadId: thread.id,
    from: message.from,
    to: message.to,
    cc: message.cc,
    subject: thread.subject,
    receivedAt: message.sentAt,
    preview: message.body.slice(0, PREVIEW_LENGTH),
    text: message.body,
    marks: { ...DEFAULT_MARKS, ...DEMO_MARKS[message.id] },
  }
}

function createDemoProvider({ now = () => new Date() }: Dependencies = {}): Mail.Provider {
  const mailboxes = new Map<string, DemoMailbox>()
  /** Numbers the sent messages, so their ids are unique. */
  let sentCount = 0

  function mailbox(accountId: string): DemoMailbox {
    let found = mailboxes.get(accountId)
    if (!found) {
      found = {
        // Provider-local threads: the inbox adds the account
        threads: createInboxFixtures(now()).map(({ thread }) => ({
          id: thread.id,
          subject: thread.subject,
          messages: thread.messages,
        })),
        readState: new Map(),
      }
      mailboxes.set(accountId, found)
    }
    return found
  }

  function withReadState(thread: Mail.Thread, demo: DemoMailbox): Mail.Thread {
    function current(message: Inbox.Message): Inbox.Message {
      const read = demo.readState.get(message.id)
      return read === undefined ? message : { ...message, unread: !read }
    }
    const [first, ...rest] = thread.messages
    return { ...thread, messages: [current(first), ...rest.map(message => current(message))] }
  }

  function currentThreads(accountId: string): Mail.Thread[] {
    const demo = mailbox(accountId)
    return demo.threads.map(thread => withReadState(thread, demo))
  }

  /** The unread messages of the mailbox, newest first, received at or before `before` when given. */
  function unreadMessages(accountId: string, { limit, before }: Mail.Listing): UnreadMessage[] {
    const until = before === undefined ? Number.POSITIVE_INFINITY : Date.parse(before)
    return currentThreads(accountId)
      .flatMap(thread =>
        thread.messages
          .filter(message => message.unread && Date.parse(message.sentAt) <= until)
          .map(message => ({ message, thread })),
      )
      .toSorted((first, second) => newestFirst(first.message, second.message))
      .slice(0, limit)
  }

  function loadThreads(connection: Mail.Connection, threadIds: readonly string[]) {
    const byId = new Map(currentThreads(connection.account.id).map(thread => [thread.id, thread]))
    const loaded: Mail.LoadedThreads = { threads: [], finished: [] }
    for (const id of threadIds) {
      const thread = byId.get(id)
      if (thread?.messages.some(message => message.unread)) {
        loaded.threads.push(thread)
      } else {
        loaded.finished.push(id)
      }
    }
    return Promise.resolve(loaded)
  }

  /** The owner's own messages in the example threads, as Sent Items would hold them. */
  function listSent(connection: Mail.Connection, { limit }: { limit: number }) {
    const owner = connection.account.address
    const sent = currentThreads(connection.account.id)
      .flatMap(thread => thread.messages)
      .filter(message => participants.isSameAddress(message.from, owner))
      .toSorted(newestFirst)
      .slice(0, limit)
      .map(({ to, cc, sentAt }) => ({ to, cc, sentAt }))
    return Promise.resolve(sent)
  }

  /** Adds the mailbox owner's sent message to the thread of the message it answers, as Sent Items would. */
  function appendSent(
    connection: Mail.Connection,
    { messageId, to, cc, body }: Mail.OutgoingReply,
  ): Promise<void> {
    const demo = mailbox(connection.account.id)
    const index = demo.threads.findIndex(thread =>
      thread.messages.some(message => message.id === messageId),
    )
    const thread = demo.threads[index]
    if (!thread) {
      return Promise.reject(new MailError('unavailable', 'The demo mailbox has no such message'))
    }
    sentCount += 1
    const message: Inbox.Message = {
      id: `${messageId}-sent-${sentCount}`,
      from: connection.account.address,
      replyTo: [],
      to,
      cc,
      sentAt: now().toISOString(),
      body,
      attachments: [],
      unread: false,
    }
    demo.threads[index] = { ...thread, messages: [...thread.messages, message] }
    return Promise.resolve()
  }

  return {
    // The demo account needs no scopes
    mailScopes: [],
    listUnreadIds(connection, listing) {
      return Promise.resolve(
        unreadMessages(connection.account.id, listing).map(({ message, thread }) => ({
          id: message.id,
          threadId: thread.id,
          receivedAt: message.sentAt,
        })),
      )
    },
    listUnread(connection, listing) {
      return Promise.resolve(
        unreadMessages(connection.account.id, listing).map(entry => toEnvelope(entry)),
      )
    },
    loadThreads,
    listSent,
    setRead(connection, messageIds, read) {
      const demo = mailbox(connection.account.id)
      for (const id of messageIds) {
        demo.readState.set(id, read)
      }
      return Promise.resolve()
    },
    reply(connection, outgoingReply) {
      return appendSent(connection, outgoingReply)
    },
    forward(connection, { messageId, to, note }) {
      const forwarded = `Forwarded to ${to.map(participant => participant.name).join(', ')}.`
      const body = note.trim() ? `${note.trim()}\n\n${forwarded}` : forwarded
      return appendSent(connection, { messageId, to, cc: [], body })
    },
  }
}

export default createDemoProvider
