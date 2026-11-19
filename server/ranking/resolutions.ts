import type createDatabase from '../db/client'
import indexStore from './index-store'

/*
 * What the user resolved in Linelo, in the index: the mail routes (read, reply, forward)
 * record it once their action ran, so the queue is right before the next sync.
 */

interface Dependencies {
  db: ReturnType<typeof createDatabase>['db']
  now: () => Date
}

/** Messages the user resolved (`resolved`), or brought back with Undo. */
interface Resolution {
  accountId: string
  messageIds: readonly string[]
  resolved: boolean
}

type MailAction<Request> = (mailboxes: readonly Mail.Mailbox[], request: Request) => Promise<void>

/**
 * Records a resolution, best effort: a failure is logged, and the mailbox stays the truth
 * (the next listing removes rows of mail read meanwhile). Undo also lets the next sync step
 * list at once, so a row a listing removed in between comes back.
 */
async function record({ db, now }: Dependencies, resolution: Resolution): Promise<void> {
  const { accountId, messageIds, resolved } = resolution
  try {
    // eslint-disable-next-line unicorn/no-null
    const resolvedAt = resolved ? now() : null
    await indexStore.setResolved(db, accountId, { ids: messageIds, resolvedAt })
    if (!resolved) {
      // eslint-disable-next-line unicorn/no-null
      await indexStore.updateProfile(db, accountId, { listedAt: null })
    }
  } catch (error) {
    console.error('Recording a resolution in the index failed', error)
  }
}

/**
 * A mail route's action that, once it ran, records what it resolved. A reply or forward
 * whose marking as read failed afterwards is recorded too (marking as read never throws
 * there, `outgoing.ts`), until a listing two minutes later still finds it unread: then it
 * comes back, as the mailbox says.
 */
function recording<Request>(
  dependencies: Dependencies,
  run: MailAction<Request>,
  resolutionOf: (request: Request) => Resolution,
): MailAction<Request> {
  return async (mailboxes, request) => {
    await run(mailboxes, request)
    await record(dependencies, resolutionOf(request))
  }
}

const resolutions = { record, recording }

export default resolutions
