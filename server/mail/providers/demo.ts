import MailError from '../mail-error'
import createInboxFixtures from '#shared/data/inbox-fixtures'

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
    listUnreadThreads(connection, { limit }) {
      const demo = mailbox(connection.account.id)
      const threads = demo.threads
        .map(thread => withReadState(thread, demo))
        .filter(thread => thread.messages.some(message => message.unread))
      return Promise.resolve(threads.slice(0, limit))
    },
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
