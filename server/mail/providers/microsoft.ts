import type { Attachment, Message } from '@microsoft/microsoft-graph-types'
import MailError from '../mail-error'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'
import microsoftMessages from './microsoft-messages'
import providerAuth from '../provider-auth'

/*
 * Microsoft Graph adapter: the only code that knows about Outlook. Plain
 * `fetch` against Graph v1.0, no SDK; Graph's own types (`@microsoft/microsoft-graph-types`)
 * for the fields it selects and reads.
 */

const GRAPH_URL = 'https://graph.microsoft.com/v1.0'
/** Message ids that survive moves between folders, so marking as read does not fail after an inbox rule ran. */
const IMMUTABLE_IDS = 'IdType="ImmutableId"'
const TEXT_BODIES = 'outlook.body-content-type="text"'
/** Graph's limit of requests per JSON batch. */
const BATCH_SIZE = 20
/** How many of the newest unread inbox messages are looked at to find conversations. */
const UNREAD_SCAN_SIZE = 50
/** How many of a conversation's newest messages come with it. */
const CONVERSATION_SIZE = 25
/** A call to Graph that takes longer than this counts as Graph being unavailable. */
const DEFAULT_TIMEOUT_MS = 30_000
/** Graph requires `$orderby` properties to appear first in `$filter`; this one matches every message. */
const ANY_TIME = 'receivedDateTime ge 1900-01-01T00:00:00Z'
const MESSAGE_FIELDS: readonly (keyof Message)[] = [
  'id',
  'conversationId',
  'parentFolderId',
  'subject',
  'from',
  'sender',
  'toRecipients',
  'ccRecipients',
  'sentDateTime',
  'receivedDateTime',
  'isRead',
  'isDraft',
  'uniqueBody',
  'body',
]
const SCAN_FIELDS: readonly (keyof Message)[] = ['id', 'conversationId', 'receivedDateTime']
const ATTACHMENT_FIELDS: readonly (keyof Attachment)[] = ['id', 'name', 'size', 'isInline']
/** Well-known folders whose messages are not shown in a thread. */
const HIDDEN_FOLDERS = ['deleteditems', 'junkemail']

interface BatchRequest {
  id: string
  method: 'GET' | 'PATCH'
  url: string
  headers: Record<string, string>
  body?: unknown
}

interface BatchResponse {
  id: string
  status: number
  body: unknown
}

/** Graph's answer: the status, and the parsed body of a successful one. */
interface GraphAnswer {
  status: number
  body: unknown
}

interface GraphRequestInit {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

interface Dependencies {
  fetch: typeof fetch
  timeoutMs?: number
}

/** Who a Graph call is for: the mailbox, and the token to call with. */
interface Caller {
  accountId: string
  token: string
}

interface Conversations {
  conversationIds: readonly string[]
  hiddenFolderIds: ReadonlySet<string>
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

function parseBatchResponses(body: unknown): BatchResponse[] {
  if (!isRecord(body) || !Array.isArray(body.responses)) {
    throw new MailError('unavailable', 'Microsoft Graph sent an unexpected batch response')
  }
  return body.responses.flatMap(entry =>
    isRecord(entry) && typeof entry.id === 'string' && typeof entry.status === 'number'
      ? [{ id: entry.id, status: entry.status, body: entry.body }]
      : [],
  )
}

function unreadInboxUrl(): string {
  return `/me/mailFolders/inbox/messages?${query({
    $filter: `${ANY_TIME} and isRead eq false`,
    $orderby: 'receivedDateTime desc',
    $select: SCAN_FIELDS.join(','),
    $top: String(UNREAD_SCAN_SIZE),
  })}`
}

function conversationRequest(conversationId: string, index: number): BatchRequest {
  const escaped = conversationId.replaceAll("'", "''")
  return {
    id: `conversation-${index}`,
    method: 'GET',
    url: `/me/messages?${query({
      // Across folders, so the user's own replies from Sent Items are part of the thread
      $filter: `${ANY_TIME} and conversationId eq '${escaped}'`,
      $orderby: 'receivedDateTime desc',
      $select: MESSAGE_FIELDS.join(','),
      $expand: `attachments($select=${ATTACHMENT_FIELDS.join(',')})`,
      $top: String(CONVERSATION_SIZE),
    })}`,
    headers: { Prefer: `${IMMUTABLE_IDS}, ${TEXT_BODIES}` },
  }
}

function folderRequest(folder: string): BatchRequest {
  return {
    id: `folder-${folder}`,
    method: 'GET',
    url: `/me/mailFolders/${folder}?$select=id`,
    headers: { Prefer: IMMUTABLE_IDS },
  }
}

function readStateRequest(messageId: string, index: number, read: boolean): BatchRequest {
  return {
    id: `message-${index}`,
    method: 'PATCH',
    url: `/me/messages/${encodeURIComponent(messageId)}`,
    headers: { 'Content-Type': 'application/json', 'Prefer': IMMUTABLE_IDS },
    body: { isRead: read },
  }
}

/** Throws when Graph refused the token for a request inside a batch, so it is refreshed. */
function assertAuthorized(response: BatchResponse | undefined): void {
  if (response?.status === httpStatus.unauthorized) {
    throw new providerAuth.UnauthorizedError()
  }
}

/** Throws for a failed response inside a batch: 401 to refresh the token, anything else as unavailable. */
function assertSucceeded(response: BatchResponse | undefined, what: string): BatchResponse {
  assertAuthorized(response)
  if (!response || !httpStatus.isSuccess(response.status)) {
    throw new MailError('unavailable', `Microsoft Graph could not ${what} (${response?.status})`)
  }
  return response
}

function folderId(responses: ReadonlyMap<string, BatchResponse>, folder: string): string {
  const what = `find the ${folder} folder`
  const { body } = assertSucceeded(responses.get(`folder-${folder}`), what)
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new MailError('unavailable', `Microsoft Graph could not ${what} (no id)`)
  }
  return body.id
}

/** The threads of the conversations, in their order. A conversation that failed to load is skipped. */
function toThreads(
  { conversationIds, hiddenFolderIds }: Conversations,
  responses: ReadonlyMap<string, BatchResponse>,
): Mail.Thread[] {
  let failures = 0
  const threads = conversationIds.flatMap((_, index) => {
    const response = responses.get(`conversation-${index}`)
    assertAuthorized(response)
    if (!response || !httpStatus.isSuccess(response.status)) {
      failures += 1
      console.warn('Loading a conversation from Microsoft Graph failed', response?.status)
      return []
    }
    const thread = microsoftMessages.toThread(
      microsoftMessages.parseList(response.body),
      hiddenFolderIds,
    )
    return thread ? [thread] : []
  })
  // Never report an empty inbox when it just did not load
  if (failures > 0 && failures === conversationIds.length) {
    throw new MailError('unavailable', 'No conversation could be loaded from Microsoft Graph')
  }
  return threads
}

/** Creates the Microsoft Graph mail provider. */
function createMicrosoftProvider({
  fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: Dependencies): Mail.Provider {
  /*
   * Outlook allows about four concurrent requests per mailbox, and one batch
   * already uses all four, so calls to the same mailbox run one after another.
   * Per call, not per operation: marking as read waits for at most one batch
   * of a background refill, not for all of it.
   */
  const mailboxQueues = new Map<string, Promise<unknown>>()
  /** Folder ids never change: looked up once per account (only a successful lookup is kept). */
  const hiddenFolders = new Map<string, ReadonlySet<string>>()

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
  async function send(token: string, path: string, init: GraphRequestInit): Promise<GraphAnswer> {
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
      const body: unknown = await response.json()
      return { status: response.status, body }
    } catch (error) {
      // No answer, no answer in time (a stalled body included), or no JSON
      throw new MailError('unavailable', 'Microsoft Graph did not answer', { cause: error })
    }
  }

  async function request(
    { accountId, token }: Caller,
    path: string,
    init: GraphRequestInit = {},
  ): Promise<unknown> {
    const { status, body } = await exclusive(accountId, () => send(token, path, init))
    if (status === httpStatus.unauthorized) {
      throw new providerAuth.UnauthorizedError()
    }
    if (!httpStatus.isSuccess(status)) {
      throw new MailError('unavailable', `Microsoft Graph answered ${status}`)
    }
    return body
  }

  /** Runs the requests in batches of 20. Graph answers 200 even when parts fail, so each response is checked on its own. */
  async function batch(
    caller: Caller,
    requests: readonly BatchRequest[],
  ): Promise<Map<string, BatchResponse>> {
    const responses = new Map<string, BatchResponse>()
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

  async function unreadConversationIds(caller: Caller, limit: number): Promise<string[]> {
    const body = await request(caller, unreadInboxUrl(), {
      headers: { Prefer: IMMUTABLE_IDS },
    })
    const unread = microsoftMessages.parseList(body)
    return [...new Set(unread.map(entry => entry.conversationId))].slice(0, limit)
  }

  async function loadThreads(caller: Caller, limit: number): Promise<Mail.Thread[]> {
    const { accountId } = caller
    const conversationIds = await unreadConversationIds(caller, limit)
    if (conversationIds.length === 0) {
      return []
    }
    const cachedFolders = hiddenFolders.get(accountId)
    const responses = await batch(caller, [
      ...(cachedFolders ? [] : HIDDEN_FOLDERS.map(folder => folderRequest(folder))),
      ...conversationIds.map((id, index) => conversationRequest(id, index)),
    ])
    let folders = cachedFolders
    if (!folders) {
      folders = new Set(HIDDEN_FOLDERS.map(folder => folderId(responses, folder)))
      hiddenFolders.set(accountId, folders)
    }
    return toThreads({ conversationIds, hiddenFolderIds: folders }, responses)
  }

  async function listUnreadThreads(
    connection: Mail.Connection,
    { limit }: { limit: number },
  ): Promise<Mail.Thread[]> {
    return providerAuth.withToken(connection, token =>
      loadThreads({ accountId: connection.account.id, token }, limit),
    )
  }

  async function setRead(
    connection: Mail.Connection,
    messageIds: readonly string[],
    read: boolean,
  ): Promise<void> {
    if (messageIds.length === 0) {
      return
    }
    const requests = messageIds.map((id, index) => readStateRequest(id, index, read))
    await providerAuth.withToken(connection, async token => {
      const responses = await batch({ accountId: connection.account.id, token }, requests)
      for (const { id } of requests) {
        const response = responses.get(id)
        // A message deleted in the meantime has nothing left to mark
        if (response?.status !== httpStatus.notFound) {
          assertSucceeded(response, `mark a message as ${read ? 'read' : 'unread'}`)
        }
      }
    })
  }

  return { mailScopes: ['Mail.ReadWrite'], listUnreadThreads, setRead }
}

export default createMicrosoftProvider
