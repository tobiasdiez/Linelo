import httpStatus from '#shared/utils/http-status'
import inboxBuilders from '~/data/inbox-builders'
import isRecord from '#shared/utils/is-record'
import { registerEndpoint } from '@nuxt/test-utils/runtime'

type Answer<Body, Request = undefined> = (
  request: Request,
) => Body | Response | Promise<Body | Response>

/** What a fake mail endpoint answers: 204 unless replaced. */
interface MailEndpoint {
  answer: () => Response | Promise<Response>
}

/** A request to the mailbox as the fake saw it: the queue (with its `limit`) or a sync call. */
type MailboxRequest =
  | { kind: 'inbox'; limit: string | null; start: boolean }
  | { kind: 'sync'; start: boolean }

interface FakeInboxApi {
  /** Answers `GET /api/me`, which the auth middleware asks when no user is known yet. */
  me: { answer: () => Inbox.MeResponse | Response }
  /**
   * Answers `GET /api/inbox`; the queue's background refills ask it too. A list of items
   * is the queue with nothing left to prepare.
   */
  inbox: { answer: Answer<Inbox.QueueItem[] | Inbox.InboxResponse, { start: boolean }> }
  /** Answers `POST /api/inbox/sync`: `more` for a starting batch and `done` otherwise, unless replaced. */
  sync: { answer: Answer<Inbox.SyncResponse, Inbox.SyncRequest> }
  /** Answers `POST /api/mail/read`. */
  read: MailEndpoint
  /** Answers `POST /api/mail/reply`. */
  reply: MailEndpoint
  /** Answers `POST /api/mail/forward`. */
  forward: MailEndpoint
  /** The bodies posted to `/api/mail/read`, in order. */
  readPosts: () => unknown[]
  /** The bodies posted to `/api/mail/reply`, in order. */
  replyPosts: () => unknown[]
  /** The bodies posted to `/api/mail/forward`, in order. */
  forwardPosts: () => unknown[]
  /** The `limit` of each inbox request, in order. */
  inboxLimits: () => (string | null)[]
  /** The queue's requests and the sync calls, in the order they were sent. */
  mailboxRequests: () => MailboxRequest[]
  /** How often a queue request or a sync call started while another one was still running. */
  overlaps: () => number
  /**
   * Lets the queue's requests and sync calls still in flight (and those queued behind
   * them) land, so they cannot reach the next test, then removes the fake.
   */
  restore: () => Promise<void>
}

/** The answer of the API when Linelo lost access to the mailbox. */
function reconnectResponse(): Response {
  return Response.json(
    {
      statusCode: httpStatus.unauthorized,
      statusMessage: 'Sign in again',
      data: { reason: 'reconnect' satisfies Inbox.ApiErrorReason },
    },
    { status: httpStatus.unauthorized },
  )
}

/** The answer of the API when the session ended. */
function signedOutResponse(): Response {
  return Response.json(
    { statusCode: httpStatus.unauthorized, statusMessage: 'Not signed in' },
    { status: httpStatus.unauthorized },
  )
}

/** What `/api/me` answers when nobody is signed in. */
function signedOutMe(): Response {
  return new Response('{"user":null,"accounts":[]}', {
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The answer of the API when the mailbox did not answer. */
function unavailableResponse(): Response {
  return new Response(undefined, { status: httpStatus.serviceUnavailable })
}

/** The answer of the API when the mailbox did not confirm a send: it may have gone out. */
function uncertainResponse(): Response {
  return Response.json(
    {
      statusCode: httpStatus.gatewayTimeout,
      statusMessage: 'Not confirmed by the mailbox',
      data: { reason: 'uncertain' satisfies Inbox.ApiErrorReason },
    },
    { status: httpStatus.gatewayTimeout },
  )
}

/** The answer of the API when the action went through. */
function noContent(): Response {
  return new Response(undefined, { status: httpStatus.noContent })
}

/** A fake `POST` mail endpoint at `path` that records what was posted to it. */
function recordedEndpoint(path: string) {
  const posts: unknown[] = []
  const endpoint: MailEndpoint = { answer: noContent }
  const unregister = registerEndpoint(path, {
    method: 'POST',
    handler: async event => {
      const body: unknown = await event.web?.request?.json()
      posts.push(body)
      return endpoint.answer()
    },
  })
  return { endpoint, posts: () => [...posts], unregister }
}

/** Lets the app take in answers: two macrotasks. */
async function settle(): Promise<void> {
  for (let task = 0; task < 2; task += 1) {
    // eslint-disable-next-line eslint/no-await-in-loop
    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })
  }
}

function asInboxResponse(answer: Inbox.QueueItem[] | Inbox.InboxResponse): Inbox.InboxResponse {
  return Array.isArray(answer) ? { items: answer, preparing: false } : answer
}

/** Records the mailbox requests, and how often one started while another ran. */
function mailboxLane() {
  const requests: MailboxRequest[] = []
  const inFlight = new Set<Promise<unknown>>()
  const counts = { active: 0, overlaps: 0 }
  async function track<Result>(request: MailboxRequest, answer: () => Promise<Result>) {
    requests.push(request)
    if (counts.active > 0) {
      counts.overlaps += 1
    }
    counts.active += 1
    const answering = answer()
    inFlight.add(answering)
    try {
      return await answering
    } finally {
      counts.active -= 1
    }
  }
  /** Waits until no request has run for a while: answers land, and requests queued behind them are sent and answered too. */
  async function quiet(): Promise<void> {
    let seen = -1
    while (seen !== requests.length) {
      seen = requests.length
      // eslint-disable-next-line eslint/no-await-in-loop
      await Promise.allSettled(inFlight)
      // eslint-disable-next-line eslint/no-await-in-loop
      await settle()
    }
  }
  return { requests, counts, track, quiet }
}

/**
 * Stands in for the inbox API: the server's queue, the sync, and the mail endpoints
 * (read state, reply, forward), recording what the app sent.
 */
function fakeInboxApi(items: Inbox.QueueItem[]): FakeInboxApi {
  const read = recordedEndpoint('/api/mail/read')
  const reply = recordedEndpoint('/api/mail/reply')
  const forward = recordedEndpoint('/api/mail/forward')
  const lane = mailboxLane()
  const { account, signedInUser } = inboxBuilders
  const api: Pick<FakeInboxApi, 'me' | 'inbox' | 'sync'> = {
    me: {
      answer: () => ({
        user: { name: signedInUser.name, email: signedInUser.email },
        accounts: [account],
      }),
    },
    inbox: { answer: () => items },
    // As the server: a starting batch leaves more to do, a sync step here finds nothing left
    sync: { answer: ({ start }) => ({ status: start ? 'more' : 'done' }) },
  }
  const unregister = [
    registerEndpoint('/api/me', () => api.me.answer()),
    registerEndpoint('/api/inbox', async event => {
      const query = new URL(event.path, 'http://localhost').searchParams
      const request = {
        kind: 'inbox',
        limit: query.get('limit'),
        start: query.get('start') === '1',
      } as const
      const answer = await lane.track(request, async () => api.inbox.answer(request))
      return answer instanceof Response ? answer : asInboxResponse(answer)
    }),
    registerEndpoint('/api/inbox/sync', {
      method: 'POST',
      handler: async event => {
        const body: unknown = await event.web?.request?.json()
        const start = isRecord(body) && body.start === true
        return lane.track({ kind: 'sync', start }, async () => api.sync.answer({ start }))
      },
    }),
    read.unregister,
    reply.unregister,
    forward.unregister,
  ]

  return {
    ...api,
    read: read.endpoint,
    reply: reply.endpoint,
    forward: forward.endpoint,
    readPosts: read.posts,
    replyPosts: reply.posts,
    forwardPosts: forward.posts,
    inboxLimits: () =>
      lane.requests.flatMap(request => (request.kind === 'inbox' ? [request.limit] : [])),
    mailboxRequests: () => [...lane.requests],
    overlaps: () => lane.counts.overlaps,
    restore: async () => {
      await lane.quiet()
      for (const remove of unregister) {
        remove()
      }
    },
  }
}

const fakeInbox = {
  api: fakeInboxApi,
  noContent,
  reconnectResponse,
  signedOutResponse,
  signedOutMe,
  unavailableResponse,
  uncertainResponse,
}

export default fakeInbox
