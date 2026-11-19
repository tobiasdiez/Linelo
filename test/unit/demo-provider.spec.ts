import { describe, expect, it } from 'vite-plus/test'
import createDemoProvider from '#server/mail/providers/demo'

const NOW = new Date('2026-10-12T10:30:00Z')
/** Graph's length of a preview, which the demo mailbox imitates. */
const PREVIEW_LENGTH = 255

function connection(id: string): Mail.Connection {
  return {
    account: { id, address: { name: 'Mara Lindqvist', email: 'mara.lindqvist@northwind.co' } },
    accessToken: () => Promise.reject(new Error('The demo mailbox needs no token')),
  }
}

/** The demo threads in the order of their newest unread message, as the newest-first inbox showed them. */
const NEWEST_FIRST = [
  'thread-vendor-review',
  'thread-offsite-venue',
  'thread-staging',
  'thread-migration-plan',
  'thread-newsletter',
  'thread-delivery',
  'thread-scan',
]

async function unreadThreads(provider: Mail.Provider, mailbox: Mail.Connection, limit: number) {
  const listed = await provider.listUnreadIds(mailbox, { limit })
  const { threads } = await provider.loadThreads(
    mailbox,
    listed.map(entry => entry.threadId),
  )
  return threads
}

describe('demo mailbox', () => {
  it('lists the example messages as unread mail, newest first', async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })

    const listed = await provider.listUnreadIds(connection('demo-account'), { limit: 10 })

    // Provider-local ids: the inbox adds the account
    expect(listed.map(entry => entry.threadId)).toStrictEqual(NEWEST_FIRST)
    expect(listed[0]).toStrictEqual({
      id: 'vendor-review-3',
      threadId: 'thread-vendor-review',
      receivedAt: '2026-10-12T09:43:00.000Z',
    })
  })

  it('continues a judge page by time, and stops every listing at its limit', async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })

    const listed = await provider.listUnread(connection('demo-account'), {
      limit: 2,
      before: '2026-10-12T05:30:00.000Z',
    })
    const ids = await provider.listUnreadIds(connection('demo-account'), { limit: 2 })

    expect(listed.map(entry => entry.id)).toStrictEqual(['staging-1', 'migration-4'])
    expect(ids.map(entry => entry.id)).toStrictEqual(['vendor-review-3', 'offsite-3'])
  })

  it('lists envelopes with their texts and the marks Outlook would set', async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })

    const envelopes = await provider.listUnread(connection('demo-account'), { limit: 10 })
    const newsletter = envelopes.find(entry => entry.id === 'newsletter-1')

    expect(envelopes[0]).toMatchObject({
      id: 'vendor-review-3',
      threadId: 'thread-vendor-review',
      subject: 'Vendor review: can we move sign-off to Thursday?',
      from: { name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' },
      marks: { unsubscribable: false, importance: 'normal', flagged: false, sorting: 'focused' },
    })
    expect(envelopes[0]?.text).toMatch(/^Hi Mara,\n\nQuick follow-up/)
    expect(envelopes[0]?.preview).toHaveLength(PREVIEW_LENGTH)
    expect(newsletter?.marks).toStrictEqual({
      unsubscribable: true,
      importance: 'normal',
      flagged: false,
      sorting: 'other',
    })
  })

  it("lists whom the owner's own messages went to, newest first", async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })

    const sent = await provider.listSent(connection('demo-account'), { limit: 2 })

    expect(sent.map(entry => entry.to.map(participant => participant.name))).toStrictEqual([
      ['Lena Hartmann'],
      ['Priya Nair'],
    ])
    expect(sent[0]?.cc.map(participant => participant.name)).toStrictEqual([
      'Priya Nair',
      'Marco Bellini',
    ])
  })

  it('loads threads in the order asked for, and reports those with nothing unread as finished', async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })
    const mara = connection('mara')
    await provider.setRead(mara, ['staging-1'], true)

    const loaded = await provider.loadThreads(mara, ['thread-scan', 'thread-staging', 'gone'])

    expect(loaded.threads.map(thread => thread.id)).toStrictEqual(['thread-scan'])
    expect(loaded.finished).toStrictEqual(['thread-staging', 'gone'])
  })

  it('keeps read state per account, so handled threads leave and undone ones return', async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })
    const mara = connection('mara')

    await provider.setRead(mara, ['vendor-review-3'], true)
    const afterHandled = await unreadThreads(provider, mara, 1)
    const otherAccount = await unreadThreads(provider, connection('other'), 1)
    await provider.setRead(mara, ['vendor-review-3'], false)
    const afterUndo = await unreadThreads(provider, mara, 1)

    expect(afterHandled[0]?.subject).toBe('Offsite: book the Lisbon venue?')
    expect(otherAccount[0]?.subject).toBe('Vendor review: can we move sign-off to Thursday?')
    expect(afterUndo[0]?.subject).toBe('Vendor review: can we move sign-off to Thursday?')
  })

  it("adds the owner's reply to the thread, which then shows it once it is unread again", async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })
    const mara = connection('mara')
    const lena = { name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' }

    await provider.reply(mara, {
      messageId: 'vendor-review-3',
      body: 'Thursday works.',
      to: [lena],
      cc: [],
    })
    const [vendor] = await unreadThreads(provider, mara, 1)
    const messages = vendor?.messages ?? []

    expect(messages.map(message => message.id)).toStrictEqual([
      'vendor-review-1',
      'vendor-review-2',
      'vendor-review-3',
      expect.stringMatching(/^vendor-review-3-sent-/),
    ])
    expect(messages.at(-1)).toMatchObject({
      from: mara.account.address,
      to: [lena],
      cc: [],
      body: 'Thursday works.',
      sentAt: NOW.toISOString(),
      unread: false,
    })
  })

  it('adds a forward with its note and who it went to, and refuses an unknown message', async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })
    const mara = connection('mara')
    const jonas = { name: 'Jonas Weber', email: 'jonas.weber@northwind.co' }

    await provider.forward(mara, { messageId: 'staging-1', to: [jonas], note: '' })
    await provider.forward(mara, { messageId: 'staging-1', to: [jonas], note: ' Have a look. ' })
    const {
      threads: [staging],
    } = await provider.loadThreads(mara, ['thread-staging'])

    expect(staging?.messages.slice(1).map(message => [message.body, message.to])).toStrictEqual([
      ['Forwarded to Jonas Weber.', [jonas]],
      ['Have a look.\n\nForwarded to Jonas Weber.', [jonas]],
    ])
    const ids = staging?.messages.map(message => message.id) ?? []
    expect(new Set(ids).size).toBe(ids.length)
    await expect(
      provider.forward(mara, { messageId: 'gone', to: [jonas], note: '' }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
