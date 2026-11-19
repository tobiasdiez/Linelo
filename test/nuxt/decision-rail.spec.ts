import { InboxDecisionRail, UApp } from '#components'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'
import composer from './composer-locators'
import inboxBuilders from '~/data/inbox-builders'
import latestUnreadMessage from '#shared/utils/latest-unread-message'
import { render } from '@nuxt/test-utils/browser'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

type ResolveHandler = (action: Inbox.TerminalAction) => void

interface RailSpies {
  onResolve: ReturnType<typeof vi.fn<ResolveHandler>>
  /** Whether an action is in flight, as the page tells the rail. */
  busy: ReturnType<typeof ref<boolean>>
}

const { mailboxOwner, message, participant, queueItem, signedInUser, storyItem, storySuggestion } =
  inboxBuilders
const vendorReview = storyItem('thread-vendor-review')
const confirm = storySuggestion('thread-vendor-review', 'vendor-review-confirm', 'reply')
const recipients = replyAllRecipients(latestUnreadMessage(vendorReview.thread), mailboxOwner)
const jonas = participant('Jonas Weber')
/** Longer than the rail waits before it shows a spinner. */
const PENDING_WAIT_MS = 400
const { forwardButton, noteBox, recipientBox, replyBox, sendKeys: SEND_KEYS } = composer

/** Renders the rail inside `UApp`, runs the test body, and unmounts it again. */
async function withRail(
  run: (spies: RailSpies) => Promise<void>,
  { item = vendorReview, busy = false, mode = 'decide' } = {},
): Promise<void> {
  useCurrentUser().set(signedInUser)
  const spies: RailSpies = { onResolve: vi.fn<ResolveHandler>(), busy: ref(busy) }
  const host = defineComponent({
    render: () =>
      h(UApp, () =>
        h(InboxDecisionRail, {
          item,
          busy: spies.busy.value,
          mode,
          onResolve: spies.onResolve,
        }),
      ),
  })
  const screen = await render(host)
  try {
    await run(spies)
  } finally {
    await screen.unmount()
  }
}

function suggested(): ReturnType<typeof page.getByRole> {
  return page.getByRole('region', { name: 'Suggested' })
}

function holdKey(key: string): void {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key }))
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true }))
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true }))
}

describe('decision rail', () => {
  it('marks the suggestions as AI only where a model contributed', async () => {
    expect.hasAssertions()
    // The handled suggestion from a List-Unsubscribe header alone
    const byRules = { ...storyItem('thread-newsletter'), assisted: false }

    await withRail(async () => {
      await expect.element(suggested().getByText('AI', { exact: true })).toBeVisible()
    })
    await withRail(
      async () => {
        await expect.element(suggested().getByText('Nothing to act on')).toBeVisible()
        await expect.element(suggested().getByText('AI', { exact: true })).not.toBeInTheDocument()
      },
      { item: byRules },
    )
  })

  it('opens a pre-filled composer for suggestion 1, ready to send', async () => {
    expect.hasAssertions()

    await withRail(async () => {
      await userEvent.keyboard('1')

      await expect.element(replyBox()).toHaveValue(confirm.draft)
      await expect.element(replyBox()).toHaveFocus()

      expect(replyBox().element()).toHaveProperty('selectionStart', confirm.draft.length)
    })
  })

  it('returns to the suggestions on Escape, focusing the one that was chosen', async () => {
    expect.hasAssertions()

    await withRail(async () => {
      await userEvent.keyboard('1')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard('{Escape}')

      await expect
        .element(page.getByRole('button', { name: /Confirm Thursday 14:00/ }))
        .toHaveFocus()
    })
  })

  it('returns focus to the Reply button after Back on a manual reply', async () => {
    expect.hasAssertions()

    await withRail(async () => {
      await userEvent.keyboard('r')
      await expect.element(replyBox()).toHaveFocus()
      await page.getByRole('button', { name: 'Back' }).click()

      await expect.element(page.getByRole('button', { name: 'Reply', exact: true })).toHaveFocus()
    })
  })

  it('keeps a separate draft per suggestion and an empty one for a manual reply', async () => {
    expect.hasAssertions()

    const keepFriday = storySuggestion('thread-vendor-review', 'vendor-review-keep-friday', 'reply')
    await withRail(async () => {
      await userEvent.keyboard('1')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard(' See you then.')
      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('2')

      await expect.element(replyBox()).toHaveValue(keepFriday.draft)

      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('r')

      await expect.element(replyBox()).toHaveValue('')

      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('1')

      await expect.element(replyBox()).toHaveValue(`${confirm.draft} See you then.`)
    })
  })

  it('ignores letter shortcuts while typing', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('r')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard('h')

      await expect.element(replyBox()).toHaveValue('h')

      expect(onResolve).not.toHaveBeenCalled()
    })
  })

  it('sends the reply to everyone on the thread on meta+Enter', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('1')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard(SEND_KEYS)

      expect(onResolve).toHaveBeenCalledExactlyOnceWith({
        kind: 'reply',
        body: confirm.draft,
        ...recipients,
      })
    })
  })

  it('adds the follow-up task when its box is checked', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('1')
      await page.getByRole('checkbox').click()
      await page.getByRole('button', { name: 'Send reply' }).click()

      expect(onResolve).toHaveBeenCalledExactlyOnceWith({
        kind: 'reply',
        body: confirm.draft,
        ...recipients,
        followUpTask: confirm.followUpTask,
      })
    })
  })

  it('does not send an empty reply', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('r')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(page.getByRole('button', { name: 'Send reply' })).toBeDisabled()

      expect(onResolve).not.toHaveBeenCalled()
    })
  })

  it('resolves only once while h is held down', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      holdKey('h')

      expect(onResolve).toHaveBeenCalledExactlyOnceWith({ kind: 'handled' })
    })
  })

  it('resolves at once for handled and task suggestions picked by number', async () => {
    expect.hasAssertions()

    await withRail(
      async ({ onResolve }) => {
        await userEvent.keyboard('1')

        expect(onResolve).toHaveBeenCalledExactlyOnceWith({ kind: 'handled' })
      },
      { item: storyItem('thread-staging') },
    )
    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('3')

      expect(onResolve).toHaveBeenCalledExactlyOnceWith({
        kind: 'task',
        task: storySuggestion('thread-vendor-review', 'vendor-review-task', 'task').task,
      })
    })
  })

  it('adds the suggested task on T', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('t')

      expect(onResolve).toHaveBeenCalledExactlyOnceWith({
        kind: 'task',
        task: storySuggestion('thread-vendor-review', 'vendor-review-task', 'task').task,
      })
    })
  })

  it('names the task after the subject on T when no task is suggested', async () => {
    expect.hasAssertions()

    const staging = storyItem('thread-staging')
    await withRail(
      async ({ onResolve }) => {
        await userEvent.keyboard('t')

        expect(onResolve).toHaveBeenCalledExactlyOnceWith({
          kind: 'task',
          task: { title: staging.thread.subject },
        })
      },
      { item: staging },
    )
  })

  it('opens the forward composer on D, ready to type the address', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('d')

      await expect.element(recipientBox()).toHaveFocus()
      await expect.element(recipientBox()).toHaveValue('')
      await expect
        .element(
          page
            .getByRole('region', { name: 'Forward' })
            .getByText("Forwards Lena Hartmann's message and attachments."),
        )
        .toBeVisible()
      await expect.element(forwardButton()).toBeDisabled()
      await expect.element(page.getByText('Forwarding resolves this message.')).toBeVisible()

      expect(onResolve).not.toHaveBeenCalled()
    })
  })

  it('keeps Forward disabled until the address is valid, and says so once the field is left', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('d')
      await userEvent.keyboard('jonas.weber@')
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(forwardButton()).toBeDisabled()
      // Not while still typing
      await expect.element(page.getByText('Enter an email address.')).not.toBeInTheDocument()

      await userEvent.tab()

      await expect.element(noteBox()).toHaveFocus()
      await expect.element(recipientBox()).toHaveAccessibleDescription('Enter an email address.')
      await expect.element(recipientBox()).toHaveAttribute('aria-invalid', 'true')

      await recipientBox().click()
      await userEvent.keyboard('northwind.co')

      await expect.element(page.getByText('Enter an email address.')).not.toBeInTheDocument()
      await expect.element(forwardButton()).toBeEnabled()

      expect(onResolve).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['a thread participant by address', 'jonas.weber@northwind.co', jonas],
    [
      'an unknown address',
      'ops@example.com',
      { name: 'ops@example.com', email: 'ops@example.com' },
    ],
    [
      'a name and an address',
      'Jonas W. <jonas.weber@northwind.co>',
      { name: 'Jonas W.', email: jonas.email },
    ],
  ])('forwards to %s with the note on meta+Enter', async (_, typed, to) => {
    expect.hasAssertions()

    await withRail(
      async ({ onResolve }) => {
        await userEvent.keyboard('d')
        await userEvent.keyboard(typed)
        await userEvent.tab()
        await userEvent.keyboard('Could you check the database part?')
        await userEvent.keyboard(SEND_KEYS)

        expect(onResolve).toHaveBeenCalledExactlyOnceWith({
          kind: 'delegate',
          to,
          note: 'Could you check the database part?',
        })
      },
      { item: storyItem('thread-migration-plan') },
    )
  })

  it('ignores letter and number shortcuts while typing the address and the note', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve }) => {
      await userEvent.keyboard('d')
      await userEvent.keyboard('h1')
      await userEvent.tab()
      await userEvent.keyboard('rt')

      await expect.element(recipientBox()).toHaveValue('h1')
      await expect.element(noteBox()).toHaveValue('rt')

      expect(onResolve).not.toHaveBeenCalled()
    })
  })

  it('returns focus to Delegate on Escape, also after a suggestion reply was opened first', async () => {
    expect.hasAssertions()

    await withRail(async () => {
      await userEvent.keyboard('1')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('d')
      await expect.element(recipientBox()).toHaveFocus()
      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('button', { name: 'Delegate' })).toHaveFocus()
    })
  })

  it('keeps the address and the note when the forward composer is opened again', async () => {
    expect.hasAssertions()

    await withRail(async () => {
      await userEvent.keyboard('d')
      await userEvent.keyboard('jonas.weber@northwind.co')
      await userEvent.tab()
      await userEvent.keyboard('For you.')
      await page.getByRole('button', { name: 'Back' }).click()
      await userEvent.keyboard('d')

      await expect.element(recipientBox()).toHaveValue('jonas.weber@northwind.co')
      await expect.element(noteBox()).toHaveValue('For you.')
      await expect.element(forwardButton()).toBeEnabled()
    })
  })

  it('returns focus to Reply after Back from a manual reply, not to a suggestion chosen earlier', async () => {
    expect.hasAssertions()

    await withRail(async () => {
      await userEvent.keyboard('1')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('r')
      await expect.element(replyBox()).toHaveFocus()
      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('button', { name: 'Reply', exact: true })).toHaveFocus()
    })
  })

  it('points out a malformed address kept from before right away', async () => {
    expect.hasAssertions()

    await withRail(async () => {
      await userEvent.keyboard('d')
      await userEvent.keyboard('jonas@')
      await userEvent.keyboard('{Escape}')
      await userEvent.keyboard('d')

      await expect.element(recipientBox()).toHaveAccessibleDescription('Enter an email address.')
    })
  })

  it('keeps the forward composer, read-only, while forwarding', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve, busy }) => {
      onResolve.mockImplementation(() => {
        busy.value = true
      })
      await userEvent.keyboard('d')
      await userEvent.keyboard('jonas.weber@northwind.co')
      await userEvent.tab()
      await userEvent.keyboard('For you.')
      await userEvent.keyboard(SEND_KEYS)
      await userEvent.keyboard(' More{Escape}')
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(noteBox()).toHaveAttribute('readonly')
      await expect.element(noteBox()).toHaveValue('For you.')
      await expect.element(noteBox()).toHaveFocus()
      await expect.element(recipientBox()).toHaveAttribute('readonly')
      await expect.element(page.getByRole('button', { name: 'Back' })).toBeDisabled()
      // Still focusable, with a spinner where the shortcut was
      await expect.element(forwardButton()).toHaveAttribute('aria-disabled', 'true')
      await expect.element(forwardButton()).toHaveAttribute('data-pending')

      expect(onResolve).toHaveBeenCalledExactlyOnceWith({
        kind: 'delegate',
        to: { name: 'jonas.weber@northwind.co', email: 'jonas.weber@northwind.co' },
        note: 'For you.',
      })
    })
  })

  it('does not offer to send a reply without anyone to send it to', async () => {
    expect.hasAssertions()

    const unknownSender = queueItem({
      messages: [message({ from: { name: 'Unknown sender', email: '' }, to: [mailboxOwner] })],
    })
    await withRail(
      async ({ onResolve }) => {
        await userEvent.keyboard('r')
        await userEvent.keyboard('Thanks.')
        await userEvent.keyboard(SEND_KEYS)

        await expect.element(page.getByRole('button', { name: 'Send reply' })).toBeDisabled()
        await expect.element(page.getByText('No one to reply to.')).toBeVisible()

        expect(onResolve).not.toHaveBeenCalled()
      },
      { item: unknownSender },
    )
  })

  it("replies to and forwards the latest unread message, not the user's own later reply", async () => {
    expect.hasAssertions()

    const lena = participant('Lena Hartmann')
    const priya = participant('Priya Nair')
    const endsWithOwnReply = queueItem({
      messages: [
        message({ id: 'ask', from: lena, to: [mailboxOwner], cc: [priya] }),
        message({
          id: 'own-reply',
          from: mailboxOwner,
          to: [participant('Marco Bellini')],
          unread: false,
        }),
      ],
    })
    await withRail(
      async ({ onResolve }) => {
        await userEvent.keyboard('r')
        await userEvent.keyboard('Thursday works.')
        await userEvent.keyboard(SEND_KEYS)

        expect(onResolve).toHaveBeenCalledExactlyOnceWith({
          kind: 'reply',
          body: 'Thursday works.',
          to: [lena],
          cc: [priya],
        })

        await userEvent.keyboard('{Escape}')
        await userEvent.keyboard('d')

        await expect.element(page.getByText("Forwards Lena Hartmann's message.")).toBeVisible()
      },
      { item: endsWithOwnReply },
    )
  })

  it('blocks the actions while an action is in flight', async () => {
    expect.hasAssertions()

    await withRail(
      async ({ onResolve }) => {
        await userEvent.keyboard('h')

        await expect
          .element(page.getByRole('button', { name: 'Mark as handled' }))
          .toHaveAttribute('aria-disabled', 'true')

        expect(onResolve).not.toHaveBeenCalled()
      },
      { busy: true },
    )
  })

  it('keeps the reply composer, read-only, while the reply is being sent', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve, busy }) => {
      onResolve.mockImplementation(() => {
        busy.value = true
      })
      await userEvent.keyboard('r')
      await userEvent.keyboard('Thursday works.')
      await userEvent.keyboard(SEND_KEYS)
      // Typed during a slow send: neither lost nor shown as if sent
      await userEvent.keyboard(' See you.{Escape}')

      await expect.element(replyBox()).toHaveAttribute('readonly')
      await expect.element(replyBox()).toHaveValue('Thursday works.')
      await expect.element(replyBox()).toHaveFocus()
      await expect.element(page.getByRole('button', { name: 'Back' })).toBeDisabled()
      await expect
        .element(page.getByRole('button', { name: 'Send reply' }))
        .toHaveAttribute('aria-disabled', 'true')

      busy.value = false

      await expect.element(replyBox()).not.toHaveAttribute('readonly')
      await expect.element(replyBox()).toHaveValue('Thursday works.')
    })
  })

  it('shows a spinner on the pressed action only when the wait is noticeable', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve, busy }) => {
      onResolve.mockImplementation(() => {
        busy.value = true
      })
      const markAsHandled = page.getByRole('button', { name: 'Mark as handled' })
      // A quick answer: no spinner, also not after the delay
      await userEvent.keyboard('h')
      busy.value = false
      await new Promise(resolve => {
        setTimeout(resolve, PENDING_WAIT_MS)
      })

      expect(markAsHandled.element()).not.toHaveAttribute('data-pending')

      // A slow one: the spinner comes after the delay, on the pressed action
      await userEvent.keyboard('h')

      expect(markAsHandled.element()).not.toHaveAttribute('data-pending')

      await expect.element(markAsHandled).toHaveAttribute('data-pending')
      await expect
        .element(page.getByRole('button', { name: 'Add to Todoist' }))
        .not.toHaveAttribute('data-pending')
    })
  })
})
