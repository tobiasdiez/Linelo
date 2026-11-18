import MailError from '../mail/mail-error'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'
import providerAuth from '../mail/provider-auth'

/*
 * Plain `fetch` against Microsoft Graph v1.0, shared by the mail and calendar adapters.
 * One client instance serves every adapter, so calls to the same mailbox share one queue.
 */

const GRAPH_URL = 'https://graph.microsoft.com/v1.0'
/** Graph's limit of requests per JSON batch. */
const BATCH_SIZE = 20
/** A call to Graph that takes longer than this counts as Graph being unavailable. */
const DEFAULT_TIMEOUT_MS = 30_000
/** How many pages `list` follows when the caller does not say. */
const DEFAULT_MAX_PAGES = 5

interface Dependencies {
  fetch: typeof fetch
  timeoutMs?: number
}

/** A query string with `$` options kept literal and values encoded (`%20`, not `+`). */
function query(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
}

function chunks<Item>(items: readonly Item[], size: number): Item[][] {
  const result: Item[][] = []
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size))
  }
  return result
}

function parseBatchResponses(body: unknown): Graph.BatchResponse[] {
  if (!isRecord(body) || !Array.isArray(body.responses)) {
    throw new MailError('unavailable', 'Microsoft Graph sent an unexpected batch response')
  }
  return body.responses.flatMap(entry =>
    isRecord(entry) && typeof entry.id === 'string' && typeof entry.status === 'number'
      ? [{ id: entry.id, status: entry.status, body: entry.body }]
      : [],
  )
}

/** The entries of one page of a collection (`{ value: [...] }`). */
function values(body: unknown): unknown[] {
  return isRecord(body) && Array.isArray(body.value) ? body.value : []
}

/** The path of the next page of a collection, relative to Graph's root; `undefined` on the last page. */
function nextPage(body: unknown): string | undefined {
  const link = isRecord(body) ? body['@odata.nextLink'] : undefined
  return typeof link === 'string' && link.startsWith(`${GRAPH_URL}/`)
    ? link.slice(GRAPH_URL.length)
    : undefined
}

/** Throws when Graph refused the token for a request inside a batch, so it is refreshed. */
function assertAuthorized(response: Graph.BatchResponse | undefined): void {
  if (response?.status === httpStatus.unauthorized) {
    throw new providerAuth.UnauthorizedError()
  }
}

/** Throws for a failed response inside a batch: 401 to refresh the token, anything else as unavailable. */
function assertSucceeded(
  response: Graph.BatchResponse | undefined,
  what: string,
): Graph.BatchResponse {
  assertAuthorized(response)
  if (!response || !httpStatus.isSuccess(response.status)) {
    throw new MailError('unavailable', `Microsoft Graph could not ${what} (${response?.status})`)
  }
  return response
}

/** Parses a body that may be empty: Graph answers 204 (and some 202s) without one. */
function parseBody(text: string): unknown {
  return text.length === 0 ? undefined : JSON.parse(text)
}

/** Creates a Graph client. Share one instance between adapters, see the queue below. */
function createGraphClient({ fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: Dependencies): Graph.Client {
  /*
   * Outlook allows about four concurrent requests per mailbox, and one batch
   * already uses all four, so calls to the same mailbox run one after another.
   * Per call, not per operation: marking as read waits for at most one batch
   * of a background refill, not for all of it.
   */
  const mailboxQueues = new Map<string, Promise<unknown>>()

  async function exclusive<Result>(accountId: string, run: () => Promise<Result>): Promise<Result> {
    const turn = (mailboxQueues.get(accountId) ?? Promise.resolve()).then(run)
    // The next call waits for this one, whether it succeeds or fails
    mailboxQueues.set(
      accountId,
      turn.catch(() => undefined),
    )
    return turn
  }

  /** One call to Graph, body included, within the timeout; any failure to get an answer is `unavailable`. */
  async function call(token: string, path: string, init: Graph.RequestInit): Promise<Graph.Answer> {
    try {
      const response = await fetch(`${GRAPH_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        await response.body?.cancel()
        return { status: response.status, body: undefined }
      }
      return { status: response.status, body: parseBody(await response.text()) }
    } catch (error) {
      // No answer, no answer in time (a stalled body included), or no JSON
      throw new MailError('unavailable', 'Microsoft Graph did not answer', { cause: error })
    }
  }

  async function send(
    { accountId, token }: Graph.Caller,
    path: string,
    init: Graph.RequestInit = {},
  ): Promise<Graph.Answer> {
    const answer = await exclusive(accountId, () => call(token, path, init))
    if (answer.status === httpStatus.unauthorized) {
      throw new providerAuth.UnauthorizedError()
    }
    return answer
  }

  async function request(
    caller: Graph.Caller,
    path: string,
    init: Graph.RequestInit = {},
  ): Promise<unknown> {
    const { status, body } = await send(caller, path, init)
    if (!httpStatus.isSuccess(status)) {
      throw (
        init.failure?.(status) ?? new MailError('unavailable', `Microsoft Graph answered ${status}`)
      )
    }
    return body
  }

  async function batch(
    caller: Graph.Caller,
    requests: readonly Graph.BatchRequest[],
  ): Promise<Map<string, Graph.BatchResponse>> {
    const responses = new Map<string, Graph.BatchResponse>()
    for (const part of chunks(requests, BATCH_SIZE)) {
      // One batch at a time: each already runs four requests in the mailbox
      // eslint-disable-next-line eslint/no-await-in-loop
      const body = await request(caller, '/$batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { requests: part },
      })
      for (const response of parseBatchResponses(body)) {
        responses.set(response.id, response)
      }
    }
    return responses
  }

  async function list(
    caller: Graph.Caller,
    path: string,
    {
      headers = {},
      failure,
      maxPages = DEFAULT_MAX_PAGES,
    }: Pick<Graph.RequestInit, 'headers' | 'failure'> & { maxPages?: number } = {},
  ): Promise<unknown[]> {
    const entries: unknown[] = []
    let next: string | undefined = path
    for (let page = 0; next !== undefined && page < maxPages; page += 1) {
      // Each page names the next one
      // eslint-disable-next-line eslint/no-await-in-loop
      const body = await request(caller, next, { headers, failure })
      entries.push(...values(body))
      next = nextPage(body)
    }
    return entries
  }

  return { send, request, batch, list }
}

const graphClient = {
  create: createGraphClient,
  query,
  values,
  nextPage,
  assertAuthorized,
  assertSucceeded,
}

export default graphClient
