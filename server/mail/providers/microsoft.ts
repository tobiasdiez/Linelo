import type { Attachment, Message, Recipient } from '@microsoft/microsoft-graph-types'
import MailError from '../mail-error'
import commentHtml from './comment-html'
import graphClient from '../../microsoft/graph-client'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'
import microsoftMessages from './microsoft-messages'
import providerAuth from '../provider-auth'

/*
 * Microsoft Graph adapter: the only code that knows about Outlook. Plain
 * `fetch` against Graph v1.0 through the shared client, no SDK; Graph's own types
 * (`@microsoft/microsoft-graph-types`) for the fields it selects and reads.
 */

/** Message ids that survive moves between folders, so marking as read does not fail after an inbox rule ran. */
const IMMUTABLE_IDS = 'IdType="ImmutableId"'
const TEXT_BODIES = 'outlook.body-content-type="text"'
/** Headers of a JSON request about a message, which is addressed by its immutable id. */
const JSON_BY_IMMUTABLE_ID = { 'Content-Type': 'application/json', 'Prefer': IMMUTABLE_IDS }
/** Graph's error code for a token without the permission the call needs (here: `Mail.Send`). */
const ACCESS_DENIED = 'ErrorAccessDenied'
/** How many of a conversation's newest messages come with it. */
const CONVERSATION_SIZE = 25
/** Ids per request of the id listing, Graph's largest page of messages. */
const ID_PAGE = 1000
/** Next links followed at most to complete one page that Graph answered short. */
const MAX_PAGES = 10
/** Graph requires `$orderby` properties to appear first in `$filter`; this one matches every message. */
const ANY_TIME = 'receivedDateTime ge 1900-01-01T00:00:00Z'
const MESSAGE_FIELDS: readonly (keyof Message)[] = [
  'id',
  'conversationId',
  'parentFolderId',
  'subject',
  'from',
  'sender',
  'replyTo',
  'toRecipients',
  'ccRecipients',
  'sentDateTime',
  'receivedDateTime',
  'isRead',
  'isDraft',
  'uniqueBody',
  'body',
]
const LISTED_FIELDS: readonly (keyof Message)[] = ['id', 'conversationId', 'receivedDateTime']
/** What the ranking reads about a message: its envelope, marks and own text. */
const ENVELOPE_FIELDS: readonly (keyof Message)[] = [
  ...LISTED_FIELDS,
  'subject',
  'from',
  'sender',
  'toRecipients',
  'ccRecipients',
  'bodyPreview',
  'importance',
  'inferenceClassification',
  'flag',
  'uniqueBody',
  'body',
]
const SENT_FIELDS: readonly (keyof Message)[] = ['toRecipients', 'ccRecipients', 'sentDateTime']
const ATTACHMENT_FIELDS: readonly (keyof Attachment)[] = ['id', 'name', 'size', 'isInline']
/** Well-known folders whose messages are not shown in a thread. */
const HIDDEN_FOLDERS = ['deleteditems', 'junkemail']

/** The Graph client to share with the other adapters, or what to create one from. */
type Dependencies = { graph: Graph.Client } | { fetch: typeof fetch; timeoutMs?: number }

/** A Graph action on a message that sends mail, and its JSON body. */
interface MessageAction {
  messageId: string
  action: 'reply' | 'forward'
  body: Record<string, unknown>
}

interface Conversations {
  conversationIds: readonly string[]
  hiddenFolderIds: ReadonlySet<string>
}

const { query, said, assertAuthorized, assertSucceeded } = graphClient

/**
 * Unread inbox messages, newest first, received at or before `before` when given. The time
 * filter comes first, as Graph requires for `$orderby`, and continues a listing.
 */
function unreadInboxUrl(
  { limit, before }: Mail.Listing,
  fields: readonly (keyof Message)[],
  extra: Record<string, string> = {},
): string {
  const time = before ? `receivedDateTime le ${new Date(before).toISOString()}` : ANY_TIME
  return `/me/mailFolders/inbox/messages?${query({
    $filter: `${time} and isRead eq false`,
    $orderby: 'receivedDateTime desc',
    $select: fields.join(','),
    ...extra,
    $top: String(limit),
  })}`
}

/** The List-Unsubscribe header, as the one extended property expanded on each message. */
const LIST_UNSUBSCRIBE_EXPAND = `singleValueExtendedProperties($filter=id eq '${microsoftMessages.listUnsubscribe}')`

/** The `value` list of a collection; never an empty list for an answer that is not one. */
function assertList(body: unknown, what: string): unknown {
  if (!isRecord(body) || !Array.isArray(body.value)) {
    throw new MailError('unavailable', `Microsoft Graph listed ${what} without a \`value\` list`)
  }
  return body
}

/** How to read a collection: what to call it in errors, the headers, and how to parse a page. */
interface Collection<Entry> {
  what: string
  headers?: Record<string, string>
  parse: (body: unknown) => Entry[]
}

function conversationRequest(conversationId: string, index: number): Graph.BatchRequest {
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

function folderRequest(folder: string): Graph.BatchRequest {
  return {
    id: `folder-${folder}`,
    method: 'GET',
    url: `/me/mailFolders/${folder}?$select=id`,
    headers: { Prefer: IMMUTABLE_IDS },
  }
}

function readStateRequest(messageId: string, index: number, read: boolean): Graph.BatchRequest {
  return {
    id: `message-${index}`,
    method: 'PATCH',
    url: `/me/messages/${encodeURIComponent(messageId)}`,
    headers: JSON_BY_IMMUTABLE_ID,
    body: { isRead: read },
  }
}

function folderId(responses: ReadonlyMap<string, Graph.BatchResponse>, folder: string): string {
  const what = `find the ${folder} folder`
  const { body } = assertSucceeded(responses.get(`folder-${folder}`), what)
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new MailError('unavailable', `Microsoft Graph could not ${what} (no id)`)
  }
  return body.id
}

/**
 * The threads of the conversations, in their order, and the conversations with nothing
 * unread left. A conversation that failed to load is in neither and logged.
 */
function toThreads(
  { conversationIds, hiddenFolderIds }: Conversations,
  responses: ReadonlyMap<string, Graph.BatchResponse>,
): Mail.LoadedThreads {
  const loaded: Mail.LoadedThreads = { threads: [], finished: [] }
  let failures = 0
  for (const [index, conversationId] of conversationIds.entries()) {
    const response = responses.get(`conversation-${index}`)
    assertAuthorized(response)
    if (!response || !httpStatus.isSuccess(response.status)) {
      failures += 1
      console.warn('Loading a conversation from Microsoft Graph failed', response?.status)
      continue
    }
    const thread = microsoftMessages.toThread(
      microsoftMessages.parseList(response.body),
      hiddenFolderIds,
    )
    if (thread) {
      loaded.threads.push(thread)
    } else {
      loaded.finished.push(conversationId)
    }
  }
  // Never report an empty inbox when it just did not load
  if (failures > 0 && failures === conversationIds.length) {
    throw new MailError('unavailable', 'No conversation could be loaded from Microsoft Graph')
  }
  return loaded
}

/**
 * What a refused send means, by Graph's status and error code (401 is handled
 * before: refresh and try once more). 403 with `ErrorAccessDenied`: the permission
 * to send is missing or was revoked, which signing in again fixes; any other 403
 * (a send restriction) is not. A server error other than 503: Graph's front end may
 * have passed the mail on before failing, so it may be out. Anything else (400,
 * 404 for a message that is gone, 429, 503) was refused before sending.
 */
function sendFailure(status: number, code: string | undefined): Mail.ProviderErrorKind {
  if (status === httpStatus.forbidden) {
    return code === ACCESS_DENIED ? 'reconnect' : 'unavailable'
  }
  if (status >= httpStatus.internalServerError && status !== httpStatus.serviceUnavailable) {
    return 'uncertain'
  }
  return 'unavailable'
}

/** The error for a refused send: what it means, with what Graph said for the server log. */
function sendRefused(status: number, refusal: Graph.Refusal): Error {
  return new MailError(
    sendFailure(status, refusal.code),
    `Microsoft Graph refused a send with ${said(status, refusal)}`,
  )
}

function callerOf(connection: Mail.Connection, token: string): Graph.Caller {
  return { accountId: connection.account.id, token }
}

/** Participants as Graph's recipients. */
function recipients(list: readonly Inbox.Participant[]): Recipient[] {
  return list.map(({ name, email }) => ({ emailAddress: { name, address: email } }))
}

/** Creates the Microsoft Graph mail provider. */
function createMicrosoftProvider(dependencies: Dependencies): Mail.Provider {
  const { request, batch } =
    'graph' in dependencies ? dependencies.graph : graphClient.create(dependencies)
  /** Folder ids never change: looked up once per account (only a successful lookup is kept). */
  const hiddenFolders = new Map<string, ReadonlySet<string>>()

  /**
   * Up to `limit` entries of a collection. Graph may answer a page with fewer entries than
   * asked for and a next link, and an entry may fail to parse: the page is completed by
   * following next links. The end (`more: false`) is Graph's, never the count of entries.
   */
  async function collect<Entry>(
    caller: Graph.Caller,
    path: string,
    { limit, collection }: { limit: number; collection: Collection<Entry> },
  ): Promise<{ entries: Entry[]; more: boolean }> {
    const entries: Entry[] = []
    let next: string | undefined = path
    for (
      let page = 0;
      next !== undefined && entries.length < limit && page < MAX_PAGES;
      page += 1
    ) {
      // Each page names the next one
      // eslint-disable-next-line eslint/no-await-in-loop
      const body = await request(caller, next, { headers: collection.headers ?? {} })
      entries.push(...collection.parse(assertList(body, collection.what)))
      next = graphClient.nextPage(body)
    }
    return { entries: entries.slice(0, limit), more: next !== undefined }
  }

  /**
   * The ids of the newest `limit` unread messages: requests of 1,000, each continuing by time
   * from the last message of the one before (it repeats, and is counted once), which stays
   * right when mail is read while the listing runs. It ends when Graph has no more, or when a
   * request brings nothing new (more messages of one second than a request holds).
   */
  async function listIds(caller: Graph.Caller, limit: number): Promise<Mail.ListedMessage[]> {
    const found = new Map<string, Mail.ListedMessage>()
    const collection = {
      what: 'unread mail',
      headers: { Prefer: IMMUTABLE_IDS },
      parse: microsoftMessages.parseListed,
    }
    let listing: Mail.Listing | undefined = { limit: ID_PAGE }
    while (listing && found.size < limit) {
      // Each request continues where the last one ended
      // eslint-disable-next-line eslint/no-await-in-loop
      const { entries, more }: { entries: Mail.ListedMessage[]; more: boolean } = await collect(
        caller,
        unreadInboxUrl(listing, LISTED_FIELDS),
        { limit: ID_PAGE, collection },
      )
      const fresh = entries.filter(entry => !found.has(entry.id))
      for (const entry of fresh) {
        found.set(entry.id, entry)
      }
      const last = entries.at(-1)
      listing =
        more && fresh.length > 0 && last ? { limit: ID_PAGE, before: last.receivedAt } : undefined
    }
    return [...found.values()].slice(0, limit)
  }

  function listUnreadIds(
    connection: Mail.Connection,
    { limit }: { limit: number },
  ): Promise<Mail.ListedMessage[]> {
    return providerAuth.withToken(connection, token => listIds(callerOf(connection, token), limit))
  }

  async function listUnread(
    connection: Mail.Connection,
    listing: Mail.Listing,
  ): Promise<Mail.Envelope[]> {
    const url = unreadInboxUrl(listing, ENVELOPE_FIELDS, { $expand: LIST_UNSUBSCRIBE_EXPAND })
    const collection = {
      what: 'unread mail',
      headers: { Prefer: `${IMMUTABLE_IDS}, ${TEXT_BODIES}` },
      parse: microsoftMessages.parseEnvelopes,
    }
    const { entries } = await providerAuth.withToken(connection, token =>
      collect(callerOf(connection, token), url, { limit: listing.limit, collection }),
    )
    return entries
  }

  async function listSent(
    connection: Mail.Connection,
    { limit }: { limit: number },
  ): Promise<Mail.SentEnvelope[]> {
    const url = `/me/mailFolders/sentitems/messages?${query({
      $select: SENT_FIELDS.join(','),
      $orderby: 'sentDateTime desc',
      $top: String(limit),
    })}`
    const collection = { what: 'sent mail', parse: microsoftMessages.parseSent }
    const { entries } = await providerAuth.withToken(connection, token =>
      collect(callerOf(connection, token), url, { limit, collection }),
    )
    return entries
  }

  async function loadConversations(
    caller: Graph.Caller,
    conversationIds: readonly string[],
  ): Promise<Mail.LoadedThreads> {
    const cachedFolders = hiddenFolders.get(caller.accountId)
    const responses = await batch(caller, [
      ...(cachedFolders ? [] : HIDDEN_FOLDERS.map(folder => folderRequest(folder))),
      ...conversationIds.map((id, index) => conversationRequest(id, index)),
    ])
    let folders = cachedFolders
    if (!folders) {
      folders = new Set(HIDDEN_FOLDERS.map(folder => folderId(responses, folder)))
      hiddenFolders.set(caller.accountId, folders)
    }
    return toThreads({ conversationIds, hiddenFolderIds: folders }, responses)
  }

  async function loadThreads(
    connection: Mail.Connection,
    threadIds: readonly string[],
  ): Promise<Mail.LoadedThreads> {
    if (threadIds.length === 0) {
      return { threads: [], finished: [] }
    }
    return providerAuth.withToken(connection, token =>
      loadConversations(callerOf(connection, token), threadIds),
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

  /**
   * Posts a Graph action on the message that sends mail (`reply`, `forward`). A 401
   * is retried once with a refreshed token: Graph refused it before acting, so
   * nothing is sent twice.
   */
  async function sendMail(
    connection: Mail.Connection,
    { messageId, action, body }: MessageAction,
  ): Promise<void> {
    const path = `/me/messages/${encodeURIComponent(messageId)}/${action}`
    await providerAuth.withToken(connection, token =>
      request({ accountId: connection.account.id, token }, path, {
        method: 'POST',
        headers: JSON_BY_IMMUTABLE_ID,
        body,
        sendsMail: true,
        failure: sendRefused,
      }),
    )
  }

  /** Graph quotes the original below the comment; the recipients are explicit, so the mail is exactly what the composer showed. */
  async function reply(
    connection: Mail.Connection,
    { messageId, body, to, cc }: Mail.OutgoingReply,
  ): Promise<void> {
    await sendMail(connection, {
      messageId,
      action: 'reply',
      body: {
        comment: commentHtml(body),
        message: { toRecipients: recipients(to), ccRecipients: recipients(cc) },
      },
    })
  }

  /** Graph includes the original's attachments and puts the note above it. */
  async function forward(
    connection: Mail.Connection,
    { messageId, to, note }: Mail.OutgoingForward,
  ): Promise<void> {
    await sendMail(connection, {
      messageId,
      action: 'forward',
      body: { comment: commentHtml(note), toRecipients: recipients(to) },
    })
  }

  return {
    // `Mail.ReadWrite` to read and mark as read (the smallest scope that can), `Mail.Send` to send replies and forwards
    mailScopes: ['Mail.ReadWrite', 'Mail.Send'],
    listUnreadIds,
    listUnread,
    loadThreads,
    listSent,
    setRead,
    reply,
    forward,
  }
}

export default createMicrosoftProvider
