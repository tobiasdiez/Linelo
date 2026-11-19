import * as schema from '#server/db/schema'
import { describe, expect, it, vi } from 'vite-plus/test'
import calendarTime from '#shared/utils/calendar-time'
import { eq } from 'drizzle-orm'
import indexStore from '#server/ranking/index-store'
import rankingFakes from './ranking-fakes'
import sync from '#server/ranking/sync'

const { envelope, judge: fakeJudge, key, none: NONE, now: NOW } = rankingFakes
const MS_PER_MINUTE = calendarTime.MILLISECONDS_PER_MINUTE
const JUDGE_PAGE = 50
const MAX_LISTED = 20_000
const SENT_SCAN = 500
/** What a provider may answer instead of a page of 50 when it has more. */
const SHORT = 30
const TOKENS = 640
const MANY = 60
const THREE = 3
const TWO_PAGES_AND_SOME = 120
const MINUTES = { soon: 5, later: 6, notYet: 0.5, listingAge: 10, graceOver: 3, inGrace: 1 }

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * MS_PER_MINUTE).toISOString()
}

/** `count` unread messages, one a minute, the newest first. */
function envelopes(count: number, prefix = 'm'): Mail.Envelope[] {
  return Array.from({ length: count }, (_, index) =>
    envelope(`${prefix}${index}`, { receivedAt: minutesAgo(index + 1) }),
  )
}

/** A clock that only moves when told to. */
function clock(start: Date = NOW) {
  let time = start.getTime()
  return {
    now: () => new Date(time),
    advance(ms: number) {
      time += ms
    },
  }
}

async function setup({
  unread = envelopes(1),
  judge = fakeJudge(),
}: { unread?: Mail.Envelope[]; judge?: Ranking.Judge } = {}) {
  const { db, accountIds } = await rankingFakes.database()
  const [accountId = ''] = accountIds
  const mailbox = rankingFakes.mailbox(accountId, { unread })
  const time = clock()
  const dependencies = { db, key, judge, now: time.now }
  function rows() {
    return db
      .select()
      .from(schema.unreadMessages)
      .where(eq(schema.unreadMessages.accountId, accountId))
      .orderBy(schema.unreadMessages.messageId)
  }
  return { db, accountId, mailbox, time, dependencies, rows }
}

describe('ranking: the starting batch', () => {
  it('judges the newest 50 unread messages and ends, without listing', async () => {
    expect.hasAssertions()
    const judge = fakeJudge()
    const { mailbox, dependencies, rows } = await setup({ unread: envelopes(MANY), judge })

    await expect(sync.step(mailbox, dependencies, { start: true })).resolves.toBe('more')

    const judged = await rows()
    const ids = new Set(envelopes(JUDGE_PAGE).map(entry => entry.id))
    expect({
      count: judged.length,
      newest: judged.every(row => ids.has(row.messageId)),
      judged: judged.every(row => row.judge === 'fake/1' && row.score !== null),
    }).toStrictEqual({ count: JUDGE_PAGE, newest: true, judged: true })
    expect(mailbox.provider.listUnread).toHaveBeenCalledExactlyOnceWith(mailbox.connection, {
      limit: JUDGE_PAGE,
    })
    expect(mailbox.provider.listUnreadIds).not.toHaveBeenCalled()
  })

  it('scans Sent Items only when there is no profile yet', async () => {
    expect.hasAssertions()
    const { mailbox, dependencies } = await setup()

    await sync.step(mailbox, dependencies, { start: true })
    await sync.step(mailbox, dependencies, { start: false })

    expect(mailbox.provider.listSent).toHaveBeenCalledExactlyOnceWith(mailbox.connection, {
      limit: SENT_SCAN,
    })
  })
})

describe('ranking: syncing', () => {
  it('lists, judges and finishes on a first sync', async () => {
    expect.hasAssertions()
    const judge = fakeJudge()
    const { db, accountId, mailbox, dependencies, rows } = await setup({
      unread: envelopes(THREE),
      judge,
    })

    await expect(sync.step(mailbox, dependencies, { start: false })).resolves.toBe('done')

    // All ids in one call: the adapter pages and decides where the inbox ends
    expect(mailbox.provider.listUnreadIds).toHaveBeenCalledExactlyOnceWith(mailbox.connection, {
      limit: MAX_LISTED,
    })
    expect(judge.judge).toHaveBeenCalledTimes(THREE)
    const judged = await rows()
    expect(judged.map(row => [row.messageId, row.score === null])).toStrictEqual([
      ['m0', false],
      ['m1', false],
      ['m2', false],
    ])
    await expect(indexStore.profile(db, accountId)).resolves.toMatchObject({
      syncedAt: NOW,
      listedAt: NOW,
      syncingUntil: NONE,
    })
  })

  it('resumes where a step stopped, and judges every message once', async () => {
    expect.hasAssertions()
    const time = clock()
    // Each answer takes 1.2 s of the step's budget of a minute: one page per step
    const judge = fakeJudge(() => {
      time.advance(MS_PER_MINUTE / JUDGE_PAGE + 1)
      return rankingFakes.asks
    })
    const { mailbox, dependencies } = await setup({ unread: envelopes(TWO_PAGES_AND_SOME), judge })
    const resumable = {
      ...dependencies,
      now: time.now,
      limits: {
        budgetMs: MS_PER_MINUTE,
        pageReserveMs: 0,
        listEveryMs: MINUTES.listingAge * MS_PER_MINUTE,
      },
    }

    const results = [
      await sync.step(mailbox, resumable, { start: false }),
      await sync.step(mailbox, resumable, { start: false }),
      await sync.step(mailbox, resumable, { start: false }),
    ]

    expect(results).toStrictEqual(['more', 'more', 'done'])
    expect(judge.judge).toHaveBeenCalledTimes(TWO_PAGES_AND_SOME)
    expect(mailbox.provider.listUnreadIds).toHaveBeenCalledExactlyOnceWith(mailbox.connection, {
      limit: MAX_LISTED,
    })
  })

  it('adds unknown messages and removes those no longer unread', async () => {
    expect.hasAssertions()
    const judge = fakeJudge()
    const { mailbox, dependencies, rows, time } = await setup({ unread: envelopes(THREE), judge })
    await sync.step(mailbox, dependencies, { start: false })
    // Read in Outlook, and two new ones
    mailbox.state.unread.splice(1, 1)
    mailbox.state.unread.push(...envelopes(2, 'new'))
    time.advance(2 * MS_PER_MINUTE)

    await expect(sync.step(mailbox, dependencies, { start: false })).resolves.toBe('done')

    const found = await rows()
    expect(found.map(row => row.messageId)).toStrictEqual(['m0', 'm2', 'new0', 'new1'])
    expect(judge.judge).toHaveBeenCalledTimes(THREE + 2)
  })

  it('asks again for answers of another judge, and deletes a row missing from its page', async () => {
    expect.hasAssertions()
    const { mailbox, dependencies, rows, time } = await setup({ unread: envelopes(THREE) })
    await sync.step(mailbox, dependencies, { start: false })
    // Read in Outlook since; the listing is too recent to notice
    mailbox.state.unread.splice(1, 1)
    time.advance(MINUTES.notYet * MS_PER_MINUTE)
    const newJudge = fakeJudge(undefined, 'fake/2')

    await expect(
      sync.step(mailbox, { ...dependencies, judge: newJudge }, { start: false }),
    ).resolves.toBe('done')

    expect(newJudge.judge).toHaveBeenCalledTimes(2)
    expect(mailbox.provider.listUnreadIds).toHaveBeenCalledExactlyOnceWith(mailbox.connection, {
      limit: MAX_LISTED,
    })
    const found = await rows()
    expect(found.map(row => [row.messageId, row.judge])).toStrictEqual([
      ['m0', 'fake/2'],
      ['m2', 'fake/2'],
    ])
  })

  it('keeps the rules’ score when the judge fails, finishes, and asks again ten minutes later', async () => {
    expect.hasAssertions()
    const failing = fakeJudge(() => {
      throw new Error('Jev is down')
    })
    const { db, accountId, mailbox, dependencies, rows, time } = await setup({ judge: failing })

    const first = await sync.step(mailbox, dependencies, { start: false })
    const [row] = await rows()
    time.advance(MINUTES.soon * MS_PER_MINUTE)
    const soon = await sync.step(mailbox, dependencies, { start: false })
    time.advance(MINUTES.later * MS_PER_MINUTE)
    const later = await sync.step(mailbox, dependencies, { start: false })

    expect([first, soon, later]).toStrictEqual(['done', 'done', 'done'])
    expect(row).toMatchObject({ answers: NONE, judge: NONE, triedAt: NOW })
    expect(row?.score).toBeGreaterThan(0)
    expect(failing.judge).toHaveBeenCalledTimes(2)
    await expect(indexStore.profile(db, accountId)).resolves.toMatchObject({
      syncedAt: time.now(),
    })
  })

  it('marks a call cut off by the budget as tried, and leaves calls it never started for the next step', async () => {
    expect.hasAssertions()
    const budget = new AbortController()
    const judge = fakeJudge()
    // The first call runs when the budget ends; it answers only by failing, as a fetch does
    judge.judge.mockImplementationOnce(
      (_, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(signal.reason)
          })
          budget.abort()
        }),
    )
    const { mailbox, dependencies, rows } = await setup({ unread: envelopes(THREE), judge })
    const oneAtATime = { ...dependencies, limits: { judgeConcurrency: 1 } }

    const cutOff = await sync.step(
      mailbox,
      { ...oneAtATime, signal: budget.signal },
      { start: false },
    )
    const afterCut = await rows()
    const next = await sync.step(mailbox, oneAtATime, { start: false })

    expect([cutOff, next]).toStrictEqual(['more', 'done'])
    expect(afterCut.map(row => [row.messageId, row.answers === NONE, row.triedAt])).toStrictEqual([
      ['m0', true, NOW],
      ['m1', true, NONE],
      ['m2', true, NONE],
    ])
    // Facts and the rules' score were written for all three
    expect(afterCut.filter(row => row.score !== NONE)).toHaveLength(THREE)
    expect(judge.judge).toHaveBeenCalledTimes(THREE)
  })

  it('keeps every unread row when a provider answers pages shorter than asked for', async () => {
    expect.hasAssertions()
    const { mailbox, dependencies, rows } = await setup({ unread: envelopes(TWO_PAGES_AND_SOME) })
    const full = mailbox.provider.listUnread.getMockImplementation()
    mailbox.provider.listUnread.mockImplementation(async (connection, listing) => {
      const page = (await full?.(connection, listing)) ?? []
      return page.slice(0, SHORT)
    })

    const steps = [
      await sync.step(mailbox, dependencies, { start: true }),
      await sync.step(mailbox, dependencies, { start: false }),
    ]

    const found = await rows()
    expect({
      steps,
      rows: found.length,
      judged: found.filter(row => row.judge).length,
    }).toStrictEqual({
      steps: ['more', 'done'],
      rows: TWO_PAGES_AND_SOME,
      judged: TWO_PAGES_AND_SOME,
    })
  })

  it('keeps every row when a starting batch reads a short page from an index that is full', async () => {
    expect.hasAssertions()
    const { mailbox, dependencies, rows } = await setup({ unread: envelopes(TWO_PAGES_AND_SOME) })
    await sync.step(mailbox, dependencies, { start: false })
    mailbox.provider.listUnread.mockResolvedValue(envelopes(SHORT))

    await sync.step(mailbox, dependencies, { start: true })

    await expect(rows()).resolves.toHaveLength(TWO_PAGES_AND_SOME)
  })

  it('brings back a resolved message that the mailbox lists as unread again after the grace period', async () => {
    expect.hasAssertions()
    const { db, accountId, mailbox, dependencies, rows, time } = await setup({
      unread: envelopes(2),
    })
    await sync.step(mailbox, dependencies, { start: false })
    // Handled in Linelo, but unread in the mailbox (marked unread again in Outlook)
    await indexStore.setResolved(db, accountId, { ids: ['m0', 'm1'], resolvedAt: time.now() })
    await indexStore.setResolved(db, accountId, {
      ids: ['m1'],
      resolvedAt: new Date(
        time.now().getTime() + (MINUTES.graceOver - MINUTES.inGrace) * MS_PER_MINUTE,
      ),
    })
    time.advance(MINUTES.graceOver * MS_PER_MINUTE)

    await sync.step(mailbox, dependencies, { start: false })

    const found = await rows()
    // Resolved three minutes ago (m0) and one minute ago (m1): Graph may not show the second as read yet
    expect(found.map(row => [row.messageId, row.resolvedAt === NONE])).toStrictEqual([
      ['m0', true],
      ['m1', false],
    ])
  })

  it('logs once per step how many messages the judge answered for, and the tokens it read', async () => {
    expect.hasAssertions()
    const judge = fakeJudge()
    judge.judge.mockResolvedValue({ answers: rankingFakes.asks, inputTokens: TOKENS })
    const log = vi.fn<(message: string, details: unknown) => void>()
    const { mailbox, dependencies } = await setup({ unread: envelopes(THREE), judge })

    await sync.step(mailbox, { ...dependencies, log }, { start: false })
    await sync.step(mailbox, { ...dependencies, log }, { start: false })

    expect(log).toHaveBeenCalledExactlyOnceWith('Judged unread mail', {
      judge: 'fake/1',
      messages: THREE,
      inputTokens: THREE * TOKENS,
    })
  })

  it('takes a message out of the index when its judge page cannot reach it, and says so', async () => {
    expect.hasAssertions()
    const warn = vi.spyOn(console, 'warn').mockReturnValue()
    // More messages of one second than a page holds: here, two of the same second and a page of one
    const sameSecond = minutesAgo(1)
    const { mailbox, dependencies, rows } = await setup({
      unread: [
        envelope('a', { receivedAt: sameSecond }),
        envelope('b', { receivedAt: sameSecond }),
      ],
    })
    const pageOfOne = { ...dependencies, limits: { judgePage: 1 } }

    await expect(sync.step(mailbox, pageOfOne, { start: false })).resolves.toBe('done')

    await expect(rows()).resolves.toHaveLength(1)
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'A judge page could not reach a message; it leaves the index for now',
    )
  })
})

describe('ranking: one rule for what a row needs', () => {
  it('is the same in the database as in code', async () => {
    expect.hasAssertions()
    const { db, accountId } = await setup()
    const long = new Date(NOW.getTime() - MINUTES.listingAge * 2 * MS_PER_MINUTE)
    const facts: Ranking.Facts = {
      senderKey: 'k',
      sameOrganisation: false,
      addressing: 'alone',
      flagged: false,
      importance: 'normal',
      automatedAddress: false,
      timeWords: 'none',
    }
    const answers = rankingFakes.asks
    const states = {
      listed: {},
      judged: { facts, answers, judge: 'fake/1', score: 1 },
      byAnotherJudge: { facts, answers, judge: 'fake/0', score: 1 },
      triedLately: { facts, triedAt: NOW, score: 1 },
      triedLongAgo: { facts, triedAt: long, score: 1 },
      forgotten: { answers, judge: 'fake/1' },
      resolved: { resolvedAt: NOW },
    }
    await db
      .insert(schema.unreadMessages)
      .values(
        Object.entries(states).map(([messageId, state]) =>
          Object.assign(state, { accountId, messageId, threadId: messageId, receivedAt: NOW }),
        ),
      )
    const terms = [
      {
        judgeId: 'fake/1',
        triedBefore: new Date(NOW.getTime() - MINUTES.listingAge * MS_PER_MINUTE),
      },
      { judgeId: undefined, triedBefore: NOW },
    ]

    for (const term of terms) {
      // eslint-disable-next-line eslint/no-await-in-loop
      const all = await db.select().from(schema.unreadMessages)
      // eslint-disable-next-line eslint/no-await-in-loop
      const inDatabase = await db
        .select({ messageId: schema.unreadMessages.messageId })
        .from(schema.unreadMessages)
        .where(indexStore.needsWork(term))
      expect(
        all
          .filter(row => indexStore.workFor(row, term) !== 'skip')
          .map(row => row.messageId)
          .toSorted(),
      ).toStrictEqual(inDatabase.map(row => row.messageId).toSorted())
    }
  })
})

describe('ranking: one step at a time per mailbox', () => {
  it('answers busy while another step holds the lease, and goes ahead once it ran out', async () => {
    expect.hasAssertions()
    const gate = Promise.withResolvers<Ranking.Answers>()
    const slow = fakeJudge(() => gate.promise)
    const { db, accountId, mailbox, dependencies, time } = await setup({ judge: slow })

    const first = sync.step(mailbox, dependencies, { start: false })
    await expect.poll(() => slow.judge.mock.calls.length).toBe(1)
    const second = await sync.step(mailbox, dependencies, { start: false })
    gate.resolve(rankingFakes.asks)
    await expect(first).resolves.toBe('done')
    // A step that never gave its lease back (a crashed server)
    await indexStore.claimLease(db, accountId, {
      now: time.now(),
      until: new Date(time.now().getTime() + MS_PER_MINUTE),
    })
    const blocked = await sync.step(mailbox, dependencies, { start: false })
    time.advance(MS_PER_MINUTE + 1)
    const admitted = await sync.step(mailbox, dependencies, { start: false })

    expect([second, blocked, admitted]).toStrictEqual(['busy', 'busy', 'done'])
  })

  it('steps every mailbox of the user, and says whether all are done or one was busy', async () => {
    expect.hasAssertions()
    const { db, accountIds } = await rankingFakes.database(2)
    const [personal = '', office = ''] = accountIds
    const mailboxes = [
      rankingFakes.mailbox(personal, { unread: envelopes(1) }),
      rankingFakes.mailbox(office, { unread: envelopes(1, 'o') }),
    ]
    const dependencies = { db, key, now: () => NOW, judgeFor: () => fakeJudge() }

    const done = await sync.stepAll(mailboxes, dependencies, { start: false })
    await indexStore.claimLease(db, office, {
      now: NOW,
      until: new Date(NOW.getTime() + MS_PER_MINUTE),
    })
    const busy = await sync.stepAll(mailboxes, dependencies, { start: false })

    expect([done, busy]).toStrictEqual([{ status: 'done' }, { status: 'busy' }])
    await expect(sync.stepAll([], dependencies, { start: false })).rejects.toMatchObject({
      kind: 'reconnect',
    })
  })

  it('gives the lease back when a call to the mailbox fails', async () => {
    expect.hasAssertions()
    const { mailbox, dependencies } = await setup()
    mailbox.provider.listUnreadIds.mockRejectedValueOnce(new Error('Graph is down'))

    await expect(sync.step(mailbox, dependencies, { start: false })).rejects.toThrow(
      'Graph is down',
    )
    await expect(sync.step(mailbox, dependencies, { start: false })).resolves.toBe('done')
  })

  it('lets every mailbox finish its step before passing on a failure', async () => {
    expect.hasAssertions()
    const { db, accountIds } = await rankingFakes.database(2)
    const [personal = '', office = ''] = accountIds
    const failing = rankingFakes.mailbox(personal, { unread: envelopes(1) })
    failing.provider.listSent.mockRejectedValue(new Error('Graph is down'))
    const working = rankingFakes.mailbox(office, { unread: envelopes(1, 'o') })
    const dependencies = { db, key, now: () => NOW, judgeFor: () => fakeJudge() }

    await expect(sync.stepAll([failing, working], dependencies, { start: false })).rejects.toThrow(
      'Graph is down',
    )
    await expect(indexStore.profile(db, office)).resolves.toMatchObject({ syncedAt: NOW })
  })
})
