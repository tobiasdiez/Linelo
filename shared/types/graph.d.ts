/**
 * The Microsoft Graph client shared by the mail and calendar adapters (`server/microsoft/graph-client.ts`).
 * Declared as a global namespace because the lint setup allows only default exports,
 * and kept in `shared` so the server's unit tests, which run without Nitro, see it too.
 */
declare namespace Graph {
  /** One request of a JSON batch; its `id` names the response. */
  interface BatchRequest {
    id: string
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    url: string
    headers: Record<string, string>
    body?: unknown
  }

  interface BatchResponse {
    id: string
    status: number
    body: unknown
  }

  /**
   * Graph's answer: the status; the parsed body of a success (`undefined` when it has
   * none, as a 204) or of a refusal (Graph's error); and Graph's id of the request, for its support.
   */
  interface Answer {
    status: number
    body: unknown
    requestId: string | undefined
  }

  /** What Graph said when it refused: its error code and message, as far as given, and its id of the request. */
  interface Refusal {
    code: string | undefined
    message: string | undefined
    requestId: string | undefined
  }

  interface RequestInit {
    method?: string
    headers?: Record<string, string>
    body?: unknown
    /** What `request` and `list` throw for a status other than a success; `unavailable` unless given. */
    failure?: (status: number, refusal: Refusal) => Error
    /**
     * The request sends mail: no answer (or none in time) means the mail may be out
     * (`uncertain`, not `unavailable`), and the body of a success is not read.
     */
    sendsMail?: boolean
  }

  /**
   * How to read a collection: what to call it in errors, the headers, how to parse a page,
   * and how many pages to read at most (5 unless given).
   */
  interface Collection<Entry> {
    what: string
    headers?: Record<string, string>
    parse: (body: unknown) => Entry[]
    maxPages?: number
  }

  /** The entries read of a collection, and whether Graph has more. */
  interface Collected<Entry> {
    entries: Entry[]
    more: boolean
  }

  /** One of several collections read at once: where it starts, and how many entries to read. */
  interface Reading {
    path: string
    limit: number
  }

  /** Who a Graph call is for: the mailbox, and the token to call with. */
  interface Caller {
    accountId: string
    token: string
  }

  interface Client {
    /**
     * One call within the mailbox's queue and the timeout. A refused token throws
     * `providerAuth.UnauthorizedError`, no answer `unavailable`; every other status is the caller's to judge.
     */
    send: (caller: Caller, path: string, init?: RequestInit) => Promise<Answer>
    /** `send`, with anything but a success reported as `unavailable` (or as `failure` says). Resolves to the body. */
    request: (caller: Caller, path: string, init?: RequestInit) => Promise<unknown>
    /**
     * Runs the requests in batches of 20, one batch at a time. Graph answers 200 even
     * when parts fail, so each response is the caller's to check (see `assertSucceeded`).
     */
    batch: (
      caller: Caller,
      requests: readonly BatchRequest[],
    ) => Promise<Map<string, BatchResponse>>
    /**
     * Up to `limit` entries of the collection at `path`, completed by next links when Graph
     * answers short or an entry does not parse. Fails `unavailable` on a page that is not a list.
     */
    collect: <Entry>(
      caller: Caller,
      path: string,
      options: { limit: number; collection: Collection<Entry> },
    ) => Promise<Collected<Entry>>
    /** `collect` for a collection whose first page is `body`, such as an answer inside a batch. */
    collectFrom: <Entry>(
      caller: Caller,
      body: unknown,
      options: { limit: number; collection: Collection<Entry> },
    ) => Promise<Collected<Entry>>
    /** `collect` for several collections at once: their first pages in batches, the rest by next links. */
    collectEach: <Entry, Read extends Reading>(
      caller: Caller,
      readings: readonly Read[],
      collection: Collection<Entry>,
    ) => Promise<(Read & Collected<Entry>)[]>
    /** The entries of a collection, following `@odata.nextLink` for at most `maxPages` pages. */
    list: (
      caller: Caller,
      path: string,
      options?: Pick<RequestInit, 'headers' | 'failure'> & { maxPages?: number },
    ) => Promise<unknown[]>
  }
}
