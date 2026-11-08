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
})
