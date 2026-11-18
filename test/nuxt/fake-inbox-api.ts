import httpStatus from '#shared/utils/http-status'
import inboxBuilders from '~/data/inbox-builders'
import { registerEndpoint } from '@nuxt/test-utils/runtime'

type Answer<Body> = () => Body | Response | Promise<Body | Response>

/** What a fake mail endpoint answers: 204 unless replaced. */
interface MailEndpoint {
  answer: Answer<Response>
}

interface FakeInboxApi {
  /** Answers `GET /api/me`, which the auth middleware asks when no user is known yet. */
  me: { answer: () => Inbox.MeResponse | Response }
  /** Answers `GET /api/inbox`; the queue's background refills ask it too. */
  inbox: { answer: Answer<Inbox.QueueItem[]> }
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
  /** Lets inbox requests still in flight (background refills) land, so they cannot reach the next test, then removes the fake. */
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

/**
 * Stands in for the inbox API: the server's list of unread items and the mail
 * endpoints (read state, reply, forward), recording what the app sent.
 */
function fakeInboxApi(items: Inbox.QueueItem[]): FakeInboxApi {
  const read = recordedEndpoint('/api/mail/read')
  const reply = recordedEndpoint('/api/mail/reply')
  const forward = recordedEndpoint('/api/mail/forward')
  const inboxLimits: (string | null)[] = []
  const inFlight = new Set<Promise<unknown>>()
  const { account, signedInUser } = inboxBuilders
  const api: Pick<FakeInboxApi, 'me' | 'inbox'> = {
    me: {
      answer: () => ({
        user: { name: signedInUser.name, email: signedInUser.email },
        accounts: [account],
      }),
    },
    inbox: { answer: () => items },
  }
  const unregister = [
    registerEndpoint('/api/me', () => api.me.answer()),
    registerEndpoint('/api/inbox', async event => {
      inboxLimits.push(new URL(event.path, 'http://localhost').searchParams.get('limit'))
      const answering = Promise.resolve(api.inbox.answer())
      inFlight.add(answering)
      const answer = await answering
      return answer instanceof Response ? answer : { items: answer }
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
    inboxLimits: () => [...inboxLimits],
    restore: async () => {
      await Promise.allSettled(inFlight)
      // One more task, for the app to take in the answers
      await new Promise(resolve => {
        setTimeout(resolve, 0)
      })
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
