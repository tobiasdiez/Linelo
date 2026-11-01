import createInboxFixtures from '~/data/inbox-fixtures'
import currentUser from '~/data/current-user'

/** Fixed reference time, so stories and tests do not change from day to day. */
const STORY_NOW = new Date('2026-10-12T10:30:00Z')

const storyItems = createInboxFixtures(STORY_NOW)

interface QueueItemOverrides {
  id?: string
  subject?: string
  messages?: [Inbox.Message, ...Inbox.Message[]]
  whyShown?: string
  suggestions?: Inbox.Suggestion[]
}

function participant(name: string): Inbox.Participant {
  return { name, email: `${name.toLowerCase().replaceAll(' ', '.')}@northwind.co` }
}

function message(overrides: Partial<Inbox.Message> = {}): Inbox.Message {
  return {
    id: 'message-1',
    from: participant('Lena Hartmann'),
    to: [currentUser],
    cc: [],
    sentAt: STORY_NOW.toISOString(),
    body: 'Does Thursday work for the review call?',
    attachments: [],
    ...overrides,
  }
}

function queueItem({
  id = 'thread-1',
  subject = 'Vendor review',
  messages = [message({ id: `${id}-message` })],
  whyShown = 'A direct ask with a deadline.',
  suggestions = [],
}: QueueItemOverrides = {}): Inbox.QueueItem {
  return { thread: { id, subject, messages }, whyShown, suggestions }
}

/** A queue item from the app fixtures, with timestamps relative to `STORY_NOW`. */
function storyItem(threadId: string): Inbox.QueueItem {
  const item = storyItems.find(entry => entry.thread.id === threadId)
  if (!item) {
    throw new Error(`Unknown fixture thread: ${threadId}`)
  }
  return item
}

/** A message of a fixture thread; the latest one unless `index` says otherwise. */
function storyMessage(threadId: string, index = -1): Inbox.Message {
  const found = storyItem(threadId).thread.messages.at(index)
  if (!found) {
    throw new Error(`Fixture thread ${threadId} has no message at ${index}`)
  }
  return found
}

function isKind<Kind extends Inbox.Suggestion['kind']>(
  suggestion: Inbox.Suggestion,
  kind: Kind,
): suggestion is Extract<Inbox.Suggestion, { kind: Kind }> {
  return suggestion.kind === kind
}

/** A suggestion of a fixture thread, checked to be of the expected kind. */
function storySuggestion<Kind extends Inbox.Suggestion['kind']>(
  threadId: string,
  suggestionId: string,
  kind: Kind,
): Extract<Inbox.Suggestion, { kind: Kind }> {
  const found = storyItem(threadId).suggestions.find(entry => entry.id === suggestionId)
  if (!found || !isKind(found, kind)) {
    throw new Error(`Fixture thread ${threadId} has no ${kind} suggestion ${suggestionId}`)
  }
  return found
}

/** Builders for inbox data, shared by stories and tests. */
const inboxBuilders = {
  now: STORY_NOW,
  currentUser,
  participant,
  message,
  queueItem,
  storyItem,
  storyMessage,
  storySuggestion,
}

export default inboxBuilders
