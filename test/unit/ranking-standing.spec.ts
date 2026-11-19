import * as schema from '#server/db/schema'
import { describe, expect, it } from 'vite-plus/test'
import calendarTime from '#shared/utils/calendar-time'
import createAddressKey from '#server/ranking/address-key'
import { eq } from 'drizzle-orm'
import facts from '#server/ranking/facts'
import indexStore from '#server/ranking/index-store'
import mailboxOwner from '#shared/data/mailbox-owner'
import rankingFakes from './ranking-fakes'
import scoring from '#server/ranking/score'
import standing from '#server/ranking/standing'
import sync from '#server/ranking/sync'

const { envelope, judge: fakeJudge, key, lena, now: NOW } = rankingFakes
const priya: Inbox.Participant = { name: 'Priya Nair', email: 'priya.nair@northwind.co' }
const MS_PER_HOUR = calendarTime.MILLISECONDS_PER_HOUR
const HOURS_IN_A_DAY_AND_ONE = 25
const DAY_AND_AN_HOUR = HOURS_IN_A_DAY_AND_ONE * MS_PER_HOUR

function sent(
  sentAt: string,
  to: Inbox.Participant[],
  cc: Inbox.Participant[] = [],
): Mail.SentEnvelope {
  return { to, cc, sentAt }
}

describe('ranking: standing', () => {
  it('counts each address in To and Cc once per sent message, by its keyed hash', () => {
    const correspondents = standing.correspondentsOf(
      [
        sent('2026-10-11T18:00:00Z', [lena, lena], [priya, mailboxOwner]),
        sent('2026-10-09T12:00:00Z', [{ ...lena, email: 'LENA.Hartmann@northwind.co' }]),
      ],
      { owner: mailboxOwner, key },
    )

    expect(correspondents[key.hash(lena.email)]).toStrictEqual({
      sent: 2,
      lastSentAt: '2026-10-11T18:00:00Z',
    })
    expect(correspondents[key.hash(priya.email)]?.sent).toBe(1)
    // The owner's own address is no correspondent, and a stranger has no standing
    expect(Object.keys(correspondents)).toHaveLength(2)
    expect(correspondents[key.hash('stranger@example.com')]).toBeUndefined()
  })

  it('stores no address and no mail content', async () => {
    expect.hasAssertions()
    const { db } = await rankingFakes.synced({
      unread: [envelope('m1', { subject: 'Vendor review', text: 'Does Thursday work?' })],
      sent: [sent(NOW.toISOString(), [lena])],
    })

    const stored = JSON.stringify([
      await db.select().from(schema.mailboxProfiles),
      await db.select().from(schema.unreadMessages),
    ])
    expect(stored).not.toMatch(/@|lena|Vendor review|Thursday/i)
  })

  it('rescans Sent Items after a day, not in a starting batch, and recomputes the scores', async () => {
    expect.hasAssertions()
    const { db, accountIds } = await rankingFakes.database()
    const [accountId = ''] = accountIds
    const mailbox = rankingFakes.mailbox(accountId, { unread: [envelope('m1')] })
    let time = NOW
    const dependencies = { db, key, judge: fakeJudge(), now: () => time }
    await sync.step(mailbox, dependencies, { start: false })
    const [before] = await db.select().from(schema.unreadMessages)
    // Mara writes to Lena, and a day passes
    mailbox.state.sent.push(sent(NOW.toISOString(), [lena]))
    time = new Date(NOW.getTime() + DAY_AND_AN_HOUR)

    await sync.step(mailbox, dependencies, { start: true })
    const scansAfterStart = mailbox.provider.listSent.mock.calls.length
    await sync.step(mailbox, dependencies, { start: false })
    const [after] = await db.select().from(schema.unreadMessages)

    expect([scansAfterStart, mailbox.provider.listSent.mock.calls.length]).toStrictEqual([1, 2])
    // Written to once and lately (+14), against a day of recency lost (−0.1)
    expect((after?.score ?? 0) - (before?.score ?? 0)).toBeGreaterThan(0)
  })

  it('rescans when the profile was hashed with another key, and takes the facts anew', async () => {
    expect.hasAssertions()
    const { db, accountIds } = await rankingFakes.database()
    const [accountId = ''] = accountIds
    const judge = fakeJudge()
    const mailbox = rankingFakes.mailbox(accountId, {
      unread: [envelope('m1')],
      sent: [sent(NOW.toISOString(), [lena])],
    })
    await sync.step(mailbox, { db, key, judge, now: () => NOW }, { start: false })
    const otherKey = createAddressKey('another-secret')

    await sync.step(mailbox, { db, key: otherKey, judge, now: () => NOW }, { start: false })

    const profile = await indexStore.profile(db, accountId)
    const [row] = await db
      .select()
      .from(schema.unreadMessages)
      .where(eq(schema.unreadMessages.accountId, accountId))
    expect(mailbox.provider.listSent).toHaveBeenCalledTimes(2)
    expect(profile?.factsCheck).toBe(facts.check(otherKey))
    expect(Object.keys(profile?.correspondents ?? {})).toStrictEqual([otherKey.hash(lena.email)])
    expect(row?.facts?.senderKey).toBe(otherKey.hash(lena.email))
    // The facts were taken anew; the judge's answers were kept
    expect(judge.judge).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.anything())
  })

  it('takes the facts anew when they gained a signal (another facts check), without asking the judge', async () => {
    expect.hasAssertions()
    const { db, accountIds } = await rankingFakes.database()
    const [accountId = ''] = accountIds
    const judge = fakeJudge()
    const mailbox = rankingFakes.mailbox(accountId, { unread: [envelope('m1')] })
    const dependencies = { db, key, judge, now: () => NOW }
    await sync.step(mailbox, dependencies, { start: false })
    await indexStore.updateProfile(db, accountId, { factsCheck: 'facts of an older version' })

    await sync.step(mailbox, dependencies, { start: false })

    const [row] = await db.select().from(schema.unreadMessages)
    await expect(indexStore.profile(db, accountId)).resolves.toMatchObject({
      factsCheck: facts.check(key),
    })
    expect({ facts: row?.facts?.senderKey, score: typeof row?.score }).toStrictEqual({
      facts: key.hash(rankingFakes.lena.email),
      score: 'number',
    })
    expect(judge.judge).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.anything())
  })

  it('recomputes the stored scores when the weights changed, and stores their version', async () => {
    expect.hasAssertions()
    const { db, accountIds } = await rankingFakes.database()
    const [accountId = ''] = accountIds
    const mailbox = rankingFakes.mailbox(accountId, { unread: [envelope('m1')] })
    const dependencies = { db, key, judge: fakeJudge(), now: () => NOW }
    await sync.step(mailbox, dependencies, { start: false })
    const [judged] = await db.select().from(schema.unreadMessages)
    // As if the scores were stored by older weights
    await indexStore.updateScores(db, accountId, [{ messageId: 'm1', score: 1 }])
    await indexStore.updateProfile(db, accountId, { scoresVersion: 0 })

    await sync.step(mailbox, dependencies, { start: true })
    const [afterStart] = await db.select().from(schema.unreadMessages)
    await sync.step(mailbox, dependencies, { start: false })
    const [after] = await db.select().from(schema.unreadMessages)

    // Not in a starting batch, which has to be quick
    expect([afterStart?.score, after?.score]).toStrictEqual([1, judged?.score])
    await expect(indexStore.profile(db, accountId)).resolves.toMatchObject({
      scoresVersion: scoring.version,
    })
  })
})
