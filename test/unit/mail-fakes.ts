import { vi } from 'vite-plus/test'

const MARA: Inbox.Participant = { name: 'Mara Lindqvist', email: 'mara.lindqvist@northwind.co' }

type Connection = Mail.Connection & {
  accessToken: ReturnType<typeof vi.fn<Mail.Connection['accessToken']>>
}

/** A connection whose token is `stored-token`, or `refreshed-token` when a refresh is forced. */
function fakeConnection(id = 'account-1', address: Inbox.Participant = MARA): Connection {
  return {
    account: { id, address },
    accessToken: vi.fn<Mail.Connection['accessToken']>(async options =>
      options?.force ? 'refreshed-token' : 'stored-token',
    ),
  }
}

type Spy<Name extends keyof Mail.Provider> = ReturnType<
  typeof vi.fn<Extract<Mail.Provider[Name], (...args: never[]) => unknown>>
>

type Provider = Mail.Provider & {
  listUnreadIds: Spy<'listUnreadIds'>
  listUnread: Spy<'listUnread'>
  loadThreads: Spy<'loadThreads'>
  listSent: Spy<'listSent'>
  setRead: Spy<'setRead'>
  reply: Spy<'reply'>
  forward: Spy<'forward'>
}

/** The latest unread message of each thread, as a listing names it, newest first. */
function listed(threads: readonly Mail.Thread[]): Mail.ListedMessage[] {
  return threads
    .flatMap(thread => {
      const message = thread.messages.findLast(entry => entry.unread)
      return message ? [{ id: message.id, threadId: thread.id, receivedAt: message.sentAt }] : []
    })
    .toSorted((first, second) => Date.parse(second.receivedAt) - Date.parse(first.receivedAt))
}

/**
 * A provider whose unread mail is these threads, which needs `Mail.ReadWrite` and
 * `Mail.Send`, marks anything as read, and sends anything. It lists no envelopes and
 * no sent mail unless told to.
 */
function fakeProvider(threads: Mail.Thread[] = []): Provider {
  return {
    mailScopes: ['Mail.ReadWrite', 'Mail.Send'],
    listUnreadIds: vi.fn<Mail.Provider['listUnreadIds']>(async () => listed(threads)),
    listUnread: vi.fn<Mail.Provider['listUnread']>(async () => []),
    loadThreads: vi.fn<Mail.Provider['loadThreads']>(async (_, threadIds) => {
      const byId = new Map(threads.map(thread => [thread.id, thread]))
      const found = threadIds.flatMap(id => byId.get(id) ?? [])
      return { threads: found, finished: threadIds.filter(id => !byId.has(id)) }
    }),
    listSent: vi.fn<Mail.Provider['listSent']>(async () => []),
    setRead: vi.fn<Mail.Provider['setRead']>(async () => undefined),
    reply: vi.fn<Mail.Provider['reply']>(async () => undefined),
    forward: vi.fn<Mail.Provider['forward']>(async () => undefined),
  }
}

/** A Microsoft mailbox with a fake provider listing these threads. */
function fakeMailbox(
  id: string,
  address: Inbox.Participant = MARA,
  threads: Mail.Thread[] = [],
): Mail.Mailbox & { provider: Provider; connection: Connection } {
  return {
    providerId: 'microsoft',
    provider: fakeProvider(threads),
    connection: fakeConnection(id, address),
  }
}

const mailFakes = { connection: fakeConnection, provider: fakeProvider, mailbox: fakeMailbox }

export default mailFakes
