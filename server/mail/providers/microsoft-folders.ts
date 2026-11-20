import MailError from '../mail-error'
import graphClient from '../../microsoft/graph-client'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'

/*
 * The folders of an Outlook mailbox, for the Microsoft mail adapter: the ids of well-known
 * folders, and which folders hold unread mail that waits on the owner. That is every mail
 * folder at any depth, except the skipped well-known folders below with everything inside
 * them, hidden folders (Graph leaves them out unless asked) and search folders, which only
 * show mail kept in other folders. Graph lists the folders of one level at a time, so the
 * tree is walked level by level, one batch per level.
 */

/**
 * Well-known folders whose unread mail does not wait on the owner: deleted mail, junk, the
 * owner's own mail, mail archived or scheduled to come back to the Inbox (Outlook's Archive
 * and Schedule), Skype conversations and Outlook's sync logs.
 */
const SKIPPED_FOLDERS = [
  'deleteditems',
  'junkemail',
  'sentitems',
  'drafts',
  'outbox',
  'archive',
  'scheduled',
  'conversationhistory',
  'syncissues',
]
/** The parent of the top-level folders, by its well-known name. */
const ROOT = 'msgfolderroot'
/** Folder ids in the form of message ids (immutable), as a message's `parentFolderId` is compared with them. */
const HEADERS = { Prefer: 'IdType="ImmutableId"' }
const FOLDER_FIELDS = ['id', 'childFolderCount', 'unreadItemCount']
/** Folders per page; Graph's default is 10. */
const FOLDER_PAGE = 100
const SEARCH_FOLDER = '#microsoft.graph.mailSearchFolder'

interface MailFolder {
  id: string
  childFolderCount: number
  unreadItemCount: number
}

function countOf(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

/** A folder of a listing, or `undefined` for a search folder or an entry without an id. */
function parseFolder(value: unknown): MailFolder | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value['@odata.type'] === SEARCH_FOLDER) {
    return undefined
  }
  return {
    id: value.id,
    childFolderCount: countOf(value.childFolderCount),
    unreadItemCount: countOf(value.unreadItemCount),
  }
}

const FOLDERS: Graph.Collection<MailFolder> = {
  what: 'mail folders',
  headers: HEADERS,
  parse: body =>
    graphClient
      .values(body)
      .map(entry => parseFolder(entry))
      .filter(folder => folder !== undefined),
  // Up to 5,000 child folders of one folder
  maxPages: 50,
}

function lookupRequest(name: string): Graph.BatchRequest {
  return {
    id: `well-known-${name}`,
    method: 'GET',
    url: `/me/mailFolders/${name}?$select=id`,
    headers: HEADERS,
  }
}

function childrenRequest(parentId: string, index: number): Graph.BatchRequest {
  const parameters = graphClient.query({
    $select: FOLDER_FIELDS.join(','),
    $top: String(FOLDER_PAGE),
  })
  return {
    id: `children-${index}`,
    method: 'GET',
    url: `/me/mailFolders/${encodeURIComponent(parentId)}/childFolders?${parameters}`,
    headers: HEADERS,
  }
}

/** The ids of the folders that have folders inside them. */
function parentIdsOf(folders: readonly MailFolder[]): string[] {
  return folders.filter(folder => folder.childFolderCount > 0).map(folder => folder.id)
}

/** Creates the folder lookups of the Microsoft mail adapter, on its Graph client. */
function createFolderFinder(graph: Pick<Graph.Client, 'batch' | 'collectFrom'>) {
  /** The ids of well-known folders found so far, by name, per account: folder ids never change. */
  const wellKnown = new Map<string, Map<string, string>>()
  /** The folders with unread mail, per account, and when they were found. */
  const unreadFolders = new Map<string, { foundAt: number; ids: string[] }>()

  function knownOf(accountId: string): Map<string, string> {
    const known = wellKnown.get(accountId) ?? new Map<string, string>()
    wellKnown.set(accountId, known)
    return known
  }

  /** The requests that look up those of these well-known folders not known yet, for a batch that `wellKnownIds` then reads. */
  function lookups(accountId: string, names: readonly string[]): Graph.BatchRequest[] {
    const known = knownOf(accountId)
    return names.filter(name => !known.has(name)).map(name => lookupRequest(name))
  }

  /**
   * The ids of these well-known folders: those known, and those `lookups` asked for in the
   * batch that answered `responses`. A folder the mailbox lacks (404, such as Archive
   * before its first use) is left out and looked up again next time; any other failure throws.
   */
  function wellKnownIds(
    accountId: string,
    names: readonly string[],
    responses: ReadonlyMap<string, Graph.BatchResponse>,
  ): ReadonlySet<string> {
    const known = knownOf(accountId)
    for (const name of names.filter(entry => !known.has(entry))) {
      const response = responses.get(`well-known-${name}`)
      if (response?.status === httpStatus.notFound) {
        continue
      }
      const what = `find the ${name} folder`
      const { body } = graphClient.assertSucceeded(response, what)
      if (!isRecord(body) || typeof body.id !== 'string') {
        throw new MailError('unavailable', `Microsoft Graph could not ${what} (no id)`)
      }
      known.set(name, body.id)
    }
    return new Set(names.flatMap(name => known.get(name) ?? []))
  }

  /** The child folders of these parents, every page of them, but the skipped ones. */
  async function childrenOf(
    caller: Graph.Caller,
    parentIds: readonly string[],
    {
      responses,
      skipped,
    }: { responses: ReadonlyMap<string, Graph.BatchResponse>; skipped: ReadonlySet<string> },
  ): Promise<MailFolder[]> {
    const pages = await Promise.all(
      parentIds.map(async (_, index) => {
        const { body } = graphClient.assertSucceeded(
          responses.get(`children-${index}`),
          'list mail folders',
        )
        const limit = Number.POSITIVE_INFINITY
        const { entries } = await graph.collectFrom(caller, body, { limit, collection: FOLDERS })
        return entries
      }),
    )
    return pages.flat().filter(folder => !skipped.has(folder.id))
  }

  /**
   * Every folder below the root that is not skipped. The first batch also looks up the
   * skipped folders not known yet, so they are left out from the top level on.
   */
  async function walk(caller: Graph.Caller): Promise<MailFolder[]> {
    const { accountId } = caller
    const first = await graph.batch(caller, [
      ...lookups(accountId, SKIPPED_FOLDERS),
      childrenRequest(ROOT, 0),
    ])
    const skipped = wellKnownIds(accountId, SKIPPED_FOLDERS, first)
    let level = await childrenOf(caller, [ROOT], { responses: first, skipped })
    const found = [...level]
    let parentIds = parentIdsOf(level)
    while (parentIds.length > 0) {
      // Each level names the parents of the next one
      // eslint-disable-next-line eslint/no-await-in-loop
      const responses = await graph.batch(
        caller,
        parentIds.map((id, index) => childrenRequest(id, index)),
      )
      // eslint-disable-next-line eslint/no-await-in-loop
      level = await childrenOf(caller, parentIds, { responses, skipped })
      found.push(...level)
      parentIds = parentIdsOf(level)
    }
    return found
  }

  /**
   * The ids of the folders with unread mail that waits on the owner. Found anew unless the
   * last lookup for the account is younger than `maxAgeMs`; only a lookup that succeeded is kept.
   */
  async function unreadFolderIds(
    caller: Graph.Caller,
    { maxAgeMs }: { maxAgeMs: number },
  ): Promise<string[]> {
    const cached = unreadFolders.get(caller.accountId)
    if (cached && Date.now() - cached.foundAt < maxAgeMs) {
      return cached.ids
    }
    const foundAt = Date.now()
    const walked = await walk(caller)
    const ids = walked.filter(folder => folder.unreadItemCount > 0).map(folder => folder.id)
    unreadFolders.set(caller.accountId, { foundAt, ids })
    return ids
  }

  return { lookups, wellKnownIds, unreadFolderIds }
}

const microsoftFolders = { create: createFolderFinder }

export default microsoftFolders
