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
/** The extended property that holds the List-Unsubscribe header (PidTagListUnsubscribe). */
const LIST_UNSUBSCRIBE = 'String 0x1045'
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
  let current = text
  let next = current.replaceAll(pattern, '')
  while (next !== current) {
    current = next
    next = current.replaceAll(pattern, '')
  }
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

/** Who sent the message: `from`, else `sender`. */
function senderOf(value: Message): Inbox.Participant {
  return participant(value.from) ?? participant(value.sender) ?? UNKNOWN_SENDER
}

/** Only the part that is new in this message, the whole body where Graph has none; mail not written in Outlook may still quote history. */
function ownText(value: Message): string {
  return plainText(value.uniqueBody) || plainText(value.body)
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
    from: senderOf(value),
    replyTo: participants(value.replyTo),
    to: participants(value.toRecipients),
    cc: participants(value.ccRecipients),
    sentAt: value.sentDateTime ?? receivedAt,
    body: ownText(value),
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

/** The entries of a Graph collection response (`{ value: [...] }`) that are objects, which every message is. */
function entries(body: unknown): Message[] {
  return isRecord(body) && Array.isArray(body.value)
    ? body.value.filter(entry => isMessage(entry))
    : []
}

/** The messages in a Graph collection response. */
function parseList(body: unknown): GraphMessage[] {
  return entries(body)
    .map(entry => parse(entry))
    .filter(entry => entry !== undefined)
}

/** A message's id, conversation and time, or `undefined` when one is missing. */
function listedOf({
  id,
  conversationId,
  receivedDateTime,
}: Message): Mail.ListedMessage | undefined {
  return id && conversationId && receivedDateTime
    ? { id, threadId: conversationId, receivedAt: receivedDateTime }
    : undefined
}

/** Messages of a listing with their id, conversation and time; others are skipped. */
function parseListed(body: unknown): Mail.ListedMessage[] {
  return entries(body)
    .map(entry => listedOf(entry))
    .filter(entry => entry !== undefined)
}

/**
 * Whether the message has a List-Unsubscribe header. The listing asked for it, so a
 * message without the extended property has none.
 */
function unsubscribable(value: Message): boolean {
  return (value.singleValueExtendedProperties ?? []).some(
    property =>
      property.id?.toLowerCase() === LIST_UNSUBSCRIBE.toLowerCase() &&
      (property.value ?? '').trim().length > 0,
  )
}

function marks(value: Message): Mail.Marks {
  return {
    unsubscribable: unsubscribable(value),
    importance: value.importance ?? 'normal',
    flagged: value.flag?.flagStatus === 'flagged',
    sorting: value.inferenceClassification ?? undefined,
  }
}

/** One message of a judge page, or `undefined` when it lacks what the ranking needs. */
function parseEnvelope(value: Message): Mail.Envelope | undefined {
  const listed = listedOf(value)
  if (!listed) {
    return undefined
  }
  return {
    ...listed,
    from: senderOf(value),
    to: participants(value.toRecipients),
    cc: participants(value.ccRecipients),
    subject: value.subject ?? '',
    preview: value.bodyPreview ?? '',
    text: ownText(value),
    marks: marks(value),
  }
}

/** The envelopes of a judge page. */
function parseEnvelopes(body: unknown): Mail.Envelope[] {
  return entries(body)
    .map(entry => parseEnvelope(entry))
    .filter(entry => entry !== undefined)
}

/** Whom the sent messages of a listing went to; a message without a time is skipped. */
function parseSent(body: unknown): Mail.SentEnvelope[] {
  return entries(body).flatMap(value =>
    value.sentDateTime
      ? [
          {
            to: participants(value.toRecipients),
            cc: participants(value.ccRecipients),
            sentAt: value.sentDateTime,
          },
        ]
      : [],
  )
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

const microsoftMessages = {
  parseList,
  parseListed,
  parseEnvelopes,
  parseSent,
  toThread,
  listUnsubscribe: LIST_UNSUBSCRIBE,
}

export default microsoftMessages
