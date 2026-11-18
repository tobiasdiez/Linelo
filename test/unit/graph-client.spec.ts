import { describe, expect, it, vi } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import fakeGraphs from './fake-graph'
import graphClient from '#server/microsoft/graph-client'
import httpStatus from '#shared/utils/http-status'
import providerAuth from '#server/mail/provider-auth'

const GRAPH = fakeGraphs.url
const BATCH_LIMIT = 20
const caller = { accountId: 'account-1', token: 'token' }

function urlOf(input: Parameters<typeof globalThis.fetch>[0]): string {
  return input instanceof Request ? input.url : input.toString()
}

describe('graph client', () => {
  it('calls Graph with the token and a JSON body, and returns the parsed answer', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ id: 'event-1' }))
    const graph = graphClient.create({ fetch })

    const body = await graph.request(caller, '/me/events', {
      method: 'POST',
      body: { subject: 'Build night' },
    })

    expect(body).toStrictEqual({ id: 'event-1' })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe(`${GRAPH}/me/events`)
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: '{"subject":"Build night"}',
    })
  })

  it('takes an answer without a body as a success', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(undefined, { status: httpStatus.noContent }),
    )

    await expect(
      graphClient.create({ fetch }).send(caller, '/me/events/1', { method: 'DELETE' }),
    ).resolves.toStrictEqual({
      status: httpStatus.noContent,
      body: undefined,
      requestId: undefined,
    })
  })

  it('leaves other statuses to the caller, and reports them from request as unavailable', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response('{"error":{"code":"ErrorItemNotFound","message":"No such calendar."}}', {
          status: httpStatus.notFound,
          headers: { 'request-id': 'request-7' },
        }),
    )
    const graph = graphClient.create({ fetch })

    await expect(graph.send(caller, '/me/calendars')).resolves.toStrictEqual({
      status: httpStatus.notFound,
      body: { error: { code: 'ErrorItemNotFound', message: 'No such calendar.' } },
      requestId: 'request-7',
    })
    await expect(graph.request(caller, '/me/calendars')).rejects.toMatchObject({
      kind: 'unavailable',
      // What Graph said, for the server log, with its id of the request for its support
      message:
        'Microsoft Graph answered 404 ErrorItemNotFound: No such calendar. (request-id request-7)',
    })
  })

  it('reports a refusal without a readable error too', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('<html>Throttled</html>', { status: httpStatus.tooManyRequests }),
    )

    await expect(graphClient.create({ fetch }).request(caller, '/me')).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Microsoft Graph answered 429 (no code) (request-id unknown)',
    })
  })

  it('throws what the caller asks for on a failed status, from request and list', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(undefined, { status: httpStatus.forbidden }),
    )
    const graph = graphClient.create({ fetch })
    const failure = vi.fn<(status: number, refusal: Graph.Refusal) => Error>(
      status => new MailError('consent', `Refused (${status})`),
    )

    await expect(graph.request(caller, '/me/calendars', { failure })).rejects.toMatchObject({
      kind: 'consent',
    })
    await expect(graph.list(caller, '/me/calendars', { failure })).rejects.toMatchObject({
      kind: 'consent',
    })
    const refusal = { code: undefined, message: undefined, requestId: undefined }
    expect(failure.mock.calls).toStrictEqual([
      [httpStatus.forbidden, refusal],
      [httpStatus.forbidden, refusal],
    ])
    // Not passed on to fetch
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty('failure')
  })

  it('throws for a refused token, so the adapter refreshes it', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(undefined, { status: httpStatus.unauthorized }),
    )

    await expect(graphClient.create({ fetch }).send(caller, '/me')).rejects.toBeInstanceOf(
      providerAuth.UnauthorizedError,
    )
  })

  it('gives up after the timeout', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason)
          })
        }),
    )

    const failure = graphClient.create({ fetch, timeoutMs: 5 }).request(caller, '/me')

    await expect(failure).rejects.toBeInstanceOf(MailError)
    await expect(failure).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports a send that got no answer as unconfirmed: Graph may have sent the mail', async () => {
    expect.hasAssertions()
    const unreachable = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))
    const send = { method: 'POST', sendsMail: true }

    await expect(
      graphClient.create({ fetch: unreachable }).request(caller, '/me/messages/1/reply', send),
    ).rejects.toMatchObject({ kind: 'uncertain', message: 'Microsoft Graph did not answer' })
    await expect(
      graphClient.create({ fetch: unreachable }).request(caller, '/me/messages/1'),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('does not read the body of an accepted send, and reads it for anything else', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('<html>', { status: httpStatus.accepted }),
    )
    const graph = graphClient.create({ fetch })

    await expect(
      graph.request(caller, '/me/messages/1/reply', { method: 'POST', sendsMail: true }),
    ).resolves.toBeUndefined()
    await expect(graph.request(caller, '/me/messages/1')).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Microsoft Graph answered 202 without JSON',
    })
  })

  it('splits requests into batches of 20 and returns every response by id', async () => {
    expect.hasAssertions()
    const graph = fakeGraphs.graph(() => ({ status: httpStatus.noContent }))
    const requests = Array.from({ length: 21 }, (_, index) => ({
      id: `request-${index}`,
      method: 'DELETE' as const,
      url: `/me/events/${index}`,
      headers: {},
    }))

    const responses = await graphClient.create({ fetch: graph.fetch }).batch(caller, requests)

    expect(graph.batches().map(batch => batch.length)).toStrictEqual([BATCH_LIMIT, 1])
    expect(graph.batches()[1]?.[0]).toMatchObject({
      method: 'DELETE',
      url: new URL(`${GRAPH}/me/events/20`),
    })
    expect(responses.size).toBe(requests.length)
    expect(responses.get('request-20')).toStrictEqual({
      id: 'request-20',
      status: httpStatus.noContent,
      body: undefined,
    })
  })

  it('follows nextLink up to the page cap', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(async input => {
      const page = Number(new URL(urlOf(input)).searchParams.get('page') ?? '0')
      return Response.json({
        'value': [`entry-${page}`],
        '@odata.nextLink': `${GRAPH}/me/calendars?page=${page + 1}`,
      })
    })

    const entries = await graphClient.create({ fetch }).list(caller, '/me/calendars', {
      maxPages: 3,
    })

    expect(entries).toStrictEqual(['entry-0', 'entry-1', 'entry-2'])
    expect(fetch.mock.calls.map(([input]) => urlOf(input))).toStrictEqual([
      `${GRAPH}/me/calendars`,
      `${GRAPH}/me/calendars?page=1`,
      `${GRAPH}/me/calendars?page=2`,
    ])
  })

  it('does not follow a nextLink that leaves Graph', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ 'value': ['only'], '@odata.nextLink': 'https://example.com/next' }),
    )

    await expect(
      graphClient.create({ fetch }).list(caller, '/me/calendars'),
    ).resolves.toStrictEqual(['only'])
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${GRAPH}/me/calendars`, expect.anything())
  })

  // Without the serialization the second call reaches Graph first; with a broken gate the `vi.waitFor` times out
  it('runs the calls to one mailbox one after another, and other mailboxes in parallel', async () => {
    expect.hasAssertions()
    const gate = Promise.withResolvers<undefined>()
    const order: string[] = []
    const fetch = vi.fn<typeof globalThis.fetch>(async input => {
      const url = urlOf(input)
      if (url.endsWith('/first')) {
        await gate.promise
      }
      order.push(url.slice(GRAPH.length))
      return Response.json({})
    })
    const graph = graphClient.create({ fetch })

    const first = graph.request(caller, '/first')
    const second = graph.request(caller, '/second')
    const other = graph.request({ accountId: 'account-2', token: 'token' }, '/other')
    await other
    await vi.waitFor(() => expect(order).toStrictEqual(['/other']))
    gate.resolve(undefined)
    await Promise.all([first, second])

    expect(order).toStrictEqual(['/other', '/first', '/second'])
  })
})
