import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm'
import { mailboxProfiles, unreadMessages } from '../db/schema'
import chunks from '#shared/utils/chunks'
import type createDatabase from '../db/client'

/*
 * Reads and writes the index of unread mail (`unread_messages`) and the mailbox profiles
 * (`mailbox_profiles`), and the lease that lets one sync step at a time work on a mailbox.
 */

type Db = ReturnType<typeof createDatabase>['db']
type Row = typeof unreadMessages.$inferSelect
type Profile = typeof mailboxProfiles.$inferSelect
/** A row that has been judged: it has facts and a score, so it can be shown. */
type ScoredRow = Row & { facts: Ranking.Facts; score: number }

/** A judged row as the sync writes it: everything but the user's resolution and the timestamps. */
type JudgedRow = Pick<
  Row,
  'messageId' | 'threadId' | 'receivedAt' | 'facts' | 'answers' | 'judge' | 'triedAt' | 'score'
>

/** What a row needs from the judge step: nothing, its facts only, or the judge's answers too. */
type Work = 'skip' | 'facts' | 'judge'

/** Which judge asks, and since when an earlier unanswered request counts as recent. */
interface JudgeTerms {
  judgeId: string | undefined
  triedBefore: Date
}

/** Rows per statement, well below PostgreSQL's limit of parameters. */
const CHUNK = 500

function isScored(row: Row): row is ScoredRow {
  return row.facts !== null && row.score !== null
}

/** Creates the profile of a mailbox that has none, with nobody written to yet. */
async function ensureProfile(db: Db, accountId: string, factsCheck: string): Promise<void> {
  await db
    .insert(mailboxProfiles)
    .values({ accountId, correspondents: {}, factsCheck })
    .onConflictDoNothing()
}

async function profile(db: Db, accountId: string): Promise<Profile | undefined> {
  const [found] = await db
    .select()
    .from(mailboxProfiles)
    .where(eq(mailboxProfiles.accountId, accountId))
  return found
}

/** The profiles of these mailboxes. */
function profiles(db: Db, accountIds: readonly string[]): Promise<Profile[]> {
  return db.select().from(mailboxProfiles).where(inArray(mailboxProfiles.accountId, accountIds))
}

/** Claims the mailbox until `until`, in one atomic update; `false` when another step holds it. */
async function claimLease(
  db: Db,
  accountId: string,
  { now, until }: { now: Date; until: Date },
): Promise<boolean> {
  const free = or(isNull(mailboxProfiles.syncingUntil), lte(mailboxProfiles.syncingUntil, now))
  const claimed = await db
    .update(mailboxProfiles)
    .set({ syncingUntil: until })
    .where(and(eq(mailboxProfiles.accountId, accountId), free))
    .returning({ accountId: mailboxProfiles.accountId })
  return claimed.length > 0
}

/** Gives the lease back, unless it ran out and another step took it meanwhile. */
async function releaseLease(db: Db, accountId: string, until: Date): Promise<void> {
  await db
    .update(mailboxProfiles)
    // JSON and the database have no `undefined`
    // eslint-disable-next-line unicorn/no-null
    .set({ syncingUntil: null })
    .where(and(eq(mailboxProfiles.accountId, accountId), eq(mailboxProfiles.syncingUntil, until)))
}

async function updateProfile(
  db: Db,
  accountId: string,
  values: Partial<Omit<Profile, 'accountId' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await db.update(mailboxProfiles).set(values).where(eq(mailboxProfiles.accountId, accountId))
}

/** Adds rows for messages the index does not know yet; known ones stay as they are. */
async function addListed(
  db: Db,
  accountId: string,
  listed: readonly Mail.ListedMessage[],
): Promise<void> {
  for (const part of chunks(listed, CHUNK)) {
    // eslint-disable-next-line eslint/no-await-in-loop
    await db
      .insert(unreadMessages)
      .values(
        part.map(({ id, threadId, receivedAt }) => ({
          accountId,
          messageId: id,
          threadId,
          receivedAt: new Date(receivedAt),
        })),
      )
      .onConflictDoNothing()
  }
}

/** Every row of the mailbox, as far as a listing needs it: its id, and when the user resolved it. */
function knownRows(db: Db, accountId: string): Promise<Pick<Row, 'messageId' | 'resolvedAt'>[]> {
  return db
    .select({ messageId: unreadMessages.messageId, resolvedAt: unreadMessages.resolvedAt })
    .from(unreadMessages)
    .where(eq(unreadMessages.accountId, accountId))
}

async function deleteMessages(db: Db, accountId: string, ids: readonly string[]): Promise<void> {
  for (const part of chunks(ids, CHUNK)) {
    // eslint-disable-next-line eslint/no-await-in-loop
    await db
      .delete(unreadMessages)
      .where(and(eq(unreadMessages.accountId, accountId), inArray(unreadMessages.messageId, part)))
  }
}

async function deleteThreads(
  db: Db,
  accountId: string,
  threadIds: readonly string[],
): Promise<void> {
  if (threadIds.length > 0) {
    await db
      .delete(unreadMessages)
      .where(
        and(eq(unreadMessages.accountId, accountId), inArray(unreadMessages.threadId, threadIds)),
      )
  }
}

/** The rows of these messages, by message id. */
async function rowsOf(
  db: Db,
  accountId: string,
  ids: readonly string[],
): Promise<Map<string, Row>> {
  if (ids.length === 0) {
    return new Map()
  }
  const rows = await db
    .select()
    .from(unreadMessages)
    .where(and(eq(unreadMessages.accountId, accountId), inArray(unreadMessages.messageId, ids)))
  return new Map(rows.map(row => [row.messageId, row]))
}

/** Writes judged rows, adding those the index did not know; the user's resolution stays. */
async function writeJudged(
  db: Db,
  accountId: string,
  { rows, now }: { rows: readonly JudgedRow[]; now: Date },
): Promise<void> {
  if (rows.length === 0) {
    return
  }
  await db
    .insert(unreadMessages)
    .values(rows.map(row => ({ ...row, accountId })))
    .onConflictDoUpdate({
      target: [unreadMessages.accountId, unreadMessages.messageId],
      set: {
        threadId: sql`excluded.thread_id`,
        receivedAt: sql`excluded.received_at`,
        facts: sql`excluded.facts`,
        answers: sql`excluded.answers`,
        judge: sql`excluded.judge`,
        triedAt: sql`excluded.tried_at`,
        score: sql`excluded.score`,
        updatedAt: now,
      },
    })
}

/**
 * What the row of a message needs from the judge step. Not a resolved row; facts when it
 * has none; with a judge, its answers when the row has none of this judge and it was not
 * asked in vain since `triedBefore`. A message the index does not know needs everything.
 * The same rule in SQL is `needsWork`; one spec runs both over the same rows.
 */
function workFor(row: Row | undefined, { judgeId, triedBefore }: JudgeTerms): Work {
  const ask = judgeId === undefined ? 'facts' : 'judge'
  if (!row) {
    return ask
  }
  if (row.resolvedAt !== null) {
    return 'skip'
  }
  const answered = row.answers !== null && row.judge === judgeId
  const triedLately = row.triedAt !== null && row.triedAt >= triedBefore
  if (ask === 'judge' && !answered && !triedLately) {
    return 'judge'
  }
  return row.facts === null ? 'facts' : 'skip'
}

/** `workFor` as a condition: the rows whose work is not `skip`. */
function needsWork({ judgeId, triedBefore }: JudgeTerms) {
  const unanswered =
    judgeId === undefined
      ? undefined
      : and(
          or(
            isNull(unreadMessages.answers),
            isNull(unreadMessages.judge),
            ne(unreadMessages.judge, judgeId),
          ),
          or(isNull(unreadMessages.triedAt), lt(unreadMessages.triedAt, triedBefore)),
        )
  return and(isNull(unreadMessages.resolvedAt), or(isNull(unreadMessages.facts), unanswered))
}

/** The newest row that needs the judge step (`needsWork`). */
async function nextToJudge(db: Db, accountId: string, terms: JudgeTerms): Promise<Row | undefined> {
  const [row] = await db
    .select()
    .from(unreadMessages)
    .where(and(eq(unreadMessages.accountId, accountId), needsWork(terms)))
    .orderBy(desc(unreadMessages.receivedAt))
    .limit(1)
  return row
}

/**
 * Rows a page of the newest unread messages should have held and did not: received at or
 * before `before` (when given), and after `after`, the page's oldest message (when given).
 */
async function rowsMissingFrom(
  db: Db,
  accountId: string,
  page: { ids: readonly string[]; before?: Date; after?: Date },
): Promise<string[]> {
  const rows = await db
    .select({ messageId: unreadMessages.messageId })
    .from(unreadMessages)
    .where(
      and(
        eq(unreadMessages.accountId, accountId),
        page.before ? lte(unreadMessages.receivedAt, page.before) : undefined,
        page.after ? gt(unreadMessages.receivedAt, page.after) : undefined,
      ),
    )
  const onPage = new Set(page.ids)
  return rows.map(row => row.messageId).filter(id => !onPage.has(id))
}

/** Sets or clears (`null`) the user's resolution of these messages. */
async function setResolved(
  db: Db,
  accountId: string,
  { ids, resolvedAt }: { ids: readonly string[]; resolvedAt: Date | null },
): Promise<void> {
  if (ids.length > 0) {
    await db
      .update(unreadMessages)
      .set({ resolvedAt })
      .where(and(eq(unreadMessages.accountId, accountId), inArray(unreadMessages.messageId, ids)))
  }
}

/** Every row with facts (and so a score), for recomputing scores. */
async function scoredRows(db: Db, accountId: string): Promise<ScoredRow[]> {
  const rows = await db
    .select()
    .from(unreadMessages)
    .where(and(eq(unreadMessages.accountId, accountId), isNotNull(unreadMessages.facts)))
  return rows.filter(row => isScored(row))
}

/** Writes new scores, a chunk of rows per statement. */
async function updateScores(
  db: Db,
  accountId: string,
  scores: readonly { messageId: string; score: number }[],
): Promise<void> {
  for (const part of chunks(scores, CHUNK)) {
    const values = sql.join(
      part.map(({ messageId, score }) => sql`(${messageId}, ${score})`),
      sql`, `,
    )
    // eslint-disable-next-line eslint/no-await-in-loop
    await db.execute(sql`
      update ${unreadMessages} set score = scores.score::real
      from (values ${values}) as scores(message_id, score)
      where ${unreadMessages.accountId} = ${accountId}
        and ${unreadMessages.messageId} = scores.message_id`)
  }
}

/** Forgets the facts and scores of the mailbox's rows (their sender keys were made with another key); answers stay. */
async function forgetFacts(db: Db, accountId: string): Promise<void> {
  await db
    .update(unreadMessages)
    // eslint-disable-next-line unicorn/no-null
    .set({ facts: null, score: null })
    .where(eq(unreadMessages.accountId, accountId))
}

/**
 * The best `limit` conversations of these mailboxes: rows with a score that are not
 * resolved, one per conversation (its best message), best first and newer first on ties.
 */
async function bestConversations(
  db: Db,
  accountIds: readonly string[],
  limit: number,
): Promise<ScoredRow[]> {
  const best = db
    .selectDistinctOn([unreadMessages.accountId, unreadMessages.threadId])
    .from(unreadMessages)
    .where(
      and(
        inArray(unreadMessages.accountId, accountIds),
        isNotNull(unreadMessages.facts),
        isNotNull(unreadMessages.score),
        isNull(unreadMessages.resolvedAt),
      ),
    )
    .orderBy(
      unreadMessages.accountId,
      unreadMessages.threadId,
      desc(unreadMessages.score),
      desc(unreadMessages.receivedAt),
    )
    .as('best')
  const rows = await db
    .select()
    .from(best)
    .orderBy(desc(best.score), desc(best.receivedAt))
    .limit(limit)
  return rows.filter(row => isScored(row))
}

const indexStore = {
  ensureProfile,
  profile,
  profiles,
  claimLease,
  releaseLease,
  updateProfile,
  addListed,
  knownRows,
  deleteMessages,
  deleteThreads,
  rowsOf,
  writeJudged,
  workFor,
  needsWork,
  nextToJudge,
  rowsMissingFrom,
  setResolved,
  scoredRows,
  updateScores,
  forgetFacts,
  bestConversations,
}

export default indexStore
