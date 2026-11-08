import httpStatus from '#shared/utils/http-status'
import inboxBuilders from '~/data/inbox-builders'
import { registerEndpoint } from '@nuxt/test-utils/runtime'

type Answer<Body> = () => Body | Response | Promise<Body | Response>

interface FakeInboxApi {
  /** Answers `GET /api/me`, which the auth middleware asks when no user is known yet. */
  me: { answer: () => Inbox.MeResponse | Response }
  /** Answers `GET /api/inbox`; the queue's background refills ask it too. */
  inbox: { answer: Answer<Inbox.QueueItem[]> }
  /** Answers `POST /api/mail/read`: 204 unless replaced. */
  read: { answer: () => Response }
  /** The bodies posted to `/api/mail/read`, in order. */
  posts: () => unknown[]
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
      data: { reason: 'reconnect' },
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

/**
 * Stands in for the inbox API: the server's list of unread items and the read
 * state endpoint, recording what the app sent.
 */
function fakeInboxApi(items: Inbox.QueueItem[]): FakeInboxApi {
  const posts: unknown[] = []
  const inboxLimits: (string | null)[] = []
  const inFlight = new Set<Promise<unknown>>()
  const { account, signedInUser } = inboxBuilders
  const api: Pick<FakeInboxApi, 'me' | 'inbox' | 'read'> = {
    me: {
      answer: () => ({
        user: { name: signedInUser.name, email: signedInUser.email },
        accounts: [account],
      }),
    },
    inbox: { answer: () => items },
    read: { answer: () => new Response(undefined, { status: httpStatus.noContent }) },
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
    registerEndpoint('/api/mail/read', {
      method: 'POST',
      handler: async event => {
        const body: unknown = await event.web?.request?.json()
        posts.push(body)
        return api.read.answer()
      },
    }),
  ]

  return {
    ...api,
    posts: () => [...posts],
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
  reconnectResponse,
  signedOutResponse,
  signedOutMe,
  unavailableResponse,
}

export default fakeInbox
