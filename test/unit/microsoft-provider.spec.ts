import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import calendarTime from '#shared/utils/calendar-time'
import conversations from './fixtures/graph-conversations.json'
import createMicrosoftProvider from '#server/mail/providers/microsoft'
import envelopes from './fixtures/graph-unread-envelopes.json'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'
import mailFakes from './mail-fakes'
import sentItems from './fixtures/graph-sent-items.json'
import unreadInbox from './fixtures/graph-unread-inbox.json'

interface GraphCall {
  method: string
  url: URL
  headers: Headers
  body: unknown
}

interface InnerRequest {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

type InnerAnswer = (request: InnerRequest) => { status: number; body?: unknown }

const BATCH_LIMIT = 20
const IMMUTABLE_IDS = /IdType="ImmutableId"/
const TEXT_BODIES = 'outlook.body-content-type="text"'
const VENDOR = 'AAQkAGI2-conversation-vendor'
const NEWSLETTER = 'AAQkAGI2-conversation-newsletter'
/** Answered with 503 inside the batch. */
const STAGING = 'AAQkAGI2-conversation-staging'
const ID_PREFIX = 'AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0A-'
const LIST_PAGE = 1000
const JUDGE_PAGE = 50
const SENT_PAGE = 500

function json(body: unknown, status: number = httpStatus.ok): Response {
  return Response.json(body, { status })
}

function innerRequests(body: unknown): InnerRequest[] {
  if (!isRecord(body) || !Array.isArray(body.requests)) {
    throw new Error('Not a batch body')
  }
  return body.requests.flatMap(entry => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.method !== 'string' ||
      typeof entry.url !== 'string' ||
      !isRecord(entry.headers)
    ) {
      return []
    }
    const headers = Object.fromEntries(
      Object.entries(entry.headers).map(([key, value]) => [key, String(value)]),
    )
    return [{ id: entry.id, method: entry.method, url: entry.url, headers, body: entry.body }]
  })
}

const GRAPH = 'https://graph.microsoft.com/v1.0'
/** Entries per page when a request does not say. */
const GRAPH_DEFAULT_PAGE = 10

/** The URL of a request inside a batch. */
function urlOf(request: Pick<InnerRequest, 'url'>): URL {
  return new URL(`${GRAPH}${request.url}`)
}

/** The well-known folder a request looks up (`/me/mailFolders/inbox`), or `undefined` for another request. */
function wellKnownName(url: URL): string | undefined {
  return /\/me\/mailFolders\/(?<name>\w+)$/.exec(url.pathname)?.groups?.name
}

/** The folder whose child folders a request lists, or `undefined` for another request. */
function childFoldersParent(url: URL): string | undefined {
  const id = /\/mailFolders\/(?<id>[^/]+)\/childFolders$/.exec(url.pathname)?.groups?.id
  return id === undefined ? undefined : decodeURIComponent(id)
}

/** The folder whose unread mail a request lists, or `undefined` for another request. */
function listedFolder(url: URL): string | undefined {
  const id = /\/mailFolders\/(?<id>[^/]+)\/messages$/.exec(url.pathname)?.groups?.id
  return id === undefined ? undefined : decodeURIComponent(id)
}

/**
 * A page of `entries` as Graph answers one: from `$skip`, at most `$top` and `pageSize`
 * entries, with a next link while more remain.
 */
function pageOf(entries: readonly unknown[], url: URL, pageSize = Number.POSITIVE_INFINITY) {
  const top = Number(url.searchParams.get('$top') ?? GRAPH_DEFAULT_PAGE)
  const skip = Number(url.searchParams.get('$skip') ?? 0)
  const page = entries.slice(skip, skip + Math.min(top, pageSize))
  const next = new URL(url)
  next.searchParams.set('$skip', String(skip + page.length))
  return skip + page.length < entries.length
    ? { 'value': page, '@odata.nextLink': next.href }
    : { value: page }
}

/** The fixture answer for an inner request: a well-known folder or a conversation. */
function fixtureAnswer(request: InnerRequest): { status: number; body?: unknown } {
  const url = urlOf(request)
  const folder = wellKnownName(url)
  const conversation = /conversationId eq '(?<id>[^']+)'/.exec(
    url.searchParams.get('$filter') ?? '',
  )?.groups?.id
  const key = folder ? `folder-${folder}` : (conversation ?? '')
  const entries: Record<string, { status: number; body?: unknown }> = conversations
  return entries[key] ?? { status: httpStatus.notFound }
}

/** A mail folder of the fake mailbox, with its unread count and the folders inside it. */
interface FakeFolder {
  id: string
  unread: number
  children?: FakeFolder[]
  /** Graph's type, for a derived one such as a search folder. */
  type?: string
}

const INBOX = 'folder-inbox'
/** The ids of Deleted Items and Junk, as the fixtures answer their well-known lookups. */
const DELETED_ITEMS = 'folder-deleted-items'
const JUNK = 'folder-junk'
/** The default mailbox: unread mail in the Inbox, Deleted Items and Junk, so only the Inbox is read. */
const INBOX_ONLY: FakeFolder[] = [
  { id: INBOX, unread: 3 },
  { id: DELETED_ITEMS, unread: 5 },
  { id: JUNK, unread: 2 },
]

/** Graph's answer to the child folders of a folder of `tree` (`msgfolderroot`: the top level). */
function childFoldersAnswer(tree: readonly FakeFolder[]) {
  function find(folders: readonly FakeFolder[], id: string): FakeFolder | undefined {
    for (const folder of folders) {
      const found = folder.id === id ? folder : find(folder.children ?? [], id)
      if (found) {
        return found
      }
    }
    return undefined
  }
  return (url: URL): unknown => {
    const parent = childFoldersParent(url)
    const children = parent === 'msgfolderroot' ? tree : (find(tree, parent ?? '')?.children ?? [])
    const entries = children.map(folder => ({
      // Left out of the JSON when undefined, as Graph leaves it out for a plain mail folder
      '@odata.type': folder.type,
      'id': folder.id,
      'childFolderCount': folder.children?.length ?? 0,
      'unreadItemCount': folder.unread,
    }))
    return pageOf(entries, url)
  }
}

/** The fixture answer for a listing: Sent Items, a judge page (with texts), or the ids of unread mail. */
function listAnswer(url: URL): unknown {
  if (url.pathname.endsWith('/sentitems/messages')) {
    return sentItems
  }
  return url.searchParams.get('$select')?.includes('uniqueBody') ? envelopes : unreadInbox
}

/**
 * Graph's answer to a send (`reply`, `forward`): `202 Accepted` without a body, or
 * for a failure its JSON error with the request id.
 */
function sendAnswer(status: number = httpStatus.accepted, code = 'Forced'): Response {
  if (httpStatus.isSuccess(status)) {
    return new Response(undefined, { status })
  }
  return Response.json(
    { error: { code, message: 'Refused by the test' } },
    { status, headers: { 'request-id': 'request-7' } },
  )
}

interface FakeGraphOptions {
  /** The answer to a listing: any GET outside a batch, and the unread mail of a folder inside one. */
  list?: (url: URL) => unknown
  /** The mail folders below the root. */
  folders?: readonly FakeFolder[]
  /** The answer to any other request inside a batch. */
  answer?: InnerAnswer
  /** Every answer, when set: a status Graph refuses with. */
  status?: () => number | undefined
  /** The answer to a send (any other POST than a batch). */
  answerSend?: () => Response
}

/**
 * A stand-in for Microsoft Graph: answers listings, JSON batches and sends
 * (`202 Accepted` unless `answerSend` says otherwise), and records every call.
 */
function fakeGraph({
  list = listAnswer,
  folders = INBOX_ONLY,
  answer = fixtureAnswer,
  status,
  answerSend = () => sendAnswer(),
}: FakeGraphOptions = {}) {
  // Fresh spies for every test that builds a fake
  vi.restoreAllMocks()
  const warn = vi.spyOn(console, 'warn').mockReturnValue()
  const calls: GraphCall[] = []
  const childFolders = childFoldersAnswer(folders)
  function answerInner(request: InnerRequest): { status: number; body?: unknown } {
    const url = urlOf(request)
    if (childFoldersParent(url) !== undefined) {
      return { status: httpStatus.ok, body: childFolders(url) }
    }
    return listedFolder(url) === undefined
      ? answer(request)
      : { status: httpStatus.ok, body: list(url) }
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const call = { method: init?.method ?? 'GET', url, headers: new Headers(init?.headers), body }
    calls.push(call)
    const forced = status?.()
    if (forced !== undefined) {
      return json({ error: { code: 'Forced' } }, forced)
    }
    if (url.pathname.endsWith('/$batch')) {
      const responses = innerRequests(body).map(request => {
        const { status: innerStatus, body: innerBody } = answerInner(request)
        return { id: request.id, status: innerStatus, body: innerBody }
      })
      return json({ responses: responses.toReversed() })
    }
    if (call.method === 'POST') {
      return answerSend()
    }
    return json(childFoldersParent(url) === undefined ? list(url) : childFolders(url))
  })
  return { fetch, calls, warn }
}

const { connection } = mailFakes
const MS_PER_MINUTE = calendarTime.MILLISECONDS_PER_MINUTE
const MANY_UNREAD = 2500
const MAX_LISTED = 20_000
const CAPPED = 1500
const SHORT_PAGE = 30
const SHORT_IDS = 1000
const ALL_SHORT_IDS = 70
const TWO_PAGES = 120
const LATEST = Date.parse('2026-10-12T10:00:00Z')

/** `count` unread messages with ids and times only, one a minute, newest first. */
function generated(count: number): Record<string, string>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    conversationId: `c${index}`,
    receivedDateTime: new Date(LATEST - index * MS_PER_MINUTE).toISOString(),
  }))
}

/**
 * A folder of these unread messages, newest first, as Graph lists it: it honours the time
 * filter (`receivedDateTime le …` and `ge …`), `$top` and `$skip`, answers at most
 * `pageSize` entries at once (fewer than asked when it decides so), and names the next page
 * while more remain.
 */
function pagedFolder(
  messages: Record<string, string>[],
  { pageSize = Number.POSITIVE_INFINITY } = {},
) {
  function answer(url: URL): unknown {
    const filter = url.searchParams.get('$filter') ?? ''
    const before = /receivedDateTime le (?<time>\S+)/.exec(filter)?.groups?.time
    const after = /receivedDateTime ge (?<time>\S+)/.exec(filter)?.groups?.time
    const matching = messages.filter(message => {
      const time = Date.parse(message.receivedDateTime ?? '')
      return (
        (before === undefined || time <= Date.parse(before)) &&
        (after === undefined || time >= Date.parse(after))
      )
    })
    return pageOf(matching, url, pageSize)
  }
  return {
    answer,
    /** The time of the message at `index`, as a filter names it. */
    timeOf: (index: number) => new Date(LATEST - index * MS_PER_MINUTE).toISOString(),
    /** The `$skip` of each call that reads `count` entries through next links. */
    skipsUpTo: (count: number) =>
      Array.from({ length: Math.ceil(count / pageSize) }, (_, page) =>
        page === 0 ? undefined : String(page * pageSize),
      ),
  }
}

function batchCalls(calls: GraphCall[]): GraphCall[] {
  return calls.filter(call => call.url.pathname.endsWith('/$batch'))
}

/** The `$select` of a call, as a list. */
function selected(call: Pick<GraphCall, 'url'> | undefined): string[] {
  return call?.url.searchParams.get('$select')?.split(',') ?? []
}

/** A request as Graph received it, inside a batch or not. */
interface SentRequest {
  url: URL
  prefer: string | undefined
}

/** Every request, those inside batches one by one, in the order they were made. */
function requestsOf(calls: readonly GraphCall[]): SentRequest[] {
  return calls.flatMap(call =>
    call.url.pathname.endsWith('/$batch')
      ? innerRequests(call.body).map(request => ({
          url: urlOf(request),
          prefer: request.headers.Prefer,
        }))
      : [{ url: call.url, prefer: call.headers.get('Prefer') ?? undefined }],
  )
}

/** The requests for the unread mail of a folder, in the order they were made. */
function listingsOf(calls: readonly GraphCall[]): (SentRequest & { folder: string })[] {
  return requestsOf(calls).flatMap(request => {
    const folder = listedFolder(request.url)
    return folder === undefined ? [] : [{ ...request, folder }]
  })
}

/** The well-known folders looked up, by name, in the order they were. */
function lookupsOf(calls: readonly GraphCall[]): string[] {
  return requestsOf(calls).flatMap(({ url }) => wellKnownName(url) ?? [])
}

/** The folders whose child folders were asked for. */
function parentsOf(calls: readonly GraphCall[]): string[] {
  return requestsOf(calls).flatMap(({ url }) => childFoldersParent(url) ?? [])
}

describe('microsoft graph provider: listing unread mail', () => {
  it('lists the ids of unread messages, newest first, as many as asked for', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    const listed = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(
      connection(),
      { limit: LIST_PAGE },
    )

    expect(listed[0]).toStrictEqual({
      id: `${ID_PREFIX}lena-3`,
      threadId: VENDOR,
      receivedAt: '2026-10-12T09:43:00Z',
    })
    expect(listed).toHaveLength(unreadInbox.value.length)
    const [call] = listingsOf(graph.calls)
    expect({
      path: call?.url.pathname,
      select: selected(call),
      top: call?.url.searchParams.get('$top'),
      orderBy: call?.url.searchParams.get('$orderby'),
      filter: call?.url.searchParams.get('$filter'),
      prefer: call?.prefer,
    }).toStrictEqual({
      path: `/v1.0/me/mailFolders/${INBOX}/messages`,
      select: ['id', 'conversationId', 'receivedDateTime'],
      top: String(LIST_PAGE),
      orderBy: 'receivedDateTime desc',
      filter: expect.stringMatching(/^receivedDateTime ge .+ and isRead eq false$/),
      prefer: expect.stringMatching(IMMUTABLE_IDS),
    })
  })

  it('continues a judge page by time', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    await createMicrosoftProvider({ fetch: graph.fetch }).listUnread(connection(), {
      limit: JUDGE_PAGE,
      before: '2026-10-11T16:20:00Z',
    })

    expect(listingsOf(graph.calls)[0]?.url.searchParams.get('$filter')).toBe(
      'receivedDateTime le 2026-10-11T16:20:00.000Z and isRead eq false',
    )
  })

  it('lists the ids of the newest unread mail 1,000 at a time, each request continuing by time', async () => {
    expect.hasAssertions()
    const folder = pagedFolder(generated(MANY_UNREAD))
    const graph = fakeGraph({ list: folder.answer })

    const listed = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(
      connection(),
      { limit: MAX_LISTED },
    )

    expect({
      count: listed.length,
      unique: new Set(listed.map(entry => entry.id)).size,
      first: listed[0]?.id,
      last: listed.at(-1)?.id,
      filters: listingsOf(graph.calls).map(call => call.url.searchParams.get('$filter')),
      tops: listingsOf(graph.calls).map(call => call.url.searchParams.get('$top')),
    }).toStrictEqual({
      count: MANY_UNREAD,
      unique: MANY_UNREAD,
      first: 'm0',
      last: `m${MANY_UNREAD - 1}`,
      filters: [
        expect.stringMatching(/^receivedDateTime ge .+ and isRead eq false$/),
        `receivedDateTime le ${folder.timeOf(LIST_PAGE - 1)} and isRead eq false`,
        `receivedDateTime le ${folder.timeOf(2 * LIST_PAGE - 2)} and isRead eq false`,
      ],
      tops: [String(LIST_PAGE), String(LIST_PAGE), String(LIST_PAGE)],
    })
  })

  it('lists no more ids than asked for, so the oldest beyond the cap stay out', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ list: pagedFolder(generated(MANY_UNREAD)).answer })

    const listed = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(
      connection(),
      { limit: CAPPED },
    )

    expect([listed.length, listed.at(-1)?.id, listingsOf(graph.calls).length]).toStrictEqual([
      CAPPED,
      `m${CAPPED - 1}`,
      2,
    ])
  })

  it.each([
    { what: 'ids', call: 'listUnreadIds', limit: SHORT_IDS },
    { what: 'a judge page', call: 'listUnread', limit: JUDGE_PAGE },
  ] as const)(
    'completes $what that Graph answered short, by its next link',
    async ({ call, limit }) => {
      expect.hasAssertions()
      const folder = pagedFolder(generated(ALL_SHORT_IDS), { pageSize: SHORT_PAGE })
      const graph = fakeGraph({ list: folder.answer })
      const expected = Math.min(limit, ALL_SHORT_IDS)

      const listed = await createMicrosoftProvider({ fetch: graph.fetch })[call](connection(), {
        limit,
      })

      expect({
        count: listed.length,
        // The pages after the first come from Graph's next links
        skips: listingsOf(graph.calls).map(
          entry => entry.url.searchParams.get('$skip') ?? undefined,
        ),
      }).toStrictEqual({ count: expected, skips: folder.skipsUpTo(expected) })
    },
  )

  it('makes up for entries that do not parse with the next page, and ends only where Graph does', async () => {
    expect.hasAssertions()
    const messages = generated(TWO_PAGES)
    // Two messages Graph sends without a conversation
    const broken = messages.map((message, index) =>
      index < 2
        ? { id: message.id ?? '', receivedDateTime: message.receivedDateTime ?? '' }
        : message,
    )
    const graph = fakeGraph({ list: pagedFolder(broken).answer })

    const page = await createMicrosoftProvider({ fetch: graph.fetch }).listUnread(connection(), {
      limit: JUDGE_PAGE,
    })

    expect([page.length, page[0]?.id, listingsOf(graph.calls).length]).toStrictEqual([
      JUDGE_PAGE,
      'm2',
      2,
    ])
  })

  it('reads a judge page: envelopes, marks and the complete text of each message', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    const [vendor, newsletter, staging, ...rest] = await createMicrosoftProvider({
      fetch: graph.fetch,
    }).listUnread(connection(), { limit: JUDGE_PAGE, before: '2026-10-12T10:00:00Z' })

    expect(vendor).toStrictEqual({
      id: `${ID_PREFIX}lena-3`,
      threadId: VENDOR,
      from: { name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' },
      to: [{ name: 'Mara Lindqvist', email: 'mara.lindqvist@northwind.co' }],
      cc: [{ name: 'Priya Nair', email: 'priya.nair@northwind.co' }],
      subject: 'RE: Vendor review: can we move sign-off to Thursday?',
      receivedAt: '2026-10-12T09:43:00Z',
      preview: 'Hi Mara, Does Thursday 14:00 work? Lena',
      // The new part only, not the quoted history
      text: 'Hi Mara,\n\nDoes Thursday 14:00 work?\n\nLena',
      // No extended property: the header was asked for, so there is none
      marks: {
        unsubscribable: false,
        importance: 'normal',
        flagged: false,
        sorting: 'focused',
      },
    })
    expect(newsletter).toMatchObject({
      // An empty unique body falls back to the whole body
      text: 'This week: fewer meetings.\n\nRead the full issue online.',
      marks: { unsubscribable: true, importance: 'low', flagged: false, sorting: 'other' },
    })
    expect(staging).toMatchObject({
      text: "Staging is back up after this morning's database migration.",
      marks: { unsubscribable: false, importance: 'high', flagged: true },
    })
    expect(staging?.marks.sorting).toBeUndefined()
    // A message without a conversation is skipped
    expect(rest).toStrictEqual([])
  })

  it('asks for the fields, the List-Unsubscribe header and text bodies of a judge page', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    await createMicrosoftProvider({ fetch: graph.fetch }).listUnread(connection(), {
      limit: JUDGE_PAGE,
    })

    // The only folder with unread mail holds the whole page: no ids are listed first
    const [call, ...rest] = listingsOf(graph.calls)
    expect(rest).toStrictEqual([])
    expect(selected(call)).toStrictEqual([
      'id',
      'conversationId',
      'receivedDateTime',
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
    ])
    expect({
      expand: call?.url.searchParams.get('$expand'),
      top: call?.url.searchParams.get('$top'),
      filter: call?.url.searchParams.get('$filter'),
      prefer: call?.prefer,
    }).toStrictEqual({
      expand: "singleValueExtendedProperties($filter=id eq 'String 0x1045')",
      top: String(JUDGE_PAGE),
      filter: expect.stringMatching(/and isRead eq false$/),
      prefer: `IdType="ImmutableId", ${TEXT_BODIES}`,
    })
  })

  it('reads whom the newest sent messages went to', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    const sent = await createMicrosoftProvider({ fetch: graph.fetch }).listSent(connection(), {
      limit: SENT_PAGE,
    })

    expect(sent).toStrictEqual([
      {
        to: [{ name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' }],
        cc: [{ name: 'Priya Nair', email: 'priya.nair@northwind.co' }],
        sentAt: '2026-10-11T18:00:00Z',
      },
      {
        to: [{ name: 'Jonas Weber', email: 'jonas.weber@northwind.co' }],
        cc: [],
        sentAt: '2026-10-09T12:00:00Z',
      },
    ])
    const [call] = graph.calls
    expect({
      path: call?.url.pathname,
      select: selected(call),
      orderBy: call?.url.searchParams.get('$orderby'),
      top: call?.url.searchParams.get('$top'),
    }).toStrictEqual({
      path: '/v1.0/me/mailFolders/sentitems/messages',
      select: ['toRecipients', 'ccRecipients', 'sentDateTime'],
      orderBy: 'sentDateTime desc',
      top: String(SENT_PAGE),
    })
  })

  it.each([
    ['ids', 'listUnreadIds'],
    ['a judge page', 'listUnread'],
  ] as const)('does not take %s without a list of messages as an empty inbox', async (_, call) => {
    expect.hasAssertions()
    const graph = fakeGraph({ list: () => ({}) })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch })[call](connection(), { limit: 1 }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('does not take Sent Items without a list as nobody written to', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ list: () => ({ error: 'no list' }) })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listSent(connection(), { limit: 1 }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

const NEWSLETTERS = 'folder-newsletters'
const SEARCH_FOLDER = '#microsoft.graph.mailSearchFolder'
const MANY_FOLDERS = 120
const SMALL_PAGE = 4

/** An unread message, ids and time only, received `minute` minutes before the latest. */
function messageAt(id: string, minute: number): Record<string, string> {
  return {
    id,
    conversationId: `conversation-${id}`,
    receivedDateTime: new Date(LATEST - minute * MS_PER_MINUTE).toISOString(),
  }
}

/** The answer to a listing of a folder's unread mail, from the messages of each folder. */
function mailboxOf(messages: Record<string, Record<string, string>[]>): (url: URL) => unknown {
  const folders = new Map(
    Object.entries(messages).map(([folder, entries]) => [folder, pagedFolder(entries).answer]),
  )
  return url => folders.get(listedFolder(url) ?? '')?.(url) ?? { value: [] }
}

/**
 * A mailbox whose unread mail lies in these folders, newest first, one message a minute
 * (`undefined`: none that minute). The message of minute `i` has the id `<folder>-<i>`.
 */
function timeline(folders: readonly (string | undefined)[]): (url: URL) => unknown {
  const messages = new Map<string, Record<string, string>[]>()
  for (const [minute, folder] of folders.entries()) {
    if (folder !== undefined) {
      messages.set(folder, [
        ...(messages.get(folder) ?? []),
        messageAt(`${folder}-${minute}`, minute),
      ])
    }
  }
  return mailboxOf(Object.fromEntries(messages))
}

/** Answers the well-known folders named in `ids` with their id, any other with 404 (the mailbox lacks it). */
function wellKnown(ids: Record<string, string>): InnerAnswer {
  return request => {
    const id = ids[wellKnownName(urlOf(request)) ?? '']
    return id === undefined
      ? { status: httpStatus.notFound }
      : { status: httpStatus.ok, body: { id } }
  }
}

/** How often each well-known folder was looked up. */
function lookupCounts(calls: readonly GraphCall[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const name of lookupsOf(calls)) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

describe('microsoft graph provider: folders', () => {
  it('lists unread mail of every folder that has some, nested ones included, newest first', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      folders: [
        {
          id: INBOX,
          unread: 2,
          children: [
            { id: 'folder-projects', unread: 1, children: [{ id: 'folder-vendor', unread: 1 }] },
            { id: 'folder-quiet', unread: 0 },
          ],
        },
        { id: NEWSLETTERS, unread: 1 },
        { id: DELETED_ITEMS, unread: 4, children: [{ id: 'folder-old-project', unread: 3 }] },
        { id: JUNK, unread: 9 },
        { id: 'folder-sent', unread: 1 },
        { id: 'folder-archive', unread: 7, children: [{ id: 'folder-2025', unread: 2 }] },
        { id: 'folder-search', unread: 20, type: SEARCH_FOLDER },
      ],
      answer: wellKnown({
        deleteditems: DELETED_ITEMS,
        junkemail: JUNK,
        sentitems: 'folder-sent',
        archive: 'folder-archive',
      }),
      list: timeline([
        INBOX,
        DELETED_ITEMS,
        'folder-old-project',
        'folder-archive',
        'folder-2025',
        NEWSLETTERS,
        'folder-search',
        'folder-projects',
        'folder-vendor',
        INBOX,
      ]),
    })

    const listed = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(
      connection(),
      { limit: LIST_PAGE },
    )

    // Minutes 1 to 4 and 6 lie in skipped and search folders
    expect(listed.map(entry => entry.id)).toStrictEqual([
      `${INBOX}-0`,
      `${NEWSLETTERS}-5`,
      'folder-projects-7',
      'folder-vendor-8',
      `${INBOX}-9`,
    ])
    expect(listingsOf(graph.calls).map(listing => listing.folder)).toStrictEqual([
      INBOX,
      NEWSLETTERS,
      'folder-projects',
      'folder-vendor',
    ])
    // Nothing inside a skipped folder is looked at
    expect(parentsOf(graph.calls)).toStrictEqual(['msgfolderroot', INBOX, 'folder-projects'])
  })

  it('lists each message once, and no more than asked for across folders', async () => {
    expect.hasAssertions()
    // When each message arrived, in minutes before the latest
    const minutes = { first: 0, second: 1, moved: 2, third: 3, fourth: 4 }
    function message(id: keyof typeof minutes): Record<string, string> {
      return messageAt(id, minutes[id])
    }
    const graph = fakeGraph({
      folders: [
        { id: INBOX, unread: 3 },
        { id: NEWSLETTERS, unread: 3 },
      ],
      // `moved` went from one folder to the other while the folders were listed
      list: mailboxOf({
        [INBOX]: [message('first'), message('moved'), message('fourth')],
        [NEWSLETTERS]: [message('second'), message('moved'), message('third')],
      }),
    })

    const listed = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(
      connection(),
      { limit: SMALL_PAGE },
    )

    expect(listed.map(entry => entry.id)).toStrictEqual(['first', 'second', 'moved', 'third'])
  })

  it('reads a judge page across folders, with texts only for the messages on it', async () => {
    expect.hasAssertions()
    const before = new Date(LATEST).toISOString()
    const graph = fakeGraph({
      folders: [
        { id: INBOX, unread: 3 },
        { id: NEWSLETTERS, unread: 3 },
        { id: 'folder-old', unread: 1 },
      ],
      list: timeline([INBOX, NEWSLETTERS, INBOX, NEWSLETTERS, INBOX, NEWSLETTERS, 'folder-old']),
    })

    const page = await createMicrosoftProvider({ fetch: graph.fetch }).listUnread(connection(), {
      limit: SMALL_PAGE,
      before,
    })

    expect(page.map(entry => entry.id)).toStrictEqual([
      `${INBOX}-0`,
      `${NEWSLETTERS}-1`,
      `${INBOX}-2`,
      `${NEWSLETTERS}-3`,
    ])
    const ids = `receivedDateTime le ${before} and isRead eq false`
    // From the time of the page's oldest message on
    const oldest = page.at(-1)?.receivedAt ?? ''
    const texts = `receivedDateTime le ${before} and receivedDateTime ge ${oldest} and isRead eq false`
    expect(
      listingsOf(graph.calls).map(({ folder, url }) => ({
        folder,
        texts: selected({ url }).includes('uniqueBody'),
        filter: url.searchParams.get('$filter'),
      })),
    ).toStrictEqual([
      { folder: INBOX, texts: false, filter: ids },
      { folder: NEWSLETTERS, texts: false, filter: ids },
      { folder: 'folder-old', texts: false, filter: ids },
      // No texts of the folder without a message on the page
      { folder: INBOX, texts: true, filter: texts },
      { folder: NEWSLETTERS, texts: true, filter: texts },
    ])
  })

  it('keeps every unread message up to its oldest on a judge page when one is read in between', async () => {
    expect.hasAssertions()
    const unread = timeline([INBOX, NEWSLETTERS, INBOX, NEWSLETTERS, NEWSLETTERS, INBOX])
    // The Inbox message of minute 2 is read after the ids were listed, before the texts are
    const afterRead = timeline([INBOX, NEWSLETTERS, undefined, NEWSLETTERS, NEWSLETTERS, INBOX])
    const graph = fakeGraph({
      folders: [
        { id: INBOX, unread: 3 },
        { id: NEWSLETTERS, unread: 3 },
      ],
      list: url => (selected({ url }).includes('uniqueBody') ? afterRead : unread)(url),
    })

    const page = await createMicrosoftProvider({ fetch: graph.fetch }).listUnread(connection(), {
      limit: SMALL_PAGE,
    })

    // Not the Inbox message of minute 5: the page would then lack the newsletter of minute 4
    expect(page.map(entry => entry.id)).toStrictEqual([
      `${INBOX}-0`,
      `${NEWSLETTERS}-1`,
      `${NEWSLETTERS}-3`,
    ])
  })

  it.each([
    ['ids', 'listUnreadIds'],
    ['a judge page', 'listUnread'],
  ] as const)('reads no mail when no folder has unread mail (%s)', async (_, call) => {
    expect.hasAssertions()
    const graph = fakeGraph({
      folders: [
        { id: INBOX, unread: 0, children: [{ id: NEWSLETTERS, unread: 0 }] },
        { id: DELETED_ITEMS, unread: 5 },
      ],
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch })[call](connection(), { limit: JUDGE_PAGE }),
    ).resolves.toStrictEqual([])
    expect(listingsOf(graph.calls)).toStrictEqual([])
  })

  it('looks up the skipped folders once per account, and those the mailbox lacks each time', async () => {
    expect.hasAssertions()
    // The fixtures know Deleted Items and Junk; every other well-known folder answers 404
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    await provider.listUnreadIds(connection(), { limit: LIST_PAGE })
    await provider.listUnreadIds(connection(), { limit: LIST_PAGE })

    const counts = lookupCounts(graph.calls)
    expect(
      ['deleteditems', 'junkemail', 'archive', 'scheduled'].map(name => counts.get(name)),
    ).toStrictEqual([1, 1, 2, 2])
    expect(new Set(listingsOf(graph.calls).map(listing => listing.folder))).toStrictEqual(
      new Set([INBOX]),
    )
  })

  it('shares the folders it looked up with the threads, which then look up none', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    await provider.listUnreadIds(connection(), { limit: LIST_PAGE })
    const looked = lookupsOf(graph.calls).length
    const {
      threads: [vendor],
    } = await provider.loadThreads(connection(), [VENDOR])

    expect(lookupsOf(graph.calls)).toHaveLength(looked)
    // Deleted Items and Junk are still left out of the thread
    expect(vendor?.messages.map(message => message.from.name)).toStrictEqual([
      'Lena Hartmann',
      'Mara Lindqvist',
      'Lena Hartmann',
    ])
  })

  it('fails when a skipped folder cannot be looked up, rather than reading it', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request =>
        wellKnownName(urlOf(request)) === 'archive'
          ? { status: httpStatus.serviceUnavailable, body: { error: { code: 'ErrorBusy' } } }
          : fixtureAnswer(request),
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(connection(), {
        limit: LIST_PAGE,
      }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message:
        'Microsoft Graph could not find the archive folder: 503 ErrorBusy (request-id unknown)',
    })
    expect(listingsOf(graph.calls)).toStrictEqual([])
  })

  it('reads every page of a long list of folders', async () => {
    expect.hasAssertions()
    const folders = Array.from({ length: MANY_FOLDERS }, (_, index) => ({
      id: `folder-${index}`,
      unread: 1,
    }))
    const graph = fakeGraph({ folders, list: timeline(folders.map(folder => folder.id)) })

    const listed = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(
      connection(),
      { limit: LIST_PAGE },
    )

    expect(listed).toHaveLength(MANY_FOLDERS)
    // The second page of the top level, by its next link
    expect(
      graph.calls
        .filter(call => childFoldersParent(call.url) !== undefined)
        .map(call => call.url.searchParams.get('$skip')),
    ).toStrictEqual(['100'])
  })

  it('reuses the folders for judge pages within a minute, and finds them anew for the ids', async () => {
    expect.hasAssertions()
    vi.useFakeTimers({ toFake: ['Date'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })
    /** How often the folder tree was walked so far. */
    function walks(): number {
      return parentsOf(graph.calls).filter(parent => parent === 'msgfolderroot').length
    }

    await provider.listUnreadIds(connection(), { limit: LIST_PAGE })
    const listed = walks()
    await provider.listUnread(connection(), { limit: JUDGE_PAGE })
    const judged = walks()
    vi.advanceTimersByTime(MS_PER_MINUTE)
    await provider.listUnread(connection(), { limit: JUDGE_PAGE })
    const judgedLater = walks()
    await provider.listUnreadIds(connection(), { limit: LIST_PAGE })

    expect({ listed, judged, judgedLater, listedAgain: walks() }).toStrictEqual({
      listed: 1,
      judged: 1,
      judgedLater: 2,
      listedAgain: 3,
    })
  })
})

describe('microsoft graph provider: loading threads', () => {
  it('loads the threads of the conversations in the order asked for', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    const { threads, finished } = await provider.loadThreads(connection(), [NEWSLETTER, VENDOR])

    expect(threads.map(thread => thread.subject)).toStrictEqual([
      'Issue 212: The quiet case for fewer meetings',
      'Vendor review: can we move sign-off to Thursday?',
    ])
    // The conversation id; the inbox makes it unique across accounts
    expect(threads[1]?.id).toBe(VENDOR)
    expect(finished).toStrictEqual([])
  })

  it('orders messages oldest to newest and drops drafts, Deleted Items and Junk', async () => {
    expect.hasAssertions()
    const provider = createMicrosoftProvider({ fetch: fakeGraph().fetch })

    const {
      threads: [vendor],
    } = await provider.loadThreads(connection(), [VENDOR])

    expect(vendor?.messages.map(message => [message.from.name, message.unread])).toStrictEqual([
      ['Lena Hartmann', true],
      ['Mara Lindqvist', false],
      ['Lena Hartmann', true],
    ])
  })

  it('shows only the new part of a message, as plain text, with file attachments only', async () => {
    expect.hasAssertions()
    const provider = createMicrosoftProvider({ fetch: fakeGraph().fetch })

    const {
      threads: [vendor, newsletter],
    } = await provider.loadThreads(connection(), [VENDOR, NEWSLETTER])

    expect(vendor?.messages.at(-1)).toMatchObject({
      body: 'Hi Mara,\n\nDoes Thursday 14:00 work?\n\nLena',
      attachments: [{ id: 'attachment-sheet', name: 'cost-comparison.xlsx', sizeBytes: 49_152 }],
      cc: [{ name: 'Priya Nair', email: 'priya.nair@northwind.co' }],
    })
    // An empty unique body falls back to the full body
    expect(newsletter?.messages[0].body).toBe(
      'This week: fewer meetings.\n\nRead the full issue online.',
    )
  })

  it('asks for immutable ids and text bodies on every request', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    await createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(connection(), [
      VENDOR,
      NEWSLETTER,
    ])

    const inner = batchCalls(graph.calls).flatMap(call => innerRequests(call.body))

    expect(inner.map(request => IMMUTABLE_IDS.test(request.headers.Prefer ?? ''))).not.toContain(
      false,
    )
    expect(
      inner
        .filter(request => request.id.startsWith('conversation'))
        .map(request => request.headers.Prefer?.includes(TEXT_BODIES)),
    ).toStrictEqual([true, true])
  })

  it('reports a conversation with nothing unread left as finished', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request => {
        const fixture = fixtureAnswer(request)
        if (!request.id.startsWith('conversation') || !isRecord(fixture.body)) {
          return fixture
        }
        const read: unknown[] = structuredClone(
          Array.isArray(fixture.body.value) ? fixture.body.value : [],
        )
        for (const message of read) {
          if (isRecord(message)) {
            message.isRead = true
          }
        }
        return { status: httpStatus.ok, body: { value: read } }
      },
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(connection(), [VENDOR]),
    ).resolves.toStrictEqual({ threads: [], finished: [VENDOR] })
  })

  it('skips a conversation whose part of the batch failed, as neither loaded nor finished', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    const { threads, finished } = await provider.loadThreads(connection(), [
      VENDOR,
      NEWSLETTER,
      STAGING,
    ])

    expect(threads).toHaveLength(2)
    expect(finished).toStrictEqual([])
    expect(graph.warn).toHaveBeenCalledExactlyOnceWith(
      'Loading a conversation from Microsoft Graph failed',
      httpStatus.serviceUnavailable,
    )
  })

  it('does not report an empty inbox when no conversation loaded', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request =>
        wellKnownName(urlOf(request)) === undefined
          ? { status: httpStatus.internalServerError }
          : fixtureAnswer(request),
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(connection(), [
        VENDOR,
        NEWSLETTER,
      ]),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('splits conversations into batches of 20', async () => {
    expect.hasAssertions()
    const ids = Array.from({ length: 20 }, (_, index) => `conversation-${index}`)
    const graph = fakeGraph({
      answer: request =>
        wellKnownName(urlOf(request)) === undefined
          ? { status: httpStatus.ok, body: { value: [] } }
          : fixtureAnswer(request),
    })

    const loaded = await createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(
      connection(),
      ids,
    )

    // Two folders and 20 conversations
    expect(batchCalls(graph.calls).map(call => innerRequests(call.body).length)).toStrictEqual([
      BATCH_LIMIT,
      2,
    ])
    expect(loaded).toStrictEqual({ threads: [], finished: ids })
  })

  it('asks Graph nothing for no conversations', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(connection(), []),
    ).resolves.toStrictEqual({ threads: [], finished: [] })
    expect(graph.calls).toHaveLength(0)
  })

  it('looks up the hidden folders once per account', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    await provider.loadThreads(connection(), [VENDOR])
    await provider.loadThreads(connection(), [VENDOR])

    expect(lookupsOf(graph.calls)).toStrictEqual(['deleteditems', 'junkemail'])
  })

  it('fails without the hidden folders, and looks them up again next time', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request =>
        wellKnownName(urlOf(request)) === 'junkemail'
          ? { status: httpStatus.serviceUnavailable }
          : fixtureAnswer(request),
    })
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    await expect(provider.loadThreads(connection(), [VENDOR])).rejects.toMatchObject({
      kind: 'unavailable',
    })
    await expect(provider.loadThreads(connection(), [VENDOR])).rejects.toMatchObject({
      kind: 'unavailable',
    })
    expect(batchCalls(graph.calls)).toHaveLength(2)
  })

  it('reads where replies should go, when the sender set it', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    const {
      threads: [vendor, newsletter],
    } = await createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(connection(), [
      VENDOR,
      NEWSLETTER,
    ])

    const conversation = batchCalls(graph.calls)
      .flatMap(call => innerRequests(call.body))
      .find(request => request.id.startsWith('conversation'))
    expect(
      new URL(conversation?.url ?? '', 'https://graph.microsoft.com').searchParams
        .get('$select')
        ?.split(','),
    ).toContain('replyTo')
    expect(vendor?.messages.map(message => message.replyTo)).toStrictEqual([[], [], []])
    expect(newsletter?.messages[0].replyTo).toStrictEqual([
      { name: 'Operator Weekly Editors', email: 'editors@operatorweekly.com' },
      { name: 'Nameless', email: '' },
    ])
  })

  it('turns an HTML body into text when Graph sends one despite asking for text', async () => {
    expect.hasAssertions()
    const html = {
      contentType: 'html',
      content:
        '<html><head><style>p { color: red }</style></head><body><p>Hi Mara,</p><div>Thursday works &amp; Friday too.<br>Lena</div><scr<script></script>ipt>alert(1)</script></body></html>',
    }
    const graph = fakeGraph({
      answer: request => {
        const fixture = fixtureAnswer(request)
        if (!request.id.startsWith('conversation') || !isRecord(fixture.body)) {
          return fixture
        }
        const [message] = Array.isArray(fixture.body.value) ? fixture.body.value : []
        return {
          status: httpStatus.ok,
          body: { value: [{ ...message, uniqueBody: undefined, body: html }] },
        }
      },
    })

    const {
      threads: [vendor],
    } = await createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(connection(), [VENDOR])

    expect(vendor?.messages[0].body).toBe('Hi Mara,\n\nThursday works & Friday too.\nLena')
  })
})

describe('microsoft graph provider: errors', () => {
  it('refreshes the token once when Graph refuses it', async () => {
    expect.hasAssertions()
    const statuses = [httpStatus.unauthorized]
    const graph = fakeGraph({ status: () => statuses.shift() })
    const mailbox = connection()

    const listed = await createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(mailbox, {
      limit: LIST_PAGE,
    })

    expect(listed).toHaveLength(unreadInbox.value.length)
    expect(mailbox.accessToken).toHaveBeenLastCalledWith({ force: true })
    expect(graph.calls.at(-1)?.headers.get('Authorization')).toBe('Bearer refreshed-token')
  })

  it('asks to sign in again when Graph still refuses the refreshed token', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ status: () => httpStatus.unauthorized })
    const mailbox = connection()

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnread(mailbox, { limit: JUDGE_PAGE }),
    ).rejects.toMatchObject({ kind: 'reconnect' })
    expect(mailbox.accessToken).toHaveBeenCalledTimes(2)
  })

  it('asks to sign in again when an answer inside the batch refuses the token', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.unauthorized }) })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(connection(), [VENDOR]),
    ).rejects.toMatchObject({ kind: 'reconnect' })
  })

  it.each([httpStatus.forbidden, httpStatus.tooManyRequests, httpStatus.internalServerError])(
    'reports Graph as unavailable on %i',
    async status => {
      expect.hasAssertions()
      const graph = fakeGraph({ status: () => status })

      await expect(
        createMicrosoftProvider({ fetch: graph.fetch }).listSent(connection(), {
          limit: SENT_PAGE,
        }),
      ).rejects.toMatchObject({ kind: 'unavailable' })
    },
  )

  it('reports Graph as unavailable when it is not reachable', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('fetch failed'))

    const failure = createMicrosoftProvider({ fetch }).listUnreadIds(connection(), { limit: 4 })

    await expect(failure).rejects.toBeInstanceOf(MailError)
    await expect(failure).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports a failing token refresh as it is', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const mailbox = connection()
    mailbox.accessToken.mockRejectedValue(new MailError('reconnect', 'grant revoked'))

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).loadThreads(mailbox, [VENDOR]),
    ).rejects.toMatchObject({ kind: 'reconnect' })
    expect(graph.fetch).not.toHaveBeenCalled()
  })

  it('gives up on Graph after the timeout', async () => {
    expect.hasAssertions()
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason)
          })
        }),
    )

    await expect(
      createMicrosoftProvider({ fetch, timeoutMs: 5 }).listUnread(connection(), {
        limit: 1,
      }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it.each([
    ['200 with a length of 0', httpStatus.ok],
    ['204', httpStatus.noContent],
    ['202', httpStatus.accepted],
  ])('does not take a listing answered with %s as an empty inbox', async (_, status) => {
    expect.hasAssertions()
    const empty = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(status === httpStatus.noContent ? undefined : '', {
          status,
          headers: { 'Content-Length': '0' },
        }),
    )

    await expect(
      createMicrosoftProvider({ fetch: empty }).listUnreadIds(connection(), { limit: 1 }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports Graph as unavailable when the answer stalls or is not JSON', async () => {
    expect.hasAssertions()
    const stalled = vi.fn<typeof globalThis.fetch>(
      async (_, init) =>
        new Response(
          // The headers arrive, the body never finishes
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () => {
                controller.error(init.signal?.reason)
              })
            },
          }),
          { status: httpStatus.ok },
        ),
    )
    const garbled = vi.fn<typeof globalThis.fetch>(async () => new Response('<html>'))

    await expect(
      createMicrosoftProvider({ fetch: stalled, timeoutMs: 5 }).listUnreadIds(connection(), {
        limit: 1,
      }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(
      createMicrosoftProvider({ fetch: garbled }).listUnreadIds(connection(), { limit: 1 }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Microsoft Graph answered 200 without JSON',
    })
  })

  it('logs what Graph said when it refused a read', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ status: () => httpStatus.tooManyRequests })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).listUnreadIds(connection(), { limit: 1 }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Microsoft Graph answered 429 Forced (request-id unknown)',
    })
  })
})

describe('microsoft graph provider: read state', () => {
  it('patches each message in batches, by immutable id', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.ok }) })
    const ids = Array.from({ length: 21 }, (_, index) => `message/${index}`)

    await createMicrosoftProvider({ fetch: graph.fetch }).setRead(connection(), ids, true)

    const inner = batchCalls(graph.calls).map(call => innerRequests(call.body))
    expect(inner.map(requests => requests.length)).toStrictEqual([BATCH_LIMIT, 1])
    expect(inner[0]?.[0]).toMatchObject({
      method: 'PATCH',
      url: '/me/messages/message%2F0',
      body: { isRead: true },
      headers: { 'Content-Type': 'application/json', 'Prefer': 'IdType="ImmutableId"' },
    })
  })

  it('accepts messages deleted in the meantime', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answer: request => ({
        status: request.id === 'message-0' ? httpStatus.notFound : httpStatus.noContent,
      }),
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).setRead(
        connection(),
        ['gone', 'here'],
        false,
      ),
    ).resolves.toBeUndefined()
  })

  it('fails when a message could not be marked', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.tooManyRequests }) })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).setRead(connection(), ['message'], true),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  // Without the serialization the second call reaches Graph first; with a broken gate the `vi.waitFor` times out
  it('runs the calls to one mailbox one after another', async () => {
    expect.hasAssertions()
    const gate = Promise.withResolvers<undefined>()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.ok }) })
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (graph.fetch.mock.calls.length === 0) {
        await gate.promise
      }
      return graph.fetch(input, init)
    })
    const provider = createMicrosoftProvider({ fetch })

    const first = provider.setRead(connection(), ['first'], true)
    const second = provider.setRead(connection(), ['second'], true)
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        'https://graph.microsoft.com/v1.0/$batch',
        expect.anything(),
      ),
    )
    gate.resolve(undefined)
    await Promise.all([first, second])

    expect(batchCalls(graph.calls).map(call => innerRequests(call.body)[0]?.url)).toStrictEqual([
      '/me/messages/first',
      '/me/messages/second',
    ])
  })

  it('refreshes the token once when marking as read is refused', async () => {
    expect.hasAssertions()
    const answers = [httpStatus.unauthorized, httpStatus.ok]
    const graph = fakeGraph({ answer: () => ({ status: answers.shift() ?? httpStatus.ok }) })
    const mailbox = connection()

    await createMicrosoftProvider({ fetch: graph.fetch }).setRead(mailbox, ['message'], true)

    expect(mailbox.accessToken).toHaveBeenLastCalledWith({ force: true })
    expect(batchCalls(graph.calls).map(call => call.headers.get('Authorization'))).toStrictEqual([
      'Bearer stored-token',
      'Bearer refreshed-token',
    ])
  })

  it('keeps calling a mailbox after a call to it failed', async () => {
    expect.hasAssertions()
    const statuses = [httpStatus.internalServerError]
    const graph = fakeGraph({
      status: () => statuses.shift(),
      answer: () => ({ status: httpStatus.ok }),
    })
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    const failing = provider.setRead(connection(), ['first'], true)
    const next = provider.setRead(connection(), ['second'], true)

    await expect(failing).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(next).resolves.toBeUndefined()
  })
})

const lena: Inbox.Participant = { name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' }
const priya: Inbox.Participant = { name: 'Priya Nair', email: 'priya.nair@northwind.co' }
const jonas: Inbox.Participant = { name: 'Jonas Weber', email: 'jonas.weber@northwind.co' }
const outgoingReply: Mail.OutgoingReply = {
  messageId: 'AAkALg/lena-3',
  body: 'Hi Lena,\n\nThursday <14:00> works.\nSee you.',
  to: [lena],
  cc: [priya],
}
const outgoingForward: Mail.OutgoingForward = { messageId: 'lena-3', to: [jonas], note: '' }

/** A Graph that answers sends with these statuses in turn, then with `202 Accepted`. */
function graphAnswering(...statuses: number[]) {
  return fakeGraph({ answerSend: () => sendAnswer(statuses.shift()) })
}

describe('microsoft graph provider: sending', () => {
  it('replies to exactly the given recipients, with the text as an HTML comment', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).reply(connection(), outgoingReply),
    ).resolves.toBeUndefined()

    expect(
      graph.calls.map(call => ({
        method: call.method,
        url: call.url.href,
        contentType: call.headers.get('Content-Type'),
        authorization: call.headers.get('Authorization'),
      })),
    ).toStrictEqual([
      {
        method: 'POST',
        url: 'https://graph.microsoft.com/v1.0/me/messages/AAkALg%2Flena-3/reply',
        contentType: 'application/json',
        authorization: 'Bearer stored-token',
      },
    ])
    expect(graph.calls[0]?.headers.get('Prefer')).toMatch(IMMUTABLE_IDS)
    expect(graph.calls[0]?.body).toStrictEqual({
      comment: '<p>Hi Lena,</p><p>Thursday &lt;14:00&gt; works.<br>See you.</p>',
      message: {
        toRecipients: [{ emailAddress: { name: 'Lena Hartmann', address: lena.email } }],
        ccRecipients: [{ emailAddress: { name: 'Priya Nair', address: priya.email } }],
      },
    })
  })

  it('forwards the message to the recipient with the note as an HTML comment', async () => {
    expect.hasAssertions()
    const graph = fakeGraph()
    const provider = createMicrosoftProvider({ fetch: graph.fetch })

    await provider.forward(connection(), { ...outgoingForward, note: 'Over to you.' })
    await provider.forward(connection(), outgoingForward)

    const toRecipients = [{ emailAddress: { name: 'Jonas Weber', address: jonas.email } }]
    expect(graph.calls.map(call => [call.url.pathname, call.body])).toStrictEqual([
      ['/v1.0/me/messages/lena-3/forward', { comment: '<p>Over to you.</p>', toRecipients }],
      ['/v1.0/me/messages/lena-3/forward', { comment: '', toRecipients }],
    ])
    expect(graph.calls[0]?.headers.get('Prefer')).toMatch(IMMUTABLE_IDS)
  })

  it.each([
    ['202 without a body', () => sendAnswer(httpStatus.accepted)],
    ['204', () => sendAnswer(httpStatus.noContent)],
    [
      '202 with an empty body and a length of 0',
      () => new Response('', { status: httpStatus.accepted, headers: { 'Content-Length': '0' } }),
    ],
    ['200 with a body that is not JSON', () => new Response('<html>', { status: httpStatus.ok })],
  ])("takes Graph's %s as sent, without reading the body", async (_, answerSend) => {
    expect.hasAssertions()
    const graph = fakeGraph({ answerSend })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).reply(connection(), outgoingReply),
    ).resolves.toBeUndefined()
  })

  it('refreshes the token once when Graph refuses it, and sends only once', async () => {
    expect.hasAssertions()
    const graph = graphAnswering(httpStatus.unauthorized)
    const mailbox = connection()

    await createMicrosoftProvider({ fetch: graph.fetch }).reply(mailbox, outgoingReply)

    expect(mailbox.accessToken).toHaveBeenLastCalledWith({ force: true })
    expect(graph.calls.map(call => call.headers.get('Authorization'))).toStrictEqual([
      'Bearer stored-token',
      'Bearer refreshed-token',
    ])
  })

  it('asks to sign in again when Graph refuses the refreshed token too', async () => {
    expect.hasAssertions()
    const graph = graphAnswering(httpStatus.unauthorized, httpStatus.unauthorized)

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).reply(connection(), outgoingReply),
    ).rejects.toMatchObject({ kind: 'reconnect' })
    expect(graph.calls).toHaveLength(2)
  })

  it('asks to sign in again when the permission to send is missing, without trying again', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answerSend: () => sendAnswer(httpStatus.forbidden, 'ErrorAccessDenied'),
    })

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).forward(connection(), outgoingForward),
    ).rejects.toMatchObject({ kind: 'reconnect' })
    expect(graph.calls).toHaveLength(1)
  })

  it('reports any other refusal to send as nothing sent, with what Graph said for the log', async () => {
    expect.hasAssertions()
    const graph = fakeGraph({
      answerSend: () => sendAnswer(httpStatus.forbidden, 'ErrorMessageSubmissionBlocked'),
    })

    const failure = createMicrosoftProvider({ fetch: graph.fetch }).reply(
      connection(),
      outgoingReply,
    )

    await expect(failure).rejects.toMatchObject({
      kind: 'unavailable',
      message:
        'Microsoft Graph refused a send with 403 ErrorMessageSubmissionBlocked: Refused by the test (request-id request-7)',
    })
  })

  it.each([
    httpStatus.badRequest,
    httpStatus.notFound,
    httpStatus.tooManyRequests,
    httpStatus.serviceUnavailable,
  ])('reports nothing sent when Graph refused the send with %i', async status => {
    expect.hasAssertions()
    const graph = graphAnswering(status)

    await expect(
      createMicrosoftProvider({ fetch: graph.fetch }).reply(connection(), outgoingReply),
    ).rejects.toMatchObject({ kind: 'unavailable' })
    expect(graph.calls).toHaveLength(1)
  })

  it.each([httpStatus.internalServerError, httpStatus.badGateway, httpStatus.gatewayTimeout])(
    'reports the send as unconfirmed when Graph failed with %i',
    async status => {
      expect.hasAssertions()
      const graph = graphAnswering(status)

      await expect(
        createMicrosoftProvider({ fetch: graph.fetch }).reply(connection(), outgoingReply),
      ).rejects.toMatchObject({ kind: 'uncertain' })
      expect(graph.calls).toHaveLength(1)
    },
  )

  it('reports the send as unconfirmed when Graph does not answer, or not in time', async () => {
    expect.hasAssertions()
    const unreachable = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))
    const silent = vi.fn<typeof globalThis.fetch>(
      (_, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason)
          })
        }),
    )

    await expect(
      createMicrosoftProvider({ fetch: unreachable }).reply(connection(), outgoingReply),
    ).rejects.toMatchObject({ kind: 'uncertain' })
    await expect(
      createMicrosoftProvider({ fetch: silent, timeoutMs: 5 }).forward(
        connection(),
        outgoingForward,
      ),
    ).rejects.toMatchObject({ kind: 'uncertain' })
    // Never tried again: Graph may have sent it
    expect([unreachable.mock.calls.length, silent.mock.calls.length]).toStrictEqual([1, 1])
  })

  // Without the serialization the reply reaches Graph while the batch is still running
  it('waits for a call to the same mailbox that is still running', async () => {
    expect.hasAssertions()
    const gate = Promise.withResolvers<undefined>()
    const graph = fakeGraph({ answer: () => ({ status: httpStatus.ok }) })
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      // The first call, the batch, waits for the gate
      if (fetch.mock.calls.length === 1) {
        await gate.promise
      }
      return graph.fetch(input, init)
    })
    const provider = createMicrosoftProvider({ fetch })

    const marking = provider.setRead(connection(), ['earlier'], true)
    const replying = provider.reply(connection(), outgoingReply)
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        'https://graph.microsoft.com/v1.0/$batch',
        expect.anything(),
      ),
    )
    gate.resolve(undefined)
    await Promise.all([marking, replying])

    expect(graph.calls.map(call => call.url.pathname)).toStrictEqual([
      '/v1.0/$batch',
      '/v1.0/me/messages/AAkALg%2Flena-3/reply',
    ])
  })
})
