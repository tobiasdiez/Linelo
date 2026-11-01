import { InboxDecisionRail, UApp } from '#components'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'
import inboxBuilders from '~/data/inbox-builders'
import latestMessage from '#shared/utils/latest-message'
import { render } from '@nuxt/test-utils/browser'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

type ResolveHandler = (action: Inbox.TerminalAction) => void
type DelegateHandler = () => void

interface RailSpies {
  onResolve: ReturnType<typeof vi.fn<ResolveHandler>>
  onDelegate: ReturnType<typeof vi.fn<DelegateHandler>>
}

const { currentUser, storyItem, storySuggestion } = inboxBuilders
const vendorReview = storyItem('thread-vendor-review')
const confirm = storySuggestion('thread-vendor-review', 'vendor-review-confirm', 'reply')
const recipients = replyAllRecipients(latestMessage(vendorReview.thread), currentUser)
const SEND_KEYS = useKbd().macOS.value ? '{Meta>}{Enter}{/Meta}' : '{Control>}{Enter}{/Control}'

/** Renders the rail inside `UApp`, runs the test body, and unmounts it again. */
async function withRail(
  run: (spies: RailSpies) => Promise<void>,
  { item = vendorReview, busy = false, mode = 'decide' } = {},
): Promise<void> {
  const spies: RailSpies = {
    onResolve: vi.fn<ResolveHandler>(),
    onDelegate: vi.fn<DelegateHandler>(),
  }
  const host = defineComponent({
    render: () => h(UApp, () => h(InboxDecisionRail, { item, busy, mode, ...spies })),
  })
  const screen = await render(host)
  try {
    await run(spies)
  } finally {
    await screen.unmount()
  }
}

function replyBox(): ReturnType<typeof page.getByRole> {
  return page.getByRole('textbox', { name: 'Reply' })
}

function holdKey(key: string): void {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key }))
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true }))
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true }))
}

describe('decision rail', () => {
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

  it('leaves delegating to the parent on D', async () => {
    expect.hasAssertions()

    await withRail(async ({ onResolve, onDelegate }) => {
      await userEvent.keyboard('d')

      expect(onDelegate).toHaveBeenCalledExactlyOnceWith()
      expect(onResolve).not.toHaveBeenCalled()
    })
  })

  it('blocks the actions while an action is in flight', async () => {
    expect.hasAssertions()

    await withRail(
      async ({ onResolve }) => {
        await userEvent.keyboard('h')

        await expect.element(page.getByRole('button', { name: 'Mark as handled' })).toBeDisabled()

        expect(onResolve).not.toHaveBeenCalled()
      },
      { busy: true },
    )
  })

  it('stays in the composer while the reply is being sent', async () => {
    expect.hasAssertions()

    await withRail(
      async () => {
        await userEvent.keyboard('{Escape}')

        await expect.element(page.getByRole('button', { name: 'Back' })).toBeDisabled()
        await expect.element(replyBox()).toBeInTheDocument()
      },
      { busy: true, mode: 'reply' },
    )
  })
})
