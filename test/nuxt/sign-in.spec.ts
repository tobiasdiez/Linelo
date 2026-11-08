import { describe, expect, it, vi } from 'vite-plus/test'
import fakeInbox from './fake-inbox-api'
import inboxBuilders from '~/data/inbox-builders'
import { page } from 'vite-plus/test/browser'
import renderApp from './render-app'
import stateKeys from '~/data/state-keys'

const { account, queueItem, signedInUser } = inboxBuilders
const inboxItem = queueItem({ id: 'waiting', subject: 'Waiting for you' })

interface Visit {
  /** Signed in already (state filled), or with the session the server answers with. */
  signedIn: boolean
  session?: { user: { name: string; email: string } }
  /** Replaces what `/api/me` answers. */
  me?: () => Response
}

/** Console errors, recorded and kept out of the test output. */
function recordConsoleErrors() {
  return vi.spyOn(console, 'error').mockReturnValue()
}

/** Renders the app at `route` with the given sign-in state, runs the test body, and cleans up. */
async function visit(
  route: string,
  { signedIn, session, me }: Visit,
  run: (
    api: ReturnType<typeof fakeInbox.api>,
    consoleError: ReturnType<typeof recordConsoleErrors>,
  ) => Promise<void>,
) {
  vi.restoreAllMocks()
  const consoleError = recordConsoleErrors()
  clearNuxtState([stateKeys.currentUser, stateKeys.currentUserChecked], { reset: true })
  if (signedIn) {
    useCurrentUser().set(signedInUser)
  }
  useInboxQueue().reset([inboxItem])
  const api = fakeInbox.api([inboxItem])
  api.me.answer =
    me ?? (() => (session ? { ...session, accounts: [account] } : fakeInbox.signedOutMe()))
  const screen = await renderApp(route)
  try {
    await run(api, consoleError)
  } finally {
    await screen.unmount()
    await api.restore()
  }
}

function heading(): ReturnType<typeof page.getByRole> {
  return page.getByRole('heading', { level: 1 })
}

describe('sign-in', () => {
  it('sends a signed-out visitor to sign in', async () => {
    expect.hasAssertions()

    await visit('/', { signedIn: false }, async (_, consoleError) => {
      await expect.element(heading()).toHaveTextContent('Finish your inbox calmly.')
      await expect
        .element(page.getByRole('button', { name: 'Continue with Microsoft' }))
        .toBeVisible()

      // Signed out is an answer, not a failure
      expect(consoleError).not.toHaveBeenCalled()
    })
  })

  it('takes the signed-in user and their mail accounts from the server', async () => {
    expect.hasAssertions()
    const session = { user: { name: 'Lena Hartmann', email: 'lena@northwind.co' } }

    await visit('/', { signedIn: false, session }, async () => {
      await expect.element(heading()).toHaveTextContent('Waiting for you')

      expect(useCurrentUser().user.value).toStrictEqual({ ...session.user, accounts: [account] })
    })
  })

  it('asks again on the next page when the server could not say who is signed in', async () => {
    expect.hasAssertions()
    const session = { user: { name: 'Lena Hartmann', email: 'lena@northwind.co' } }

    await visit(
      '/sign-in',
      { signedIn: false, me: fakeInbox.unavailableResponse },
      async (api, consoleError) => {
        await expect.element(heading()).toHaveTextContent('Finish your inbox calmly.')
        expect(consoleError).toHaveBeenCalledWith(
          'Loading the signed-in user failed',
          expect.anything(),
        )

        api.me.answer = () => ({ ...session, accounts: [account] })
        await navigateTo('/')

        await expect.element(heading()).toHaveTextContent('Waiting for you')
      },
    )
  })

  it('leads a signed-in user from sign-in to the inbox', async () => {
    expect.hasAssertions()

    await visit('/sign-in', { signedIn: true }, async () => {
      await expect.element(heading()).toHaveTextContent('Waiting for you')
    })
  })

  it('explains that the session ended', async () => {
    expect.hasAssertions()

    await visit('/sign-in?reason=expired', { signedIn: false }, async () => {
      await expect
        .element(page.getByText('Your session ended. Sign in again to carry on.'))
        .toBeVisible()
    })
  })

  it('keeps a signed-in user on sign-in when Linelo lost access', async () => {
    expect.hasAssertions()

    await visit('/sign-in?reason=reconnect', { signedIn: true }, async () => {
      await expect
        .element(page.getByText('Sign in again so Linelo can keep reading your mail.'))
        .toBeVisible()
    })
  })

  it.each([
    ['access_denied', "Signing in was cancelled. Continue whenever you're ready."],
    [
      'invalid_request&error_description=AADSTS65001',
      'Your organisation needs to approve Linelo first. Your IT admin can do that.',
    ],
    [
      'account_not_linked',
      'That email address is already linked to a different Microsoft account in Linelo. Sign in with the one you used first.',
    ],
    ['state_mismatch', "Signing in didn't work. Try again."],
  ])('explains a failed sign-in (%s)', async (error, text) => {
    expect.hasAssertions()

    await visit(`/sign-in?error=${error}`, { signedIn: false }, async () => {
      await expect.element(page.getByText(text)).toBeVisible()
    })
  })
})
