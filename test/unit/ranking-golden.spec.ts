import * as schema from '#server/db/schema'
import { describe, expect, it } from 'vite-plus/test'
import createDemoJudge from '#server/ranking/judges/demo'
import createDemoProvider from '#server/mail/providers/demo'
import createInboxFixtures from '#shared/data/inbox-fixtures'
import mailFakes from './mail-fakes'
import mailboxOwner from '#shared/data/mailbox-owner'
import queue from '#server/ranking/queue'
import rankingFakes from './ranking-fakes'
import sync from '#server/ranking/sync'

/*
 * The golden test: the order of the seven demo threads, by the rules alone and with the
 * demo judge, which gives the answers Jev gave about them. Update it on purpose whenever
 * a weight changes; `pnpm ranking:demo-answers` asks Jev again and updates the second
 * order here.
 */

const NOW = new Date('2026-10-12T10:30:00Z')
const ALL = 20

/** The demo mailbox, synced to the end with this judge; the queue with each thread's stored score. */
async function rankDemo(judge: Ranking.Judge | undefined) {
  const { db, accountIds } = await rankingFakes.database()
  const [accountId = ''] = accountIds
  const mailbox: Mail.Mailbox = {
    providerId: 'demo',
    provider: createDemoProvider({ now: () => NOW }),
    connection: mailFakes.connection(accountId, mailboxOwner),
  }
  const result = await sync.step(
    mailbox,
    { db, key: rankingFakes.key, judge, now: () => NOW },
    { start: false },
  )
  const { items } = await queue.load([mailbox], { limit: ALL, start: true }, { db, now: () => NOW })
  const rows = await db.select().from(schema.unreadMessages)
  const scores = new Map(rows.map(row => [row.threadId, Math.round(row.score ?? Number.NaN)]))
  return {
    result,
    ranked: items.map(item => {
      const threadId = item.thread.id.slice(accountId.length + 1)
      return { thread: threadId, score: scores.get(threadId), tier: item.tier }
    }),
    items,
  }
}

describe('ranking: the demo threads (golden)', () => {
  it('are ordered by the rules alone', async () => {
    expect.hasAssertions()

    const { result, ranked } = await rankDemo(undefined)

    expect(result).toBe('done')
    expect(ranked).toStrictEqual([
      { thread: 'thread-migration-plan', score: 91, tier: 'high' },
      { thread: 'thread-vendor-review', score: 83, tier: 'high' },
      { thread: 'thread-offsite-venue', score: 79, tier: 'high' },
      { thread: 'thread-staging', score: 71, tier: 'normal' },
      { thread: 'thread-scan', score: 60, tier: 'normal' },
      { thread: 'thread-delivery', score: 42, tier: 'normal' },
      { thread: 'thread-newsletter', score: 15, tier: 'low' },
    ])
  })

  it("are ordered with the demo judge, by Jev's answers", async () => {
    expect.hasAssertions()

    const { ranked } = await rankDemo(createDemoJudge())

    expect(ranked.map(({ thread, score, tier }) => `${thread}: ${score}, ${tier}`))
      .toMatchInlineSnapshot(`
        [
          "thread-vendor-review: 100, high",
          "thread-migration-plan: 100, high",
          "thread-offsite-venue: 94, high",
          "thread-staging: 60, normal",
          "thread-scan: 40, normal",
          "thread-delivery: 26, low",
          "thread-newsletter: 0, low",
        ]
      `)
  })

  it('explain themselves as the example threads say, with the suggestion where it belongs', async () => {
    expect.hasAssertions()
    const fixtures = new Map(createInboxFixtures(NOW).map(item => [item.thread.id, item]))
    const handled = 'Nothing to act on'

    const { items } = await rankDemo(createDemoJudge())

    for (const item of items) {
      const fixture = fixtures.get(item.thread.id.split(':')[1] ?? '')
      // The example threads also show suggestions only a future model can make (reply drafts)
      const onlyHandled = fixture?.suggestions.every(suggestion => suggestion.label === handled)
      expect({
        thread: fixture?.thread.id,
        whyShown: item.whyShown,
        tier: item.tier,
        handled: item.suggestions.map(suggestion => suggestion.label),
        ...(onlyHandled ? { assisted: item.assisted } : {}),
      }).toStrictEqual({
        thread: fixture?.thread.id,
        whyShown: fixture?.whyShown,
        tier: fixture?.tier,
        handled: fixture?.suggestions
          .filter(suggestion => suggestion.label === handled)
          .map(suggestion => suggestion.label),
        ...(onlyHandled ? { assisted: fixture?.assisted } : {}),
      })
    }
  })
})
