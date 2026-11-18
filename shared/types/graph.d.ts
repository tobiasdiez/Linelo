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

  /** Graph's answer: the status, and the parsed body of a successful one (`undefined` when it has none, as a 204). */
  interface Answer {
    status: number
    body: unknown
  }

  interface RequestInit {
    method?: string
    headers?: Record<string, string>
    body?: unknown
    /** What `request` and `list` throw for a status other than a success; `unavailable` unless given. */
    failure?: (status: number) => Error
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
    /** `send`, with anything but a success reported as `unavailable`. Resolves to the body. */
    request: (caller: Caller, path: string, init?: RequestInit) => Promise<unknown>
    /**
     * Runs the requests in batches of 20, one batch at a time. Graph answers 200 even
     * when parts fail, so each response is the caller's to check (see `assertSucceeded`).
     */
    batch: (
      caller: Caller,
      requests: readonly BatchRequest[],
    ) => Promise<Map<string, BatchResponse>>
    /** The entries of a collection, following `@odata.nextLink` for at most `maxPages` pages. */
    list: (
      caller: Caller,
      path: string,
      options?: Pick<RequestInit, 'headers' | 'failure'> & { maxPages?: number },
    ) => Promise<unknown[]>
  }
}
