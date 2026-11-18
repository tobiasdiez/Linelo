import type { Attachment, Message } from '@microsoft/microsoft-graph-types'
import MailError from '../mail-error'
import graphClient from '../../microsoft/graph-client'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'
import microsoftMessages from './microsoft-messages'
import providerAuth from '../provider-auth'

/*
 * Microsoft Graph adapter: the only code that knows about Outlook. Plain
 * `fetch` against Graph v1.0, no SDK; Graph's own types (`@microsoft/microsoft-graph-types`)
 * for the fields it selects and reads.
 */

/** Message ids that survive moves between folders, so marking as read does not fail after an inbox rule ran. */
const IMMUTABLE_IDS = 'IdType="ImmutableId"'
const TEXT_BODIES = 'outlook.body-content-type="text"'
/** How many of the newest unread inbox messages are looked at to find conversations. */
const UNREAD_SCAN_SIZE = 50
/** How many of a conversation's newest messages come with it. */
const CONVERSATION_SIZE = 25
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

/** The Graph client to share with the other adapters, or what to create one from. */
type Dependencies = { graph: Graph.Client } | { fetch: typeof fetch; timeoutMs?: number }

interface Conversations {
  conversationIds: readonly string[]
  hiddenFolderIds: ReadonlySet<string>
}

const { query, assertAuthorized, assertSucceeded } = graphClient

function unreadInboxUrl(): string {
  return `/me/mailFolders/inbox/messages?${query({
    $filter: `${ANY_TIME} and isRead eq false`,
    $orderby: 'receivedDateTime desc',
    $select: SCAN_FIELDS.join(','),
    $top: String(UNREAD_SCAN_SIZE),
  })}`
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
    headers: { 'Content-Type': 'application/json', 'Prefer': IMMUTABLE_IDS },
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

/** The threads of the conversations, in their order. A conversation that failed to load is skipped. */
function toThreads(
  { conversationIds, hiddenFolderIds }: Conversations,
  responses: ReadonlyMap<string, Graph.BatchResponse>,
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
function createMicrosoftProvider(dependencies: Dependencies): Mail.Provider {
  const { request, batch } =
    'graph' in dependencies ? dependencies.graph : graphClient.create(dependencies)
  /** Folder ids never change: looked up once per account (only a successful lookup is kept). */
  const hiddenFolders = new Map<string, ReadonlySet<string>>()

  async function unreadConversationIds(caller: Graph.Caller, limit: number): Promise<string[]> {
    const body = await request(caller, unreadInboxUrl(), {
      headers: { Prefer: IMMUTABLE_IDS },
    })
    const unread = microsoftMessages.parseList(body)
    return [...new Set(unread.map(entry => entry.conversationId))].slice(0, limit)
  }

  async function loadThreads(caller: Graph.Caller, limit: number): Promise<Mail.Thread[]> {
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
