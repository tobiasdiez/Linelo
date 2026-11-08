import { describe, expect, it, vi } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import conversations from './fixtures/graph-conversations.json'
import createMicrosoftProvider from '#server/mail/providers/microsoft'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'
import mailFakes from './mail-fakes'
import unreadInbox from './fixtures/graph-unread-inbox.json'

interface GraphCall {
  method: string
  url: URL
  headers: Headers
  body: unknown
}

interface InnerRequest {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

type InnerAnswer = (request: InnerRequest) => { status: number; body?: unknown }

const BATCH_LIMIT = 20
const IMMUTABLE_IDS = /IdType="ImmutableId"/

function json(body: unknown, status: number = httpStatus.ok): Response {
  return Response.json(body, { status })
}

function innerRequests(body: unknown): InnerRequest[] {
  if (!isRecord(body) || !Array.isArray(body.requests)) {
    throw new Error('Not a batch body')
  }
  return body.requests.flatMap(entry => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.method !== 'string' ||
      typeof entry.url !== 'string' ||
      !isRecord(entry.headers)
    ) {
      return []
    }
    const headers = Object.fromEntries(
      Object.entries(entry.headers).map(([key, value]) => [key, String(value)]),
    )
    return [{ id: entry.id, method: entry.method, url: entry.url, headers, body: entry.body }]
  })
}

/** The fixture answer for an inner request: a well-known folder or a conversation. */
function fixtureAnswer(request: InnerRequest): { status: number; body?: unknown } {
  const url = new URL(request.url, 'https://graph.microsoft.com/v1.0')
  const folder = /^\/me\/mailFolders\/(?<name>\w+)$/.exec(url.pathname)?.groups?.name
  const conversation = /conversationId eq '(?<id>[^']+)'/.exec(
    url.searchParams.get('$filter') ?? '',
  )?.groups?.id
  const key = folder ? `folder-${folder}` : (conversation ?? '')
  const entries: Record<string, { status: number; body?: unknown }> = conversations
  return entries[key] ?? { status: httpStatus.notFound }
}

/** A stand-in for Microsoft Graph: answers the unread listing and JSON batches, and records every call. */
function fakeGraph({
  unread = unreadInbox,
  answer = fixtureAnswer,
  status,
}: { unread?: unknown; answer?: InnerAnswer; status?: () => number | undefined } = {}) {
  // Fresh spies for every test that builds a fake
  vi.restoreAllMocks()
  const warn = vi.spyOn(console, 'warn').mockReturnValue()
  const calls: GraphCall[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const call = { method: init?.method ?? 'GET', url, headers: new Headers(init?.headers), body }
    calls.push(call)
    const forced = status?.()
    if (forced !== undefined) {
      return json({ error: { code: 'Forced' } }, forced)
    }
    if (url.pathname.endsWith('/$batch')) {
      const responses = innerRequests(body).map(request => {
        const { status: innerStatus, body: innerBody } = answer(request)
        return { id: request.id, status: innerStatus, body: innerBody }
      })
      return json({ responses: responses.toReversed() })
    }
    return json(unread)
  })
  return { fetch, calls, warn }
}

const { connection } = mailFakes

function batchCalls(calls: GraphCall[]): GraphCall[] {
  return calls.filter(call => call.url.pathname.endsWith('/$batch'))
}

describe('microsoft graph provider: unread threads', () => {
  it('groups unread inbox messages into threads, newest unread first', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    const threads = await provider.listUnreadThreads(connection(), { limit: 4 })

    expect(threads.map(thread => thread.subject)).toStrictEqual([
      'Vendor review: can we move sign-off to Thursday?',
      'Issue 212: The quiet case for fewer meetings',
    ])
    // The conversation id; the inbox makes it unique across accounts
    expect(threads[0]?.id).toBe('AAQkAGI2-conversation-vendor')
  })

  it('orders messages oldest to newest and drops drafts, Deleted Items and Junk', async () => {
    expect.hasAssertions()
    const provider = createMicrosoftProvider({ fetch: fakeGraph().fetch })

    const [vendor] = await provider.listUnreadThreads(connection(), { limit: 1 })

    expect(vendor?.messages.map(message => [message.from.name, message.unread])).toStrictEqual([
      ['Lena Hartmann', true],
      ['Mara Lindqvist', false],
      ['Lena Hartmann', true],
    ])
  })

  it('shows only the new part of a message, as plain text, with file attachments only', async () => {
    expect.hasAssertions()
    const provider = createMicrosoftProvider({ fetch: fakeGraph().fetch })

    const [vendor, newsletter] = await provider.listUnreadThreads(connection(), { limit: 2 })

    expect(vendor?.messages.at(-1)).toMatchObject({
      body: 'Hi Mara,\n\nDoes Thursday 14:00 work?\n\nLena',
      attachments: [{ id: 'attachment-sheet', name: 'cost-comparison.xlsx', sizeBytes: 49_152 }],
      cc: [{ name: 'Priya Nair', email: 'priya.nair@northwind.co' }],
    })
    // An empty unique body falls back to the full body
    expect(newsletter?.messages[0].body).toBe(
      'This week: fewer meetings.\n\nRead the full issue online.',
    )
  })

  it('asks for immutable ids and text bodies on every request', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(connection(), {
      limit: 4,
    })

    const [listing] = graph.calls
    const inner = batchCalls(graph.calls).flatMap(call => innerRequests(call.body))

    expect(listing?.headers.get('Prefer')).toMatch(IMMUTABLE_IDS)
    expect(listing?.url.searchParams.get('$orderby')).toBe('receivedDateTime desc')
    expect(listing?.url.searchParams.get('$filter')).toMatch(
      /^receivedDateTime ge .+ and isRead eq false$/,
    )
    expect(inner.map(request => IMMUTABLE_IDS.test(request.headers.Prefer ?? ''))).not.toContain(
      false,
    )
    expect(
      inner
        .filter(request => request.id.startsWith('conversation'))
        .map(request => request.headers.Prefer?.includes('outlook.body-content-type="text"')),
    ).not.toContain(false)
  })

  it('skips a conversation whose part of the batch failed', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    const threads = await provider.listUnreadThreads(connection(), { limit: 3 })

    expect(threads).toHaveLength(2)
    expect(graph.warn).toHaveBeenCalledExactlyOnceWith(
      'Loading a conversation from Microsoft Graph failed',
      httpStatus.serviceUnavailable,
    )
  })

  it('does not report an empty inbox when no conversation loaded', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request =>
        request.id.startsWith('folder')
          ? fixtureAnswer(request)
          : { status: httpStatus.internalServerError },
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(connection(), { limit: 2 }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('splits conversations into batches of 20', async () => {
    expect.hasAssertions()
    const unread = {
      value: Array.from({ length: 25 }, (_, index) => ({
        id: `message-${index}`,
        conversationId: `conversation-${index}`,
        receivedDateTime: '2026-10-12T09:00:00Z',
      })),
    }
    const graph = fakeGraph({
      unread,
      answer: request =>
        request.id.startsWith('folder')
          ? fixtureAnswer(request)
          : { status: httpStatus.ok, body: { value: [] } },
    })

    const threads = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(
      connection(),
      { limit: 20 },
    )

    // Two folders and 20 conversations
    expect(batchCalls(graph.calls).map(call => innerRequests(call.body).length)).toStrictEqual([
      BATCH_LIMIT,
      2,
    ])
    expect(threads).toStrictEqual([])
  })

  it('asks for no threads when nothing is unread', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ unread: { value: [] } })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(connection(), { limit: 4 }),
    ).resolves.toStrictEqual([])
    expect(batchCalls(graph.calls)).toHaveLength(0)
  })

  it('looks up the hidden folders once per account', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    await provider.listUnreadThreads(connection(), { limit: 2 })
    await provider.listUnreadThreads(connection(), { limit: 2 })

    const folderLookups = batchCalls(graph.calls).map(
      call => innerRequests(call.body).filter(request => request.id.startsWith('folder')).length,
    )
    expect(folderLookups).toStrictEqual([2, 0])
  })

  it('fails without the hidden folders, and looks them up again next time', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request =>
        request.id === 'folder-junkemail'
          ? { status: httpStatus.serviceUnavailable }
          : fixtureAnswer(request),
    })
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    await expect(provider.listUnreadThreads(connection(), { limit: 2 })).rejects.toMatchObject({
      kind: 'unavailable',
    })
    await expect(provider.listUnreadThreads(connection(), { limit: 2 })).rejects.toMatchObject({
      kind: 'unavailable',
    })
    expect(batchCalls(graph.calls)).toHaveLength(2)
  })

  it('turns an HTML body into text when Graph sends one despite asking for text', async () => {
    expect.hasAssertions()
    const html = {
      contentType: 'html',
      content:
        '<html><head><style>p { color: red }</style></head><body><p>Hi Mara,</p><div>Thursday works &amp; Friday too.<br>Lena</div><scr<script></script>ipt>alert(1)</script></body></html>',
    }
    const graph = fakeGraph({
      answer: request => {
        const fixture = fixtureAnswer(request)
        if (!request.id.startsWith('conversation') || !isRecord(fixture.body)) {
          return fixture
        }
        const [message] = Array.isArray(fixture.body.value) ? fixture.body.value : []
        return {
          status: httpStatus.ok,
          body: { value: [{ ...message, uniqueBody: undefined, body: html }] },
        }
      },
    })

    const [vendor] = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(
      connection(),
      { limit: 1 },
    )

    expect(vendor?.messages[0].body).toBe('Hi Mara,\n\nThursday works & Friday too.\nLena')
  })
})

describe('microsoft graph provider: errors', () => {
  it('refreshes the token once when Graph refuses it', async () => {
    expect.hasAssertions()
    const statuses = [httpStatus.unauthorized]
    const graph = fakeGraph({ status: () => statuses.shift() })
    const mailbox = connection()

    const threads = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(
      mailbox,
      {
        limit: 4,
      },
    )

    expect(threads).toHaveLength(2)
    expect(mailbox.accessToken).toHaveBeenLastCalledWith({ force: true })
    expect(graph.calls.at(-1)?.headers.get('Authorization')).toBe('Bearer refreshed-token')
  })

  it('asks to sign in again when Graph still refuses the refreshed token', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ status: () => httpStatus.unauthorized })
    const mailbox = connection()

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(mailbox, { limit: 4 }),
    ).rejects.toMatchObject({ kind: 'reconnect' })
    expect(mailbox.accessToken).toHaveBeenCalledTimes(2)
  })

  it('asks to sign in again when an answer inside the batch refuses the token', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.unauthorized }) })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(connection(), { limit: 4 }),
    ).rejects.toMatchObject({ kind: 'reconnect' })
  })

  it.each([httpStatus.forbidden, httpStatus.tooManyRequests, httpStatus.internalServerError])(
    'reports Graph as unavailable on %i',
    async status => {
      expect.hasAssertions()
      const graph = fakeGraph({ status: () => status })

      await expect(
        createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(connection(), {
          limit: 4,
        }),
      ).rejects.toMatchObject({ kind: 'unavailable' })
    },
  )

  it('reports Graph as unavailable when it is not reachable', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('fetch failed'))

    const failure = createMicrosoftProvider({ fetch }).listUnreadThreads(connection(), { limit: 4 })

    await expect(failure).rejects.toBeInstanceOf(MailError)
    await expect(failure).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports a failing token refresh as it is', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const mailbox = connection()
    mailbox.accessToken.mockRejectedValue(new MailError('reconnect', 'grant revoked'))

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnreadThreads(mailbox, { limit: 4 }),
    ).rejects.toMatchObject({ kind: 'reconnect' })
    expect(graph.fetch).not.toHaveBeenCalled()
  })

  it('gives up on Graph after the timeout', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason)
          })
        }),
    )

    await expect(
      createMicrosoftProvider({ fetch, timeoutMs: 5 }).listUnreadThreads(connection(), {
        limit: 1,
      }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports Graph as unavailable when the answer stalls or is not JSON', async () => {
    expect.hasAssertions()
    const stalled = vi.fn<typeof globalThis.fetch>(
      async (_, init) =>
        new Response(
          // The headers arrive, the body never finishes
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () => {
                controller.error(init.signal?.reason)
              })
            },
          }),
          { status: httpStatus.ok },
        ),
    )
    const garbled = vi.fn<typeof globalThis.fetch>(async () => new Response('<html>'))

    await expect(
      createMicrosoftProvider({ fetch: stalled, timeoutMs: 5 }).listUnreadThreads(connection(), {
        limit: 1,
      }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(
      createMicrosoftProvider({ fetch: garbled }).listUnreadThreads(connection(), { limit: 1 }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('microsoft graph provider: read state', () => {
  it('patches each message in batches, by immutable id', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.ok }) })
    const ids = Array.from({ length: 21 }, (_, index) => `message/${index}`)

    await createMicrosoftProvider({ fetch: graph.fetch }).setRead(connection(), ids, true)

    const inner = batchCalls(graph.calls).map(call => innerRequests(call.body))
    expect(inner.map(requests => requests.length)).toStrictEqual([BATCH_LIMIT, 1])
    expect(inner[0]?.[0]).toMatchObject({
      method: 'PATCH',
      url: '/me/messages/message%2F0',
      body: { isRead: true },
      headers: { 'Content-Type': 'application/json', 'Prefer': 'IdType="ImmutableId"' },
    })
  })

  it('accepts messages deleted in the meantime', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request => ({
        status: request.id === 'message-0' ? httpStatus.notFound : httpStatus.noContent,
      }),
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).setRead(
        connection(),
        ['gone', 'here'],
        false,
      ),
    ).resolves.toBeUndefined()
  })

  it('fails when a message could not be marked', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.tooManyRequests }) })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).setRead(connection(), ['message'], true),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  // Without the serialization the second call reaches Graph first; with a broken gate the `vi.waitFor` times out
  it('runs the calls to one mailbox one after another', async () => {
    expect.hasAssertions()
    const gate = Promise.withResolvers<undefined>()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.ok }) })
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (graph.fetch.mock.calls.length === 0) {
        await gate.promise
      }
      return graph.fetch(input, init)
    })
    const provider = createMicrosoftProvider({ fetch })

    const first = provider.setRead(connection(), ['first'], true)
    const second = provider.setRead(connection(), ['second'], true)
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        'https://graph.microsoft.com/v1.0/$batch',
        expect.anything(),
      ),
    )
    gate.resolve(undefined)
    await Promise.all([first, second])

    expect(batchCalls(graph.calls).map(call => innerRequests(call.body)[0]?.url)).toStrictEqual([
      '/me/messages/first',
      '/me/messages/second',
    ])
  })

  it('refreshes the token once when marking as read is refused', async () => {
    expect.hasAssertions()
    const answers = [httpStatus.unauthorized, httpStatus.ok]
    const graph = fakeGraph({ answer: () => ({ status: answers.shift() ?? httpStatus.ok }) })
    const mailbox = connection()

    await createMicrosoftProvider({ fetch: graph.fetch }).setRead(mailbox, ['message'], true)

    expect(mailbox.accessToken).toHaveBeenLastCalledWith({ force: true })
    expect(batchCalls(graph.calls).map(call => call.headers.get('Authorization'))).toStrictEqual([
      'Bearer stored-token',
      'Bearer refreshed-token',
    ])
  })

  it('keeps calling a mailbox after a call to it failed', async () => {
    expect.hasAssertions()
    const statuses = [httpStatus.internalServerError]
    const graph = fakeGraph({
      status: () => statuses.shift(),
      answer: () => ({ status: httpStatus.ok }),
    })
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    const failing = provider.setRead(connection(), ['first'], true)
    const next = provider.setRead(connection(), ['second'], true)

    await expect(failing).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(next).resolves.toBeUndefined()
  })
})
