import { NuxtPage, UApp } from '#components'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'
import inboxBuilders from '~/data/inbox-builders'
import { render } from '@nuxt/test-utils/browser'

const { queueItem, storyItem } = inboxBuilders
const first = queueItem({ id: 'first', subject: 'First thread' })
const second = queueItem({ id: 'second', subject: 'Second thread' })
const SEND_KEYS = useKbd().macOS.value ? '{Meta>}{Enter}{/Meta}' : '{Control>}{Enter}{/Control}'

/** Seeds the queue, renders the inbox page, runs the test body, and cleans up. */
async function withInbox(items: Inbox.QueueItem[], run: () => Promise<void>): Promise<void> {
  vi.restoreAllMocks()
  useInboxQueue().reset(items)
  const screen = await render(defineComponent({ render: () => h(UApp, () => h(NuxtPage)) }), {
    route: '/',
  })
  try {
    await run()
  } finally {
    await screen.unmount()
    useToast().clear()
  }
}

function heading(): ReturnType<typeof page.getByRole> {
  return page.getByRole('heading', { level: 1 })
}

function rootToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

describe('inbox page', () => {
  it('marks the message as handled on h and shows the next one', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async () => {
      await expect.element(heading()).toHaveTextContent('First thread')
      await userEvent.keyboard('h')

      await expect.element(heading()).toHaveTextContent('Second thread')
      await expect.element(heading()).toHaveFocus()
    })
  })

  it('brings the message back with Undo on the toast, also after Escape elsewhere', async () => {
    expect.hasAssertions()

    await withInbox([first, second], async () => {
      await expect.element(heading()).toHaveTextContent('First thread')
      await userEvent.keyboard('h')
      await expect.element(page.getByText('Marked as handled')).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      await page.getByRole('button', { name: 'Undo' }).click()

      await expect.element(heading()).toHaveTextContent('First thread')
    })
  })

  it('sends a suggested reply, confirms it and starts the next message fresh', async () => {
    expect.hasAssertions()

    await withInbox([storyItem('thread-vendor-review'), second], async () => {
      await userEvent.keyboard('1')
      await expect.element(page.getByRole('textbox', { name: 'Reply' })).toHaveFocus()
      await userEvent.keyboard(SEND_KEYS)

      await expect.element(heading()).toHaveTextContent('Second thread')
      await expect
        .element(page.getByText('Replied to Lena Hartmann and 2 others'))
        .toBeInTheDocument()
      await expect.element(page.getByRole('button', { name: 'Mark as handled' })).toBeVisible()

      expect(page.getByRole('textbox', { name: 'Reply' }).query()).toBeNull()
    })
  })

  it('says so when the follow-up task fails, after sending the reply', async () => {
    expect.hasAssertions()

    await withInbox([storyItem('thread-vendor-review'), second], async () => {
      vi.spyOn(useTaskManager(), 'createTask').mockRejectedValueOnce(new Error('Todoist is down'))
      vi.spyOn(console, 'error').mockReturnValue()
      await userEvent.keyboard('1')
      await page.getByRole('checkbox').click()
      await page.getByRole('button', { name: 'Send reply' }).click()

      await expect.element(heading()).toHaveTextContent('Second thread')
      await expect.element(page.getByText('Reply sent')).toBeInTheDocument()
      await expect.element(page.getByText("Couldn't add the task to Todoist.")).toBeInTheDocument()
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

      // While the action is in flight the button is disabled and loses focus
      await expect.element(markAsHandled).toBeDisabled()
      await expect.element(markAsHandled).not.toHaveFocus()

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
