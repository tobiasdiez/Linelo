import { describe, expect, it } from 'vite-plus/test'
import calendarTime from '#shared/utils/calendar-time'
import inboxBuilders from '~/data/inbox-builders'
import indexStore from '#server/ranking/index-store'
import queue from '#server/ranking/queue'
import rankingFakes from './ranking-fakes'
import resolutions from '#server/ranking/resolutions'
import sync from '#server/ranking/sync'

const { envelope, hoursAgo, judge: fakeJudge, key, now: NOW } = rankingFakes
const FIRST_PAGE = 4
const MS_PER_MINUTE = calendarTime.MILLISECONDS_PER_MINUTE
const HOURS = { ask: 3, newer: 4, older: 5 }
const SIX = 6
/** Over 1,500 characters: a long read. */
const LONG_TEXT = 1501
const ASKS_NOTHING: Ranking.Answers = {
  asksMe: 0.1,
  automated: 0.05,
  timePressure: { score: 0, confidence: 0.9 },
}
const NEWSLETTER: Mail.Envelope['marks'] = {
  unsubscribable: true,
  importance: 'normal',
  flagged: false,
  sorting: 'other',
}

/** A judge that reads "ask" in a text as an ask, and anything else as asking nothing. */
function readingJudge() {
  return fakeJudge(input => (input.text.includes('ask') ? rankingFakes.asks : ASKS_NOTHING))
}

async function setup(unread: Mail.Envelope[], { count = 1 } = {}) {
  const { db, accountIds } = await rankingFakes.database(count)
  // The other mailboxes hold copies of the same mail, each a minute older
  const mailboxes = accountIds.map((accountId, index) =>
    rankingFakes.mailbox(accountId, {
      unread: unread.map(entry =>
        index === 0
          ? entry
          : envelope(`${entry.id}-${index}`, {
              ...entry,
              id: `${entry.id}-${index}`,
              threadId: `${entry.threadId}-${index}`,
              receivedAt: new Date(
                Date.parse(entry.receivedAt) - index * MS_PER_MINUTE,
              ).toISOString(),
            }),
      ),
    }),
  )
  let time = NOW
  const dependencies = { db, now: () => time }
  async function syncToEnd() {
    for (const mailbox of mailboxes) {
      // eslint-disable-next-line eslint/no-await-in-loop
      await sync.step(
        mailbox,
        { db, key, judge: readingJudge(), now: () => time },
        { start: false },
      )
    }
  }
  function load(request: { limit?: number; start?: boolean } = {}) {
    return queue.load(
      mailboxes,
      { limit: request.limit ?? FIRST_PAGE, start: request.start ?? false },
      dependencies,
    )
  }
  function later(ms: number) {
    time = new Date(time.getTime() + ms)
  }
  return { db, accountIds, mailboxes, syncToEnd, load, later }
}

function threadIds(response: Inbox.InboxResponse): string[] {
  return response.items.map(item => item.thread.id.slice(item.thread.accountId.length + 1))
}

describe('ranking: the queue', () => {
  it('orders conversations by their best message, newer first on ties', async () => {
    expect.hasAssertions()
    const { syncToEnd, load } = await setup([
      envelope('thanks', { threadId: 'vendor', text: 'Thanks!', receivedAt: hoursAgo(1) }),
      envelope('ask', {
        threadId: 'vendor',
        text: 'Could you ask procurement?',
        receivedAt: hoursAgo(HOURS.ask),
      }),
      envelope('older-note', {
        threadId: 'older',
        text: 'Noted.',
        receivedAt: hoursAgo(HOURS.older),
      }),
      envelope('newer-note', {
        threadId: 'newer',
        text: 'Noted.',
        receivedAt: hoursAgo(HOURS.newer),
      }),
    ])
    await syncToEnd()

    const response = await load()

    expect(threadIds(response)).toStrictEqual(['vendor', 'newer', 'older'])
    expect(response.items[0]).toMatchObject({
      whyShown: 'Reads like it asks you for an answer. Sent to you alone.',
      suggestions: [],
      // 40, alone +10, same organisation +5, recency +6, the ask +10
      tier: 'normal',
      // No suggestion, so no AI badge
      assisted: false,
    })
    expect(response).toMatchObject({ preparing: false })
  })

  it('hides resolved messages, and brings them back on Undo', async () => {
    expect.hasAssertions()
    const { db, accountIds, syncToEnd, load } = await setup([envelope('a'), envelope('b')])
    await syncToEnd()
    const [accountId = ''] = accountIds

    await resolutions.record(
      { db, now: () => NOW },
      { accountId, messageIds: ['a'], resolved: true },
    )
    const resolved = threadIds(await load())
    await resolutions.record(
      { db, now: () => NOW },
      { accountId, messageIds: ['a'], resolved: false },
    )
    const undone = threadIds(await load())

    expect(resolved).toStrictEqual(['thread-b'])
    expect(undone.toSorted()).toStrictEqual(['thread-a', 'thread-b'])
  })

  it('shows nothing that has no score yet', async () => {
    expect.hasAssertions()
    const { db, accountIds, load } = await setup([envelope('a')])
    const [accountId = ''] = accountIds
    await indexStore.addListed(db, accountId, [
      { id: 'a', threadId: 'thread-a', receivedAt: hoursAgo(1) },
    ])

    await expect(load()).resolves.toStrictEqual({ items: [], preparing: true })
  })

  it('drops a conversation read elsewhere and deletes its rows', async () => {
    expect.hasAssertions()
    const { db, accountIds, mailboxes, syncToEnd, load } = await setup([
      envelope('a'),
      envelope('b'),
    ])
    await syncToEnd()
    const [accountId = ''] = accountIds
    mailboxes[0]?.state.unread.splice(0, 1)

    const response = await load()

    expect(threadIds(response)).toStrictEqual(['thread-b'])
    await expect(indexStore.knownRows(db, accountId)).resolves.toMatchObject([{ messageId: 'b' }])
  })

  it('merges the mailboxes into one order', async () => {
    expect.hasAssertions()
    const { syncToEnd, load } = await setup(
      [
        envelope('ask', { text: 'May I ask you something?', receivedAt: hoursAgo(2) }),
        envelope('note', { text: 'Noted.', receivedAt: hoursAgo(1) }),
      ],
      { count: 2 },
    )
    await syncToEnd()

    const response = await load()

    expect(response.items.map(item => item.thread.id.split(':')[1])).toStrictEqual([
      'thread-ask',
      'thread-ask-1',
      'thread-note',
      'thread-note-1',
    ])
    expect(new Set(response.items.map(item => item.thread.accountId)).size).toBe(2)
  })
})

describe('ranking: the queue as the inbox shows it', () => {
  it('keys an item by its thread and latest unread message', async () => {
    expect.hasAssertions()
    const { accountIds, mailboxes, syncToEnd, load } = await setup([envelope('second')])
    await syncToEnd()
    const [accountId = ''] = accountIds
    mailboxes[0]?.provider.loadThreads.mockResolvedValue({
      threads: [
        {
          id: 'thread-second',
          subject: 'Vendor review',
          messages: [
            inboxBuilders.message({ id: 'first', unread: false }),
            inboxBuilders.message({ id: 'second' }),
            inboxBuilders.message({ id: 'third', from: inboxBuilders.mailboxOwner, unread: false }),
          ],
        },
      ],
      finished: [],
    })

    const { items } = await load()

    expect(items.map(item => [item.key, item.thread.accountId])).toStrictEqual([
      [`${accountId}:thread-second:second`, accountId],
    ])
  })

  it('tells threads of different accounts apart, even with the same provider id', async () => {
    expect.hasAssertions()
    const { accountIds, syncToEnd, load } = await setup([envelope('same', { threadId: 'same' })], {
      count: 2,
    })
    await syncToEnd()

    const { items } = await load()

    expect(items.map(item => [item.thread.id, item.thread.accountId])).toStrictEqual([
      [`${accountIds[0]}:same`, accountIds[0]],
      [`${accountIds[1]}:same-1`, accountIds[1]],
    ])
  })

  it('asks the index again when every conversation it named was read elsewhere', async () => {
    expect.hasAssertions()
    const unread = Array.from({ length: SIX }, (_, index) =>
      envelope(`m${index}`, { receivedAt: hoursAgo(index + 1) }),
    )
    const { mailboxes, syncToEnd, load, later } = await setup(unread)
    await syncToEnd()
    later(2 * MS_PER_MINUTE)
    // The newest four were read in Outlook since
    mailboxes[0]?.state.unread.splice(0, FIRST_PAGE)

    const response = await load({ start: true })

    expect({ preparing: response.preparing, threads: threadIds(response) }).toStrictEqual({
      preparing: false,
      threads: ['thread-m4', 'thread-m5'],
    })
  })
})

describe('ranking: long reads', () => {
  it('lets a lighter message of the same tier in after two heavy ones', async () => {
    expect.hasAssertions()
    const long = 'x'.repeat(LONG_TEXT)
    const { syncToEnd, load } = await setup([
      envelope('long-1', { text: long, receivedAt: hoursAgo(1) }),
      envelope('long-2', { text: long, receivedAt: hoursAgo(2) }),
      envelope('long-3', { text: long, receivedAt: hoursAgo(HOURS.ask) }),
      envelope('short', { receivedAt: hoursAgo(HOURS.newer) }),
    ])
    await syncToEnd()

    const response = await load()

    expect(threadIds(response)).toStrictEqual([
      'thread-long-1',
      'thread-long-2',
      'thread-short',
      'thread-long-3',
    ])
  })
})

describe('ranking: whether the queue is worth showing', () => {
  it('prepares at the start of a session when the index is empty', async () => {
    expect.hasAssertions()
    const { mailboxes, load } = await setup([envelope('a')])

    await expect(load({ start: true })).resolves.toStrictEqual({ items: [], preparing: true })
    expect(mailboxes[0]?.provider.loadThreads).not.toHaveBeenCalled()
  })

  it('prepares at the start of a session when only the lowest tier is left', async () => {
    expect.hasAssertions()
    const { syncToEnd, load, later } = await setup([envelope('news', { marks: NEWSLETTER })])
    await syncToEnd()
    later(2 * MS_PER_MINUTE)

    const start = await load({ start: true })
    const refill = await load()

    expect(start).toStrictEqual({ items: [], preparing: true })
    // Without `start`, what is there is shown
    expect(refill.items.map(item => item.tier)).toStrictEqual(['low'])
    expect(refill.items[0]?.suggestions).toStrictEqual([
      { kind: 'handled', id: 'handled', label: 'Nothing to act on' },
    ])
  })

  it('shows the lowest tier, or an empty inbox, when a sync just finished', async () => {
    expect.hasAssertions()
    const { mailboxes, syncToEnd, load } = await setup([envelope('news', { marks: NEWSLETTER })])
    await syncToEnd()

    const low = await load({ start: true })
    mailboxes[0]?.state.unread.splice(0, 1)
    const empty = await load({ start: true })

    expect(low).toMatchObject({ preparing: false, items: [{ tier: 'low' }] })
    expect(empty).toStrictEqual({ items: [], preparing: false })
  })

  it('counts as freshly synced only when every mailbox is', async () => {
    expect.hasAssertions()
    const { db, accountIds, mailboxes, load } = await setup(
      [envelope('news', { marks: NEWSLETTER })],
      {
        count: 2,
      },
    )
    const [first] = mailboxes
    if (first) {
      await sync.step(first, { db, key, judge: readingJudge(), now: () => NOW }, { start: false })
    }

    const response = await load({ start: true })

    // The second mailbox never synced: what the index holds is not yet the inbox
    expect({ accounts: accountIds.length, response }).toStrictEqual({
      accounts: 2,
      response: { items: [], preparing: true },
    })
  })

  it('does not prepare without `start` while there is something to show', async () => {
    expect.hasAssertions()
    const { syncToEnd, load, later } = await setup([envelope('a')])
    await syncToEnd()
    later(2 * MS_PER_MINUTE)

    const response = await load()

    expect(response).toMatchObject({ preparing: false, items: [{ tier: 'normal' }] })
  })

  it('asks to sign in again without a mailbox', async () => {
    expect.hasAssertions()
    const { db } = await rankingFakes.database()

    await expect(
      queue.load([], { limit: FIRST_PAGE, start: true }, { db, now: () => NOW }),
    ).rejects.toMatchObject({ kind: 'reconnect' })
  })
})
