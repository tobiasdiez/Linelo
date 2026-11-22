import type { Attachment, Message, Recipient } from '@microsoft/microsoft-graph-types'
import MailError from '../mail-error'
import commentHtml from './comment-html'
import graphClient from '../../microsoft/graph-client'
import httpStatus from '#shared/utils/http-status'
import microsoftFolders from './microsoft-folders'
import microsoftMessages from './microsoft-messages'
import providerAuth from '../provider-auth'
import uniqueById from '#shared/utils/unique-by-id'

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
/**
 * A judge page reuses the folders with unread mail found this recently instead of walking
 * the folder tree for every page. A folder whose first unread mail arrived since is read
 * from the next walk on, which the list step does every time.
 */
const FOLDERS_FRESH_MS = 60_000
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

/** A listing of one folder's unread mail, by the folder's id. */
type FolderListing = Mail.Listing & {
  folder: string
  /** Only messages received at or after this time (ISO 8601). */
  after?: string | undefined
}

/** A folder's unread messages as ids, as the first round of a judge page lists them. */
type FolderIds = Graph.Collected<Mail.ListedMessage> & { folder: string }

/**
 * Unread messages of a folder, newest first, received at or before `before` and at or after
 * `after` when given. The time filter comes first, as Graph requires for `$orderby`, and
 * continues a listing.
 */
function unreadUrl(
  { folder, limit, before, after }: FolderListing,
  fields: readonly (keyof Message)[],
  extra: Record<string, string> = {},
): string {
  const bounds = [
    ...(before ? [`receivedDateTime le ${new Date(before).toISOString()}`] : []),
    ...(after ? [`receivedDateTime ge ${new Date(after).toISOString()}`] : []),
  ]
  const time = bounds.length > 0 ? bounds.join(' and ') : ANY_TIME
  return `/me/mailFolders/${encodeURIComponent(folder)}/messages?${query({
    $filter: `${time} and isRead eq false`,
    $orderby: 'receivedDateTime desc',
    $select: fields.join(','),
    ...extra,
    $top: String(limit),
  })}`
}

/** The List-Unsubscribe header, as the one extended property expanded on each message. */
const LIST_UNSUBSCRIBE_EXPAND = `singleValueExtendedProperties($filter=id eq '${microsoftMessages.listUnsubscribe}')`

const LISTED: Graph.Collection<Mail.ListedMessage> = {
  what: 'unread mail',
  headers: { Prefer: IMMUTABLE_IDS },
  parse: microsoftMessages.parseListed,
  maxPages: MAX_PAGES,
}
const ENVELOPES: Graph.Collection<Mail.Envelope> = {
  what: 'unread mail',
  headers: { Prefer: `${IMMUTABLE_IDS}, ${TEXT_BODIES}` },
  parse: microsoftMessages.parseEnvelopes,
  maxPages: MAX_PAGES,
}
const SENT: Graph.Collection<Mail.SentEnvelope> = {
  what: 'sent mail',
  parse: microsoftMessages.parseSent,
  maxPages: MAX_PAGES,
}

/** Messages of several folders as one listing: each message once, newest first. */
function newestFirst<Entry extends Mail.ListedMessage>(entries: readonly Entry[]): Entry[] {
  return uniqueById(entries).toSorted(
    (first, second) => Date.parse(second.receivedAt) - Date.parse(first.receivedAt),
  )
}

/**
 * Where a judge page lies, from the newest ids of each folder: the folders that hold its
 * `limit` newest messages, and when the oldest of them was received. No folders when there
 * are no messages.
 */
function pageScope(
  listings: readonly FolderIds[],
  limit: number,
): { folders: string[]; after: string | undefined } {
  const onPage = newestFirst(
    listings.flatMap(({ folder, entries }) => entries.map(entry => ({ ...entry, folder }))),
  ).slice(0, limit)
  return {
    folders: [...new Set(onPage.map(entry => entry.folder))],
    after: onPage.at(-1)?.receivedAt,
  }
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

function readStateRequest(messageId: string, index: number, read: boolean): Graph.BatchRequest {
  return {
    id: `message-${index}`,
    method: 'PATCH',
    url: `/me/messages/${encodeURIComponent(messageId)}`,
    headers: JSON_BY_IMMUTABLE_ID,
    body: { isRead: read },
  }
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
  const graph = 'graph' in dependencies ? dependencies.graph : graphClient.create(dependencies)
  const { request, batch, collect, collectEach } = graph
  const folderFinder = microsoftFolders.create(graph)

  /**
   * The ids of the newest `limit` unread messages of a folder, from its first request on:
   * requests of 1,000, each continuing by time from the last message of the one before (it
   * repeats, and is counted once), which stays right when mail is read while the listing
   * runs. It ends when Graph has no more, or when a request brings nothing new (more
   * messages of one second than a request holds).
   */
  async function listFolderIds(
    caller: Graph.Caller,
    first: FolderIds,
    limit: number,
  ): Promise<Mail.ListedMessage[]> {
    const found = new Map<string, Mail.ListedMessage>()
    /** Records what a request read, and returns the listing that continues after it, if one is due. */
    function record({
      entries,
      more,
    }: Graph.Collected<Mail.ListedMessage>): Mail.Listing | undefined {
      const fresh = entries.filter(entry => !found.has(entry.id))
      for (const entry of fresh) {
        found.set(entry.id, entry)
      }
      const last = entries.at(-1)
      return more && fresh.length > 0 && last && found.size < limit
        ? { limit: ID_PAGE, before: last.receivedAt }
        : undefined
    }
    let listing = record(first)
    while (listing) {
      const path = unreadUrl({ ...listing, folder: first.folder }, LISTED_FIELDS)
      // Each request continues where the last one ended
      // eslint-disable-next-line eslint/no-await-in-loop
      const read = await collect(caller, path, { limit: ID_PAGE, collection: LISTED })
      listing = record(read)
    }
    return [...found.values()].slice(0, limit)
  }

  /** The ids of the newest `limit` unread messages across the folders with unread mail, found anew. */
  async function listIds(caller: Graph.Caller, limit: number): Promise<Mail.ListedMessage[]> {
    const folders = await folderFinder.unreadFolderIds(caller, { maxAgeMs: 0 })
    const firsts = await collectEach(
      caller,
      folders.map(folder => ({
        folder,
        path: unreadUrl({ folder, limit: ID_PAGE }, LISTED_FIELDS),
        limit: ID_PAGE,
      })),
      LISTED,
    )
    const perFolder = await Promise.all(firsts.map(first => listFolderIds(caller, first, limit)))
    return newestFirst(perFolder.flat()).slice(0, limit)
  }

  function listUnreadIds(
    connection: Mail.Connection,
    { limit }: { limit: number },
  ): Promise<Mail.ListedMessage[]> {
    return providerAuth.withToken(connection, token => listIds(callerOf(connection, token), limit))
  }

  /**
   * The folders a judge page reads, and from when. One folder holds the whole page; with
   * several, the newest ids of each (cheap to list) say which folders hold the page's
   * messages and when its oldest message was received, so texts are read only for those.
   */
  async function scopeOf(
    caller: Graph.Caller,
    listing: Mail.Listing,
  ): Promise<{ folders: string[]; after: string | undefined }> {
    const folders = await folderFinder.unreadFolderIds(caller, { maxAgeMs: FOLDERS_FRESH_MS })
    if (folders.length <= 1) {
      return { folders, after: undefined }
    }
    const listings = await collectEach(
      caller,
      folders.map(folder => ({
        folder,
        path: unreadUrl({ ...listing, folder }, LISTED_FIELDS),
        limit: listing.limit,
      })),
      LISTED,
    )
    return pageScope(listings, listing.limit)
  }

  /**
   * A judge page across the folders with unread mail. Its texts are read by time, from its
   * oldest message on, not by a count per folder: a message read in between then makes the
   * page shorter, and the page still holds every unread message from its oldest one up to
   * `before`, which the sync relies on.
   */
  async function readPage(caller: Graph.Caller, listing: Mail.Listing): Promise<Mail.Envelope[]> {
    const { folders, after } = await scopeOf(caller, listing)
    const pages = await collectEach(
      caller,
      folders.map(folder => ({
        path: unreadUrl({ ...listing, folder, after }, ENVELOPE_FIELDS, {
          $expand: LIST_UNSUBSCRIBE_EXPAND,
        }),
        limit: listing.limit,
      })),
      ENVELOPES,
    )
    return newestFirst(pages.flatMap(page => page.entries)).slice(0, listing.limit)
  }

  function listUnread(
    connection: Mail.Connection,
    listing: Mail.Listing,
  ): Promise<Mail.Envelope[]> {
    return providerAuth.withToken(connection, token =>
      readPage(callerOf(connection, token), listing),
    )
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
    const { entries } = await providerAuth.withToken(connection, token =>
      collect(callerOf(connection, token), url, { limit, collection: SENT }),
    )
    return entries
  }

  /** The threads of the conversations; the hidden folders are looked up in the same batch until known. */
  async function loadConversations(
    caller: Graph.Caller,
    conversationIds: readonly string[],
  ): Promise<Mail.LoadedThreads> {
    const responses = await batch(caller, [
      ...folderFinder.lookups(caller.accountId, HIDDEN_FOLDERS),
      ...conversationIds.map((id, index) => conversationRequest(id, index)),
    ])
    const hiddenFolderIds = folderFinder.wellKnownIds(caller.accountId, HIDDEN_FOLDERS, responses)
    return toThreads({ conversationIds, hiddenFolderIds }, responses)
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
