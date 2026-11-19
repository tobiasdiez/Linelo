import { describe, expect, it, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'
import composer from './composer-locators'
import fakeInbox from './fake-inbox-api'
import inboxBuilders from '~/data/inbox-builders'
import renderApp from './render-app'
import stateKeys from '~/data/state-keys'

type FakeInboxApi = ReturnType<typeof fakeInbox.api>

const { account, mailboxOwner, message, participant, queueItem, signedInUser, storyItem } =
  inboxBuilders
const lena = participant('Lena Hartmann')
const priya = participant('Priya Nair')
const jonas = participant('Jonas Weber')
const first = queueItem({
  id: 'first',
  subject: 'First thread',
  messages: [
    message({ id: 'first-seen-before', unread: false }),
    message({ id: 'first-new-1' }),
    message({ id: 'first-new-2' }),
  ],
})
const second = queueItem({ id: 'second', subject: 'Second thread' })
const third = queueItem({ id: 'third', subject: 'Third thread' })
/** Ends with the user's own reply, sent from Outlook after Lena's message arrived. */
const answeredInOutlook = queueItem({
  id: 'answered',
  subject: 'First thread',
  messages: [
    message({ id: 'lena-ask', from: lena, to: [mailboxOwner], cc: [priya] }),
    message({ id: 'own-reply', from: mailboxOwner, to: [lena], unread: false }),
  ],
})
const { noteBox, recipientBox, replyBox, sendKeys: SEND_KEYS } = composer
const TWO_FAILURES_AND_A_SEND = 3
/** Longer than the 4 s other toasts stay. */
const AFTER_OTHER_TOASTS_CLOSED_MS = 4500
const UNCONFIRMED_REPLY = "Outlook didn't confirm the reply. Check Sent Items before sending again."
const { first: FIRST_PAGE, refill: REFILL_PAGE } = useInboxQueue.pageSizes
/** A refill, a sync call and a refill after the first paint, besides any first load. */
const SYNCED_AFTER_FIRST_PAINT = 3
/** What the sync waits before it asks a busy or failing mailbox again, here (a second in the app). */
const RETRY_MS = 10
/** Ten busy answers in a row end a sync call. */
const MAX_BUSY = 10

/**
 * Signs in, seeds the queue (or leaves it to the page to load when `items` is
 * `undefined`), fakes the inbox API, renders the inbox page, runs the test body, and cleans up.
 */
async function withInbox(
  items: Inbox.QueueItem[] | undefined,
  run: (api: FakeInboxApi) => Promise<void>,
  {
    server = items ?? [],
    prepare,
  }: { server?: Inbox.QueueItem[]; prepare?: (api: FakeInboxApi) => void } = {},
): Promise<void> {
  vi.restoreAllMocks()
  useInboxSync.timing.retryAfterMs = RETRY_MS
  const api = fakeInbox.api(server)
  prepare?.(api)
  useCurrentUser().set(signedInUser)
  // A new session: no sync ran yet
  clearNuxtState([stateKeys.inboxSyncedAt, stateKeys.inboxQueueRefilled], { reset: true })
  if (items) {
    useInboxQueue().reset(items)
  } else {
    clearNuxtState([stateKeys.inboxQueue, stateKeys.inboxQueueStatus], { reset: true })
  }
  const screen = await renderApp('/')
  try {
    await run(api)
  } finally {
    await screen.unmount()
    useToast().clear()
    await api.restore()
  }
}

function heading(): ReturnType<typeof page.getByRole> {
  return page.getByRole('heading', { level: 1 })
}

function rootToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Opens the forward composer and fills it in, without sending. */
async function fillForward(to: string, note: string): Promise<void> {
  await userEvent.keyboard('d')
  await expect.element(recipientBox()).toHaveFocus()
  await userEvent.keyboard(to)
  await userEvent.tab()
  await userEvent.keyboard(note)
}

describe('inbox page', () => {
  it('loads the first unread threads from the server', async () => {
    expect.hasAssertions()

    await withInbox(
      undefined,
      async api => {
        await expect
          .element(heading())
          .toHaveTextContent('Vendor review: can we move sign-off to Thursday?')

        // The first page during rendering, then the longer list in the background
        await vi.waitFor(() =>
          expect(api.inboxLimits()).toStrictEqual([String(FIRST_PAGE), String(REFILL_PAGE)]),
        )
      },
      { server: [storyItem('thread-vendor-review'), second] },
    )
  })

  it('offers to try again when the inbox did not load', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox(
      undefined,
      async api => {
        await expect.element(heading()).toHaveTextContent("Your inbox didn't load.")

        api.inbox.answer = () => [first]
        await page.getByRole('button', { name: 'Try again' }).click()

        await expect.element(heading()).toHaveTextContent('First thread')
        // Then the longer list in the background, as after the first paint
        await vi.waitFor(() => expect(api.inboxLimits().at(-1)).toBe(String(REFILL_PAGE)))
      },
      {
        prepare: api => {
          api.inbox.answer = fakeInbox.unavailableResponse
        },
      },
    )
  })

  it('marks the unread messages as handled on h and shows the next one', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async api => {
      await expect.element(heading()).toHaveTextContent('First thread')
      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Second thread')
      await expect.element(heading()).toHaveFocus()

      expect(api.readPosts()).toStrictEqual([
        { accountId: account.id, messageIds: ['first-new-1', 'first-new-2'], read: true },
      ])
    })
  })

  it('brings the message back with Undo and marks it unread again, also after Escape elsewhere', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async api => {
      await expect.element(heading()).toHaveTextContent('First thread')
      await userEvent.keyboard('h')
      await expect.element(page.getByText('Marked as handled')).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      await page.getByRole('button', { name: 'Undo' }).click()

      await expect.element(heading()).toHaveTextContent('First thread')
      await vi.waitFor(() =>
        expect(api.readPosts().at(-1)).toStrictEqual({
          accountId: account.id,
          messageIds: ['first-new-1', 'first-new-2'],
          read: false,
        }),
      )
      // The index lists again, in case a listing removed the message meanwhile
      await vi.waitFor(() => expect(api.mailboxRequests().at(-1)).toStrictEqual(syncCall()))
    })
  })

  it('keeps the message when Undo cannot mark it unread again, and says so', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      await userEvent.keyboard('h')
      await expect.element(heading()).toHaveTextContent('Second thread')
      api.read.answer = fakeInbox.unavailableResponse
      await page.getByRole('button', { name: 'Undo' }).click()

      await expect
        .element(page.getByText("Couldn't mark this as unread again."))
        .toBeInTheDocument()
      await expect.element(heading()).toHaveTextContent('First thread')
    })
  })

  it('sends the reply to the latest unread message and shows the next thread', async () => {
    expect.hasAssertions()

    await withInbox([answeredInOutlook, second], async api => {
      await userEvent.keyboard('r')
      await expect.element(replyBox()).toHaveFocus()
      await expect.element(page.getByText('Sending resolves this message.')).toBeVisible()
      await userEvent.keyboard('Thursday works.{Enter}{Enter}Mara')
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(heading()).toHaveTextContent('Second thread')
      await expect.element(heading()).toHaveFocus()
      await expect.element(page.getByText('Replied to Lena Hartmann and 1 other')).toBeVisible()
      // The subject, as for the other confirmations
      await expect.element(page.getByText('First thread', { exact: true })).toBeVisible()
      // Mail cannot be unsent
      await expect.element(page.getByRole('button', { name: 'Undo' })).not.toBeInTheDocument()

      expect(api.replyPosts()).toStrictEqual([
        {
          accountId: account.id,
          messageId: 'lena-ask',
          body: 'Thursday works.\n\nMara',
          to: [lena],
          cc: [priya],
          markAsRead: ['lena-ask'],
        },
      ])
      // The server marks the thread as read along with the send
      expect(api.readPosts()).toStrictEqual([])
    })
  })

  it('keeps the composer, the draft and the focus when the reply could not be sent', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox(
      [first, second],
      async api => {
        await userEvent.keyboard('r')
        await userEvent.keyboard('Thursday works.')
        await userEvent.keyboard(SEND_KEYS)

        await expect
          .element(page.getByText("Couldn't send the reply. Your draft is still here."))
          .toBeVisible()
        await expect.element(heading()).toHaveTextContent('First thread')
        await expect.element(replyBox()).toHaveValue('Thursday works.')
        await expect.element(replyBox()).toHaveFocus()

        // A second failure replaces the first notice instead of stacking a copy
        await userEvent.keyboard(SEND_KEYS)
        await vi.waitFor(() => expect(api.replyPosts()).toHaveLength(2))
        await expect
          .element(page.getByText("Couldn't send the reply. Your draft is still here."))
          .toBeVisible()

        expect(
          page.getByText("Couldn't send the reply. Your draft is still here.").elements(),
        ).toHaveLength(1)

        // The next try goes through, and the failure no longer applies
        api.reply.answer = fakeInbox.noContent
        await userEvent.keyboard(SEND_KEYS)

        await expect.element(heading()).toHaveTextContent('Second thread')
        await expect
          .element(page.getByText("Couldn't send the reply. Your draft is still here."))
          .not.toBeInTheDocument()
        expect(api.replyPosts()).toHaveLength(TWO_FAILURES_AND_A_SEND)
      },
      {
        prepare: api => {
          api.reply.answer = fakeInbox.unavailableResponse
        },
      },
    )
  })

  it('warns when Outlook did not confirm the reply, keeps the draft, and keeps the warning on Escape', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      api.reply.answer = fakeInbox.uncertainResponse
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thursday works.')
      await page.getByRole('button', { name: 'Send reply' }).click()

      await expect.element(page.getByText(UNCONFIRMED_REPLY)).toBeVisible()
      await expect.element(replyBox()).toHaveValue('Thursday works.')
      await expect.element(heading()).toHaveTextContent('First thread')

      // Escape leaves the composer, the warning stays
      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('button', { name: 'Reply', exact: true })).toBeVisible()
      await expect.element(page.getByText(UNCONFIRMED_REPLY)).toBeVisible()
    })
  })

  it('keeps the warning about one thread when a reply on the next one goes through', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second, third], async api => {
      api.reply.answer = fakeInbox.uncertainResponse
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thursday works.')
      await userEvent.keyboard(SEND_KEYS)
      await expect.element(page.getByText(UNCONFIRMED_REPLY)).toBeVisible()
      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('h')
      await expect.element(heading()).toHaveTextContent('Second thread')
      // The toaster shows two toasts at most; make room, as a user reading them would
      await page
        .getByRole('listitem')
        .filter({ hasText: 'Marked as handled' })
        .getByRole('button', { name: 'Close' })
        .click()
      // A closed toast leaves the toaster's list a moment later; until then it still counts
      await vi.waitFor(() => expect(useToast().toasts.value).toHaveLength(1))
      api.reply.answer = fakeInbox.noContent
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thanks.')
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(heading()).toHaveTextContent('Third thread')
      await expect.element(page.getByText(UNCONFIRMED_REPLY)).toBeVisible()
      // It says which thread it is about
      await expect.element(page.getByText('First thread', { exact: true })).toBeVisible()
    })
  })

  it('closes a toast on Escape pressed inside it, and stays in the composer', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      api.reply.answer = fakeInbox.unavailableResponse
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thursday works.')
      await userEvent.keyboard(SEND_KEYS)
      await expect
        .element(page.getByText("Couldn't send the reply. Your draft is still here."))
        .toBeVisible()
      page.getByRole('button', { name: 'Close' }).element().focus()
      await userEvent.keyboard('{Escape}')

      await expect
        .element(page.getByText("Couldn't send the reply. Your draft is still here."))
        .not.toBeInTheDocument()
      await expect.element(replyBox()).toHaveValue('Thursday works.')
    })
  })

  it('keeps the warning that replaced an earlier failure past the time other toasts close', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      api.reply.answer = fakeInbox.unavailableResponse
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thursday works.')
      await userEvent.keyboard(SEND_KEYS)
      await expect
        .element(page.getByText("Couldn't send the reply. Your draft is still here."))
        .toBeVisible()
      api.reply.answer = fakeInbox.uncertainResponse
      await userEvent.keyboard(SEND_KEYS)
      await expect.element(page.getByText(UNCONFIRMED_REPLY)).toBeVisible()
      await new Promise(resolve => {
        setTimeout(resolve, AFTER_OTHER_TOASTS_CLOSED_MS)
      })

      await expect.element(page.getByText(UNCONFIRMED_REPLY)).toBeVisible()
    })
  })

  it.each([
    ['a 502 of a proxy', () => new Response('<html>Bad gateway</html>', { status: 502 })],
    [
      'a 504 of a proxy with an HTML body',
      () => new Response('<html>Timeout</html>', { status: 504 }),
    ],
  ])('treats %s as a reply that may have gone out', async (_, answer) => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      api.reply.answer = answer
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thursday works.')
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(page.getByText(UNCONFIRMED_REPLY)).toBeVisible()
      await expect.element(replyBox()).toHaveValue('Thursday works.')
    })
  })

  it('sends the user to sign in again when sending needs access Linelo lost', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      api.reply.answer = fakeInbox.reconnectResponse
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thursday works.')
      await userEvent.keyboard(SEND_KEYS)

      await expect
        .element(page.getByText('Sign in again so Linelo can keep working with your mail.'))
        .toBeInTheDocument()
    })
  })

  it('forwards the latest unread message with D and shows the next thread', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async api => {
      await fillForward('Jonas Weber <jonas.weber@northwind.co>', 'Can you take this one?')
      await page.getByRole('button', { name: 'Forward', exact: true }).click()

      await expect.element(heading()).toHaveTextContent('Second thread')
      await expect.element(heading()).toHaveFocus()
      await expect.element(page.getByText('Forwarded to Jonas Weber')).toBeVisible()
      // The subject, as for Mark as handled
      await expect.element(page.getByText('First thread', { exact: true })).toBeVisible()

      expect(api.forwardPosts()).toStrictEqual([
        {
          accountId: account.id,
          messageId: 'first-new-2',
          to: [jonas],
          note: 'Can you take this one?',
          markAsRead: ['first-new-1', 'first-new-2'],
        },
      ])
    })
  })

  it('keeps the recipient and the note when forwarding failed or was not confirmed', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      api.forward.answer = fakeInbox.unavailableResponse
      await fillForward('jonas.weber@northwind.co', 'For you.')
      await userEvent.keyboard(SEND_KEYS)

      await expect
        .element(page.getByText("Couldn't forward this message. Your note is still here."))
        .toBeVisible()
      await expect.element(noteBox()).toHaveFocus()

      api.forward.answer = fakeInbox.uncertainResponse
      await userEvent.keyboard(SEND_KEYS)

      await expect
        .element(
          page.getByText(
            "Outlook didn't confirm the forward. Check Sent Items before sending again.",
          ),
        )
        .toBeVisible()
      // It took the failure's place
      await expect
        .element(page.getByText("Couldn't forward this message. Your note is still here."))
        .not.toBeInTheDocument()
      await expect.element(recipientBox()).toHaveValue('jonas.weber@northwind.co')
      await expect.element(noteBox()).toHaveValue('For you.')
      await expect.element(heading()).toHaveTextContent('First thread')
      expect(api.forwardPosts()).toHaveLength(2)
    })
  })

  it('says Add to Todoist is not available yet, once for repeated presses, and keeps the brand colours', async () => {
    expect.hasAssertions()

    await withInbox([storyItem('thread-vendor-review'), second], async api => {
      await userEvent.keyboard('t')
      await userEvent.keyboard('t')

      await expect
        .element(page.getByText("Adding to Todoist isn't available yet."))
        .toBeInTheDocument()

      expect(page.getByText("Adding to Todoist isn't available yet.").elements()).toHaveLength(1)
      await expect
        .element(heading())
        .toHaveTextContent('Vendor review: can we move sign-off to Thursday?')
      expect(api.readPosts()).toStrictEqual([])
      // Icons rendered at runtime (here the toast's close icon) must not reset the brand tokens
      expect(rootToken('--ui-bg')).toBe(rootToken('--color-off-white'))
    })
  })

  it('keeps the message when an action fails, and lets the next try go through', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async () => {
      const gate = Promise.withResolvers<undefined>()
      vi.spyOn(useMailActions(), 'markAsHandled').mockReturnValueOnce(gate.promise)
      vi.spyOn(console, 'error').mockReturnValue()
      const markAsHandled = page.getByRole('button', { name: 'Mark as handled' })
      await markAsHandled.click()

      // While waiting for Outlook the actions are blocked, but focus stays where it was
      await expect.element(markAsHandled).toHaveAttribute('aria-disabled', 'true')
      await expect.element(markAsHandled).toHaveFocus()
      await expect
        .element(page.getByRole('complementary', { name: 'Decide' }))
        .toHaveAttribute('aria-busy', 'true')

      gate.reject(new Error('offline'))

      await expect
        .element(page.getByText("Couldn't mark this as handled. Try again."))
        .toBeInTheDocument()
      await expect.element(heading()).toHaveTextContent('First thread')
      await expect.element(markAsHandled).toHaveFocus()

      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Second thread')
    })
  })

  it('sends the user to sign in again when Linelo lost access to the mailbox', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first, second], async api => {
      api.read.answer = () => fakeInbox.reconnectResponse()
      await userEvent.keyboard('h')

      await expect
        .element(page.getByText('Sign in again so Linelo can keep working with your mail.'))
        .toBeInTheDocument()
    })
  })

  it('sends the user to sign in when the session ended, leaving nothing of the inbox behind', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async api => {
      api.read.answer = fakeInbox.signedOutResponse
      api.me.answer = fakeInbox.signedOutMe
      await userEvent.keyboard('h')

      await expect
        .element(page.getByText('Your session ended. Sign in again to carry on.'))
        .toBeInTheDocument()

      expect(useCurrentUser().user.value).toBeUndefined()
      expect(useInboxQueue().current.value).toBeUndefined()
    })
  })

  it('asks to sign in again when no mailbox is connected', async () => {
    expect.hasAssertions()

    await withInbox(
      undefined,
      async () => {
        await expect
          .element(page.getByText('Sign in again so Linelo can keep working with your mail.'))
          .toBeInTheDocument()
      },
      {
        prepare: api => {
          api.inbox.answer = fakeInbox.reconnectResponse
        },
      },
    )
  })

  it('says when trying again failed too, and keeps focus on Try again', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox(
      undefined,
      async () => {
        const tryAgain = page.getByRole('button', { name: 'Try again' })
        await tryAgain.click()

        await expect
          .element(page.getByRole('status').getByText("Still can't reach your mailbox."))
          .toBeInTheDocument()
        await expect.element(tryAgain).toHaveFocus()
      },
      {
        prepare: api => {
          api.inbox.answer = fakeInbox.unavailableResponse
        },
      },
    )
  })

  it('does not act on shortcuts while the account menu is open', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async api => {
      await page.getByRole('button', { name: 'Account: Mara Lindqvist' }).click()
      await expect.element(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
      await userEvent.keyboard('h')
      // The open menu hides the page from the accessibility tree; close it to look
      await userEvent.keyboard('{Escape}')

      await expect.element(heading()).toHaveTextContent('First thread')

      expect(api.readPosts()).toStrictEqual([])
    })
  })

  it.each([
    [
      'the pointer',
      async () => page.getByRole('button', { name: 'Account: Mara Lindqvist' }).click(),
    ],
    [
      'the keyboard',
      async () => {
        page.getByRole('button', { name: 'Account: Mara Lindqvist' }).element().focus()
        await userEvent.keyboard('{Enter}')
      },
    ],
  ])(
    'closes the account menu opened with %s on Escape, and keeps the Undo toast',
    async (_, openMenu) => {
      expect.hasAssertions()

      await withInbox([first, second], async () => {
        await userEvent.keyboard('h')
        await expect.element(page.getByText('Marked as handled')).toBeInTheDocument()
        await openMenu()
        await expect.element(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
        await userEvent.keyboard('{Escape}')

        await expect
          .element(page.getByRole('menuitem', { name: 'Sign out' }))
          .not.toBeInTheDocument()
        await expect.element(page.getByRole('button', { name: 'Undo' })).toBeVisible()
      })
    },
  )

  it('loads the inbox again after leaving for sign-in during the check before Inbox zero', async () => {
    expect.hasAssertions()

    await withInbox([first], async api => {
      api.inbox.answer = fakeInbox.reconnectResponse
      await userEvent.keyboard('h')
      await expect
        .element(page.getByText('Sign in again so Linelo can keep working with your mail.'))
        .toBeInTheDocument()

      // Back to the inbox, as after signing in again
      api.inbox.answer = () => [third]
      await navigateTo('/')

      await expect.element(heading()).toHaveTextContent('Third thread')
    })
  })

  it('says the inbox did not load when the check before Inbox zero fails', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox([first], async api => {
      api.inbox.answer = fakeInbox.unavailableResponse
      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent("Your inbox didn't load.")
    })
  })

  it('checks for new mail once more before showing Inbox zero', async () => {
    expect.hasAssertions()

    await withInbox([first], async api => {
      const gate = Promise.withResolvers<Inbox.QueueItem[]>()
      api.inbox.answer = () => gate.promise
      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Checking for new mail.')

      gate.resolve([third])

      await expect.element(heading()).toHaveTextContent('Third thread')
    })
  })

  it('shows Inbox zero as the page heading when nothing is left', async () => {
    expect.hasAssertions()

    await withInbox([], async () => {
      await expect.element(heading()).toHaveTextContent('Inbox zero.')
    })
  })
})

/** The queue's answer when nothing is worth showing yet. */
const PREPARING: Inbox.InboxResponse = { items: [], preparing: true }
const DONE: Inbox.SyncResponse = { status: 'done' }
const MORE: Inbox.SyncResponse = { status: 'more' }
const BUSY: Inbox.SyncResponse = { status: 'busy' }
const newsletter = queueItem({
  id: 'newsletter',
  subject: 'Issue 212',
  whyShown: 'A newsletter or mailing list. Nothing in it should need an answer.',
  suggestions: [{ kind: 'handled', id: 'handled', label: 'Nothing to act on' }],
  tier: 'low',
  messages: [message({ id: 'newsletter-1' })],
})

function inboxRequest(limit: number, start = false) {
  return { kind: 'inbox', limit: String(limit), start }
}

function syncCall(start = false) {
  return { kind: 'sync', start }
}

describe('inbox page: the order of the queue', () => {
  it('reads the newest mail first when nothing is worth showing, then shows the best of it', async () => {
    expect.hasAssertions()
    const batch = Promise.withResolvers<Inbox.SyncResponse>()

    await withInbox(
      undefined,
      async api => {
        await expect.element(heading()).toHaveTextContent('Checking for new mail.')
        await vi.waitFor(() => expect(api.mailboxRequests().at(-1)).toStrictEqual(syncCall(true)))

        batch.resolve(MORE)

        await expect.element(heading()).toHaveTextContent('First thread')
        // The sync carries on behind the page, and the queue follows it
        await vi.waitFor(() =>
          expect(api.mailboxRequests()).toStrictEqual([
            inboxRequest(FIRST_PAGE, true),
            syncCall(true),
            inboxRequest(FIRST_PAGE),
            inboxRequest(REFILL_PAGE),
            syncCall(),
            inboxRequest(REFILL_PAGE),
          ]),
        )
      },
      {
        prepare: api => {
          api.inbox.answer = ({ start }) => (start ? PREPARING : [first, second])
          api.sync.answer = ({ start }) => (start ? batch.promise : DONE)
        },
      },
    )
  })

  it('syncs to the end before showing anything when the newest mail held nothing either', async () => {
    expect.hasAssertions()
    let synced = false

    await withInbox(
      undefined,
      async api => {
        await expect.element(heading()).toHaveTextContent('Third thread')

        const beforeTheFirstMessage = [
          inboxRequest(FIRST_PAGE, true),
          syncCall(true),
          inboxRequest(FIRST_PAGE),
          syncCall(),
          inboxRequest(FIRST_PAGE),
        ]
        expect(api.mailboxRequests().slice(0, beforeTheFirstMessage.length)).toStrictEqual(
          beforeTheFirstMessage,
        )
      },
      {
        prepare: api => {
          api.inbox.answer = () => (synced ? [third] : PREPARING)
          api.sync.answer = ({ start }) => {
            synced ||= !start
            return start ? MORE : DONE
          }
        },
      },
    )
  })

  it('offers to try again when reading the newest mail failed, and carries on from there', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()
    let batches = 0

    await withInbox(
      undefined,
      async api => {
        await expect.element(heading()).toHaveTextContent("Your inbox didn't load.")

        await page.getByRole('button', { name: 'Try again' }).click()

        await expect.element(heading()).toHaveTextContent('First thread')
        expect(api.mailboxRequests().filter(request => request.start)).toStrictEqual([
          inboxRequest(FIRST_PAGE, true),
          syncCall(true),
          inboxRequest(FIRST_PAGE, true),
          syncCall(true),
        ])
      },
      {
        prepare: api => {
          api.inbox.answer = ({ start }) => (start ? PREPARING : [first])
          api.sync.answer = ({ start }) => {
            if (!start) {
              return DONE
            }
            batches += 1
            return batches === 1 ? fakeInbox.unavailableResponse() : MORE
          }
        },
      },
    )
  })

  it('shows a message at once when there is one worth showing, then refills, syncs and refills', async () => {
    expect.hasAssertions()

    await withInbox(
      undefined,
      async api => {
        await expect.element(heading()).toHaveTextContent('First thread')

        await vi.waitFor(() =>
          expect(api.mailboxRequests()).toStrictEqual([
            inboxRequest(FIRST_PAGE, true),
            inboxRequest(REFILL_PAGE),
            syncCall(),
            inboxRequest(REFILL_PAGE),
          ]),
        )
      },
      { server: [first, second] },
    )
  })

  it('never lets a refill and a sync call run at the same time', async () => {
    expect.hasAssertions()
    const slowSync = Promise.withResolvers<Inbox.SyncResponse>()

    await withInbox(
      [first, second, third],
      async api => {
        await vi.waitFor(() => expect(api.mailboxRequests().at(-1)).toStrictEqual(syncCall()))
        // Two left: a refill is due at once, while the sync call still runs
        await userEvent.keyboard('h')
        await expect.element(heading()).toHaveTextContent('Second thread')

        slowSync.resolve(DONE)

        // The refill went out only after the sync call ended (one refill serves both triggers);
        // Had it not waited, the fake would count an overlap
        await vi.waitFor(() =>
          expect(api.mailboxRequests()).toStrictEqual([
            inboxRequest(REFILL_PAGE),
            syncCall(),
            inboxRequest(REFILL_PAGE),
          ]),
        )
        expect(api.overlaps()).toBe(0)
      },
      {
        prepare: api => {
          api.sync.answer = () => slowSync.promise
        },
      },
    )
  })

  it('suggests Mark as handled on a newsletter, and 1 resolves it', async () => {
    expect.hasAssertions()

    await withInbox([newsletter, second], async api => {
      await expect.element(page.getByText('Nothing to act on')).toBeVisible()
      await expect.element(page.getByText('Mark handled')).toBeVisible()

      await userEvent.keyboard('1')

      await expect.element(heading()).toHaveTextContent('Second thread')
      expect(api.readPosts()).toStrictEqual([
        { accountId: account.id, messageIds: ['newsletter-1'], read: true },
      ])
    })
  })

  it('syncs and refills after an action once the last sync is two minutes old', async () => {
    expect.hasAssertions()

    const fourth = queueItem({ id: 'fourth', subject: 'Fourth thread' })

    // More than two left after each action, so no refill is due for that
    await withInbox([first, second, third, fourth, newsletter], async api => {
      await vi.waitFor(() => expect(api.mailboxRequests()).toHaveLength(SYNCED_AFTER_FIRST_PAINT))
      await userEvent.keyboard('h')
      await expect.element(heading()).toHaveTextContent('Second thread')
      const fresh = api.mailboxRequests().length
      useState<number | undefined>(stateKeys.inboxSyncedAt).value =
        Date.now() - useInboxSync.staleAfterMs - 1

      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Third thread')
      await vi.waitFor(() =>
        expect(api.mailboxRequests().slice(fresh)).toStrictEqual([
          syncCall(),
          inboxRequest(REFILL_PAGE),
        ]),
      )
      // Right after the first sync, an action started none
      expect(fresh).toBe(SYNCED_AFTER_FIRST_PAINT)
    })
  })

  it('asks again a second later while another tab syncs the mailbox', async () => {
    expect.hasAssertions()
    const answers: Inbox.SyncResponse[] = [BUSY]

    await withInbox(
      [first, second, third],
      async api => {
        await vi.waitFor(() =>
          expect(api.mailboxRequests()).toStrictEqual([
            inboxRequest(REFILL_PAGE),
            syncCall(),
            syncCall(),
            inboxRequest(REFILL_PAGE),
          ]),
        )
      },
      {
        prepare: api => {
          api.sync.answer = () => answers.shift() ?? DONE
        },
      },
    )
  })

  it('stops syncing after three failures in a row, and shows no Inbox zero then', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()
    const failedSyncs = 3

    await withInbox(
      [first],
      async api => {
        function syncCalls() {
          return api.mailboxRequests().filter(request => request.kind === 'sync')
        }
        await vi.waitFor(() => expect(syncCalls()).toHaveLength(failedSyncs))

        // The next trigger tries again (here the check before Inbox zero): the first run had ended
        await userEvent.keyboard('h')

        await expect.element(heading()).toHaveTextContent("Your inbox didn't load.")
        expect(syncCalls()).toHaveLength(2 * failedSyncs)
      },
      {
        prepare: api => {
          api.sync.answer = fakeInbox.unavailableResponse
        },
      },
    )
  })

  it('shows Inbox zero only once a sync ran to its end, refilling after each step', async () => {
    expect.hasAssertions()
    const lastStep = Promise.withResolvers<Inbox.SyncResponse>()

    await withInbox([first], async api => {
      await vi.waitFor(() => expect(api.mailboxRequests()).toHaveLength(SYNCED_AFTER_FIRST_PAINT))
      const steps = [MORE, lastStep.promise]
      api.sync.answer = () => steps.shift() ?? DONE
      api.inbox.answer = () => []

      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Checking for new mail.')
      await vi.waitFor(() =>
        expect(api.mailboxRequests().slice(SYNCED_AFTER_FIRST_PAINT)).toStrictEqual([
          syncCall(),
          inboxRequest(REFILL_PAGE),
          syncCall(),
        ]),
      )

      lastStep.resolve(DONE)

      await expect.element(heading()).toHaveTextContent('Inbox zero.')
      expect(api.mailboxRequests().at(-1)).toStrictEqual(inboxRequest(REFILL_PAGE))
    })
  })

  it('shows new mail at the end of the queue as soon as a sync step found it, while the sync carries on', async () => {
    expect.hasAssertions()
    const lastStep = Promise.withResolvers<Inbox.SyncResponse>()

    await withInbox([first], async api => {
      await vi.waitFor(() => expect(api.mailboxRequests()).toHaveLength(SYNCED_AFTER_FIRST_PAINT))
      const steps = [MORE, lastStep.promise]
      api.sync.answer = () => steps.shift() ?? DONE
      api.inbox.answer = () => [third]

      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Third thread')
      expect(api.mailboxRequests().at(-1)).toStrictEqual(syncCall())
      lastStep.resolve(DONE)
    })
  })

  it('shows Inbox zero after a quick check without "Checking for new mail." in between', async () => {
    expect.hasAssertions()
    const headings: string[] = []
    const observer = new MutationObserver(() => {
      const text = document.querySelector('main h1')?.textContent?.trim()
      if (text && headings.at(-1) !== text) {
        headings.push(text)
      }
    })

    await withInbox([first], async api => {
      await vi.waitFor(() => expect(api.mailboxRequests()).toHaveLength(SYNCED_AFTER_FIRST_PAINT))
      api.inbox.answer = () => []
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })

      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Inbox zero.')
      observer.disconnect()
      expect(headings).toStrictEqual(['Inbox zero.'])
    })
  })

  it('reads the queue it has when another tab is reading the newest mail, instead of waiting for it', async () => {
    expect.hasAssertions()

    await withInbox(
      undefined,
      async api => {
        await expect.element(heading()).toHaveTextContent('First thread')

        // One busy answer, then the queue: no second batch
        const untilShown = [
          inboxRequest(FIRST_PAGE, true),
          syncCall(true),
          inboxRequest(FIRST_PAGE),
        ]
        expect(api.mailboxRequests().slice(0, untilShown.length)).toStrictEqual(untilShown)
        expect(
          api.mailboxRequests().filter(request => request.kind === 'sync' && request.start),
        ).toHaveLength(1)
      },
      {
        prepare: api => {
          // The other tab's step judged the newest mail meanwhile
          api.inbox.answer = ({ start }) => (start ? PREPARING : [first])
          api.sync.answer = ({ start }) => (start ? BUSY : DONE)
        },
      },
    )
  })

  it('offers to try again when the mailbox stays busy, and says when trying again failed too', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withInbox(
      undefined,
      async api => {
        await expect.element(heading()).toHaveTextContent("Your inbox didn't load.")
        expect(api.mailboxRequests().filter(request => request.kind === 'sync')).toHaveLength(
          MAX_BUSY,
        )

        await page.getByRole('button', { name: 'Try again' }).click()

        await expect
          .element(page.getByRole('status').getByText("Still can't reach your mailbox."))
          .toBeInTheDocument()
      },
      {
        prepare: api => {
          api.inbox.answer = () => PREPARING
          api.sync.answer = () => BUSY
        },
      },
    )
  })

  it('sends nothing when the page comes back to a queue that is full and fresh', async () => {
    expect.hasAssertions()

    await withInbox([first, second, third, newsletter], async api => {
      await vi.waitFor(() => expect(api.mailboxRequests()).toHaveLength(SYNCED_AFTER_FIRST_PAINT))

      const again = await renderApp('/')
      // Anything the page asked for on its return is sent before this request
      await useInboxSync().exclusive(async () => undefined)
      await again.unmount()

      expect(api.mailboxRequests()).toHaveLength(SYNCED_AFTER_FIRST_PAINT)
    })
  })
})
