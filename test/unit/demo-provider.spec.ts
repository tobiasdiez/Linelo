import { describe, expect, it } from 'vite-plus/test'
import createDemoProvider from '#server/mail/providers/demo'

const NOW = new Date('2026-10-12T10:30:00Z')

function connection(id: string): Mail.Connection {
  return {
    account: { id, address: { name: 'Mara Lindqvist', email: 'mara.lindqvist@northwind.co' } },
    accessToken: () => Promise.reject(new Error('The demo mailbox needs no token')),
  }
}

describe('demo mailbox', () => {
  it('serves the example threads as unread mail', async () => {
    expect.hasAssertions()
    const threads = await createDemoProvider({ now: () => NOW }).listUnreadThreads(
      connection('demo-account'),
      { limit: 2 },
    )

    // Provider-local ids: the inbox adds the account
    expect(threads.map(thread => thread.id)).toStrictEqual([
      'thread-vendor-review',
      'thread-offsite-venue',
    ])
  })

  it('keeps read state per account, so handled threads leave and undone ones return', async () => {
    expect.hasAssertions()
    const provider = createDemoProvider({ now: () => NOW })
    const mara = connection('mara')

    await provider.setRead(mara, ['vendor-review-3'], true)
    const afterHandled = await provider.listUnreadThreads(mara, { limit: 1 })
    const otherAccount = await provider.listUnreadThreads(connection('other'), { limit: 1 })
    await provider.setRead(mara, ['vendor-review-3'], false)
    const afterUndo = await provider.listUnreadThreads(mara, { limit: 1 })

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
    const [vendor] = await provider.listUnreadThreads(mara, { limit: 1 })
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
    const threads = await provider.listUnreadThreads(mara, { limit: 10 })
    const staging = threads.find(thread => thread.id === 'thread-staging')

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
