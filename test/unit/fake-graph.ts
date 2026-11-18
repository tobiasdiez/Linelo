import isRecord from '#shared/utils/is-record'
import { vi } from 'vite-plus/test'

/*
 * A stand-in for Microsoft Graph behind `fetch`, for the specs of the Graph client and the
 * calendar adapter: it answers plain calls and every request inside a JSON batch, and records them.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'

/** A call as the fake sees it, plain or inside a batch. */
interface GraphRequest {
  method: string
  url: URL
  headers: Record<string, string>
  body: unknown
}

type Answer = (request: GraphRequest) => { status: number; body?: unknown }

function headersOf(value: unknown): Record<string, string> {
  if (value instanceof Headers) {
    return Object.fromEntries(value.entries())
  }
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, String(entry)]))
    : {}
}

function innerRequests(body: unknown): (GraphRequest & { id: string })[] {
  if (!isRecord(body) || !Array.isArray(body.requests)) {
    throw new Error('Not a batch body')
  }
  return body.requests.flatMap(entry =>
    isRecord(entry) && typeof entry.id === 'string' && typeof entry.url === 'string'
      ? [
          {
            id: entry.id,
            method: String(entry.method),
            url: new URL(`${GRAPH}${entry.url}`),
            headers: headersOf(entry.headers),
            body: entry.body,
          },
        ]
      : [],
  )
}

function respond({ status, body }: { status: number; body?: unknown }): Response {
  return body === undefined ? new Response(undefined, { status }) : Response.json(body, { status })
}

/**
 * A stand-in for Microsoft Graph: answers plain calls and every request inside a batch
 * with `answer`, records the calls, and fails whole calls with `status` when it says so.
 */
function fakeGraph(answer: Answer, { status }: { status?: () => number | undefined } = {}) {
  const calls: GraphRequest[] = []
  function responseTo(request: GraphRequest & { id: string }) {
    const { status: innerStatus, body: innerBody } = answer(request)
    return { id: request.id, status: innerStatus, body: innerBody }
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const call = { method: init?.method ?? 'GET', url, headers: headersOf(init?.headers), body }
    calls.push(call)
    const forced = status?.()
    if (forced !== undefined) {
      return respond({ status: forced, body: { error: { code: 'Forced' } } })
    }
    if (url.pathname.endsWith('/$batch')) {
      const responses = innerRequests(body).map(request => responseTo(request))
      return Response.json({ responses: responses.toReversed() })
    }
    return respond(answer(call))
  })
  function batches(): (GraphRequest & { id: string })[][] {
    return calls
      .filter(call => call.url.pathname.endsWith('/$batch'))
      .map(call => innerRequests(call.body))
  }
  return { fetch, calls, batches }
}

const fakeGraphs = { graph: fakeGraph, innerRequests, url: GRAPH }

export default fakeGraphs
