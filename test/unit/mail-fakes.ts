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

type Provider = Mail.Provider & {
  listUnreadThreads: ReturnType<typeof vi.fn<Mail.Provider['listUnreadThreads']>>
  setRead: ReturnType<typeof vi.fn<Mail.Provider['setRead']>>
}

/** A provider that lists these threads, needs `Mail.ReadWrite`, and marks anything as read. */
function fakeProvider(threads: Mail.Thread[] = []): Provider {
  return {
    mailScopes: ['Mail.ReadWrite'],
    listUnreadThreads: vi.fn<Mail.Provider['listUnreadThreads']>(async () => threads),
    setRead: vi.fn<Mail.Provider['setRead']>(async () => undefined),
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
