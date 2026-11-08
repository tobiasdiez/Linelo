import type {
  Attachment,
  ItemBody,
  Message,
  NullableOption,
  Recipient,
} from '@microsoft/microsoft-graph-types'
import isRecord from '#shared/utils/is-record'

/** A Graph message, parsed into what the inbox needs plus what filtering and sorting need. */
interface GraphMessage {
  message: Inbox.Message
  conversationId: string
  folderId: string | undefined
  subject: string
  isDraft: boolean
  /** When the message reached the mailbox, for sorting. */
  receivedAt: string
}

const UNKNOWN_SENDER: Inbox.Participant = { name: 'Unknown sender', email: '' }
const REPLY_PREFIXES = /^(?:\s*(?:re|fw|fwd|aw|wg)\s*:)+\s*/i

/**
 * Graph's own shape for a message. Every property of the type is optional, as
 * Graph only sends what `$select` asked for, so an object is all there is to check.
 */
function isMessage(value: unknown): value is Message {
  return isRecord(value)
}

function participant(
  recipient: NullableOption<Recipient> | undefined,
): Inbox.Participant | undefined {
  const email = recipient?.emailAddress?.address ?? ''
  const name = recipient?.emailAddress?.name ?? ''
  return email || name ? { name: name || email, email } : undefined
}

function participants(recipients: NullableOption<Recipient[]> | undefined): Inbox.Participant[] {
  return (recipients ?? []).map(entry => participant(entry)).filter(entry => entry !== undefined)
}

/** Removes every match, again and again, so that removing one tag cannot leave another behind. */
function removeAll(text: string, pattern: RegExp): string {
  let previous: string
  let current = text
  do {
    previous = current
    current = current.replaceAll(pattern, '')
  } while (current !== previous)
  return current
}

/** Crude, for the rare body Graph sends as HTML despite asking for text. Vue renders it as text anyway. */
function htmlToText(html: string): string {
  const withoutCode = removeAll(html, /<(?<tag>style|script)[\s\S]*?<\/\k<tag>>/gi)
  const withBreaks = withoutCode
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<\/(?:p|div|li|tr|h\d)>/gi, '\n\n')
  return removeAll(withBreaks, /<[^>]+>/g)
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
}

/** An `itemBody` as plain text with `\n` line breaks. */
function plainText(body: NullableOption<ItemBody> | undefined): string {
  const content = body?.content ?? ''
  const plain = body?.contentType === 'html' ? htmlToText(content) : content
  return plain.replaceAll('\r\n', '\n').trim()
}

/** File attachments only: inline images are part of the body. */
function attachments(list: NullableOption<Attachment[]> | undefined): Inbox.Attachment[] {
  return (list ?? []).flatMap(({ id, name, size, isInline }) =>
    id && name && !isInline ? [{ id, name, sizeBytes: size ?? 0 }] : [],
  )
}

/** Parses one message of a Graph response, or `undefined` when it lacks what the inbox needs. */
function parse(value: Message): GraphMessage | undefined {
  const { id, conversationId } = value
  const receivedAt = value.receivedDateTime ?? value.sentDateTime
  if (!id || !conversationId || !receivedAt) {
    return undefined
  }
  const message: Inbox.Message = {
    id,
    from: participant(value.from) ?? participant(value.sender) ?? UNKNOWN_SENDER,
    to: participants(value.toRecipients),
    cc: participants(value.ccRecipients),
    sentAt: value.sentDateTime ?? receivedAt,
    // Only the part that is new in this message; mail not written in Outlook may still quote history
    body: plainText(value.uniqueBody) || plainText(value.body),
    attachments: attachments(value.attachments),
    unread: value.isRead === false,
  }
  return {
    message,
    conversationId,
    folderId: value.parentFolderId ?? undefined,
    subject: value.subject ?? '',
    isDraft: value.isDraft === true,
    receivedAt,
  }
}

/** The messages in a Graph collection response (`{ value: [...] }`). */
function parseList(body: unknown): GraphMessage[] {
  if (!isRecord(body) || !Array.isArray(body.value)) {
    return []
  }
  return body.value
    .filter(entry => isMessage(entry))
    .map(entry => parse(entry))
    .filter(entry => entry !== undefined)
}

/** The subject without reply and forward prefixes, which the thread view does not need. */
function cleanSubject(subject: string): string {
  return subject.replace(REPLY_PREFIXES, '').trim() || 'No subject'
}

/**
 * The thread of a conversation, with the conversation id as its id: drafts and
 * messages in hidden folders dropped, oldest to newest. `undefined` when nothing
 * unread is left to decide.
 */
function toThread(
  messages: readonly GraphMessage[],
  hiddenFolderIds: ReadonlySet<string>,
): Mail.Thread | undefined {
  const shown = messages
    .filter(entry => !entry.isDraft && !(entry.folderId && hiddenFolderIds.has(entry.folderId)))
    .toSorted((first, second) => Date.parse(first.receivedAt) - Date.parse(second.receivedAt))
  const [first, ...rest] = shown.map(entry => entry.message)
  const latestUnread = shown.findLast(entry => entry.message.unread)
  if (!first || !latestUnread) {
    return undefined
  }
  return {
    id: latestUnread.conversationId,
    subject: cleanSubject(latestUnread.subject),
    messages: [first, ...rest],
  }
}

const microsoftMessages = { parseList, toThread }

export default microsoftMessages
