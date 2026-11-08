import { describe, expect, it, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'
import fakeInbox from './fake-inbox-api'
import inboxBuilders from '~/data/inbox-builders'
import renderApp from './render-app'
import stateKeys from '~/data/state-keys'

type FakeInboxApi = ReturnType<typeof fakeInbox.api>

const { account, message, queueItem, signedInUser, storyItem } = inboxBuilders
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
const SEND_KEYS = useKbd().macOS.value ? '{Meta>}{Enter}{/Meta}' : '{Control>}{Enter}{/Control}'
const { first: FIRST_PAGE, refill: REFILL_PAGE } = useInboxQueue.pageSizes

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
  const api = fakeInbox.api(server)
  prepare?.(api)
  useCurrentUser().set(signedInUser)
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

      expect(api.posts()).toStrictEqual([
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
        expect(api.posts().at(-1)).toStrictEqual({
          accountId: account.id,
          messageIds: ['first-new-1', 'first-new-2'],
          read: false,
        }),
      )
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

  it('says Reply, Add to Todoist and Delegate are not available yet, and resolves nothing', async () => {
    expect.hasAssertions()

    await withInbox([storyItem('thread-vendor-review'), second], async api => {
      await userEvent.keyboard('1')
      await expect.element(page.getByRole('textbox', { name: 'Reply' })).toHaveFocus()
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(page.getByText("Replying isn't available yet.")).toBeInTheDocument()
      // The draft stays in the open composer
      await expect.element(page.getByRole('textbox', { name: 'Reply' })).toBeVisible()

      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('t')
      await userEvent.keyboard('d')

      await expect
        .element(page.getByText("Adding to Todoist isn't available yet."))
        .toBeInTheDocument()
      await expect.element(page.getByText("Delegating isn't available yet.")).toBeInTheDocument()
      await expect
        .element(heading())
        .toHaveTextContent('Vendor review: can we move sign-off to Thursday?')

      expect(api.posts()).toStrictEqual([])
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
        .element(page.getByText('Sign in again so Linelo can keep reading your mail.'))
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
          .element(page.getByText('Sign in again so Linelo can keep reading your mail.'))
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

      expect(api.posts()).toStrictEqual([])
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
        .element(page.getByText('Sign in again so Linelo can keep reading your mail.'))
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

  it('shows one notice for repeated Delegate presses and keeps the brand colours', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async () => {
      await userEvent.keyboard('d')
      await userEvent.keyboard('d')

      await expect.element(page.getByText("Delegating isn't available yet.")).toBeInTheDocument()

      expect(page.getByText("Delegating isn't available yet.").elements()).toHaveLength(1)
      // Icons rendered at runtime (here the toast's close icon) must not reset the brand tokens
      expect(rootToken('--ui-bg')).toBe(rootToken('--color-off-white'))
    })
  })

  it('shows Inbox zero as the page heading when nothing is left', async () => {
    expect.hasAssertions()

    await withInbox([], async () => {
      await expect.element(heading()).toHaveTextContent('Inbox zero.')
    })
  })
})
