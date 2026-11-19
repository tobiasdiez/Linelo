import createAddressKey from '../ranking/address-key'
import createJudges from '../ranking/judges'
import db from './db'
import queue from '../ranking/queue'
import resolutions from '../ranking/resolutions'
import sync from '../ranking/sync'

/*
 * The ranking wired from the environment (see `server/ranking`): the database, the key for
 * addresses (derived from BETTER_AUTH_SECRET), the judges and the clock. TYPESAFE_API_KEY
 * is checked when the server starts (`server/plugins/ranking.ts`); the queue and the
 * recording of resolutions never need it.
 */

function now(): Date {
  return new Date()
}

function log(message: string, details: unknown): void {
  console.info(message, details)
}

const key = createAddressKey(process.env.BETTER_AUTH_SECRET)

/** The judges, built on the first sync. */
const judges: { judgeFor?: ReturnType<typeof createJudges>['judgeFor'] } = {}

/** Jev with TYPESAFE_API_KEY (JEV_MODEL overrides the pinned model), the canned judge for the demo mailbox, or the rules alone. */
function judgeFor(mailbox: Mail.Mailbox): Ranking.Judge | undefined {
  judges.judgeFor ??= createJudges({
    apiKey: process.env.TYPESAFE_API_KEY || undefined,
    model: process.env.JEV_MODEL || undefined,
    fetch: globalThis.fetch,
    development: import.meta.dev,
  }).judgeFor
  return judges.judgeFor(mailbox)
}

/** The user's queue (`GET /api/inbox`); in development it logs each item's score and factors. */
function loadQueue(
  mailboxes: readonly Mail.Mailbox[],
  request: { limit: number; start: boolean },
): Promise<Inbox.InboxResponse> {
  return queue.load(mailboxes, request, { db, now, log: import.meta.dev ? log : undefined })
}

/** One sync step for each of the mailboxes (`POST /api/inbox/sync`), with a line on what the judge read. */
function syncMailboxes(
  mailboxes: readonly Mail.Mailbox[],
  request: Inbox.SyncRequest,
): Promise<Inbox.SyncResponse> {
  return sync.stepAll(mailboxes, { db, key, now, judgeFor, log }, request)
}

/** A mail route's action that records what it resolved in the index once it ran. */
function recording<Request>(
  run: (mailboxes: readonly Mail.Mailbox[], request: Request) => Promise<void>,
  resolutionOf: Parameters<typeof resolutions.recording<Request>>[2],
): (mailboxes: readonly Mail.Mailbox[], request: Request) => Promise<void> {
  return resolutions.recording({ db, now }, run, resolutionOf)
}

const ranking = { loadQueue, sync: syncMailboxes, recording }

export default ranking
