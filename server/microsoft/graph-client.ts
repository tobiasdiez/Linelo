import MailError from '../mail/mail-error'
import chunks from '#shared/utils/chunks'
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
/** A call to Graph that takes longer than this counts as Graph being unavailable (a send: as unconfirmed). */
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

/** Graph's JSON error (`{ error: { code, message } }`), as far as a refusal carries one, and its id of the request. */
function refusalOf({ body, requestId }: Graph.Answer): Graph.Refusal {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {}
  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    message: typeof error.message === 'string' ? error.message : undefined,
    requestId,
  }
}

/** What Graph said, for the server log: the status, its error code and message, and its id of the request for its support. */
function said(status: number, { code, message, requestId }: Graph.Refusal): string {
  const error = `${code ?? '(no code)'}${message ? `: ${message}` : ''}`
  return `${status} ${error} (request-id ${requestId ?? 'unknown'})`
}

/** Throws when Graph refused the token for a request inside a batch, so it is refreshed. */
function assertAuthorized(response: Graph.BatchResponse | undefined): void {
  if (response?.status === httpStatus.unauthorized) {
    throw new providerAuth.UnauthorizedError()
  }
}

/**
 * Throws for a failed response inside a batch: 401 to refresh the token, anything else as
 * unavailable, with what Graph said for the server log.
 */
function assertSucceeded(
  response: Graph.BatchResponse | undefined,
  what: string,
): Graph.BatchResponse {
  assertAuthorized(response)
  if (!response) {
    throw new MailError('unavailable', `Microsoft Graph could not ${what} (no answer in the batch)`)
  }
  if (!httpStatus.isSuccess(response.status)) {
    const refusal = refusalOf({ ...response, requestId: undefined })
    throw new MailError(
      'unavailable',
      `Microsoft Graph could not ${what}: ${said(response.status, refusal)}`,
    )
  }
  return response
}

/** The body of a collection page; never an empty list for an answer that is not one. */
function assertList(body: unknown, what: string): unknown {
  if (!isRecord(body) || !Array.isArray(body.value)) {
    throw new MailError('unavailable', `Microsoft Graph listed ${what} without a \`value\` list`)
  }
  return body
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

  /**
   * One call to Graph, body included, within the timeout. Any failure to get an
   * answer is `unavailable`, or `uncertain` for a send: Graph may have received it.
   * A refusal is read for Graph's error (for the log); a successful answer for its
   * JSON body, except a send's (`202 Accepted`, nothing to read).
   */
  async function call(token: string, path: string, init: Graph.RequestInit): Promise<Graph.Answer> {
    const response = await fetch(`${GRAPH_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((error: unknown) => {
      // No answer, or none in time
      const kind = init.sendsMail ? 'uncertain' : 'unavailable'
      throw new MailError(kind, 'Microsoft Graph did not answer', { cause: error })
    })
    const { status, ok } = response
    const requestId = response.headers.get('request-id') ?? undefined
    if (!ok) {
      const refusal: unknown = await response.json().catch(() => undefined)
      return { status, body: refusal, requestId }
    }
    if (init.sendsMail) {
      await response.body?.cancel().catch(() => undefined)
      return { status, body: undefined, requestId }
    }
    try {
      return { status, body: parseBody(await response.text()), requestId }
    } catch (error) {
      // Not JSON, or the body stalled until the timeout
      throw new MailError('unavailable', `Microsoft Graph answered ${status} without JSON`, {
        cause: error,
      })
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
    const answer = await send(caller, path, init)
    const { status, body } = answer
    if (httpStatus.isSuccess(status)) {
      return body
    }
    const refusal = refusalOf(answer)
    throw (
      init.failure?.(status, refusal) ??
      new MailError('unavailable', `Microsoft Graph answered ${said(status, refusal)}`)
    )
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

  /**
   * Up to `limit` entries of a collection whose first page is `body`. Graph may answer a
   * page with fewer entries than asked for and a next link, and an entry may fail to parse:
   * the entries are completed by following next links, for at most `maxPages` pages. Every
   * page must be a list. The end (`more: false`) is Graph's, never the count of entries.
   */
  async function collectFrom<Entry>(
    caller: Graph.Caller,
    body: unknown,
    { limit, collection }: { limit: number; collection: Graph.Collection<Entry> },
  ): Promise<Graph.Collected<Entry>> {
    const { what, headers = {}, parse, maxPages = DEFAULT_MAX_PAGES } = collection
    const entries = parse(assertList(body, what))
    let next = nextPage(body)
    for (let page = 1; next !== undefined && entries.length < limit && page < maxPages; page += 1) {
      // Each page names the next one
      // eslint-disable-next-line eslint/no-await-in-loop
      const nextBody = await request(caller, next, { headers })
      entries.push(...parse(assertList(nextBody, what)))
      next = nextPage(nextBody)
    }
    return { entries: entries.slice(0, limit), more: next !== undefined }
  }

  async function collect<Entry>(
    caller: Graph.Caller,
    path: string,
    options: { limit: number; collection: Graph.Collection<Entry> },
  ): Promise<Graph.Collected<Entry>> {
    const body = await request(caller, path, { headers: options.collection.headers ?? {} })
    return collectFrom(caller, body, options)
  }

  async function collectEach<Entry, Read extends Graph.Reading>(
    caller: Graph.Caller,
    readings: readonly Read[],
    collection: Graph.Collection<Entry>,
  ): Promise<(Read & Graph.Collected<Entry>)[]> {
    const responses = await batch(
      caller,
      readings.map(({ path }, index) => ({
        id: `reading-${index}`,
        method: 'GET',
        url: path,
        headers: collection.headers ?? {},
      })),
    )
    const what = `list ${collection.what}`
    return Promise.all(
      readings.map(async (reading, index) => {
        const { body } = assertSucceeded(responses.get(`reading-${index}`), what)
        const collected = await collectFrom(caller, body, { limit: reading.limit, collection })
        return { ...reading, ...collected }
      }),
    )
  }

  return { send, request, batch, list, collect, collectFrom, collectEach }
}

const graphClient = {
  create: createGraphClient,
  query,
  values,
  nextPage,
  said,
  assertAuthorized,
  assertSucceeded,
}

export default graphClient
