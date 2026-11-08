import createInboxFixtures from '#shared/data/inbox-fixtures'

/*
 * Development only: the example threads behind the same interface as a real
 * mailbox, so the whole flow runs without Microsoft credentials. Read state
 * lives in memory and resets with the dev server.
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
  }
}

export default createDemoProvider
