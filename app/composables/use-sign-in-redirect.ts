import signInReason from '~/utils/sign-in-reason'
import stateKeys from '~/data/state-keys'

interface SignInRedirect {
  /**
   * Leaves for the sign-in page when the failed API call says the session ended
   * or Linelo lost access to the mailbox. Resolves to whether it did; then there
   * is nothing left to report.
   */
  leaveIfSignedOut: (error: unknown) => Promise<boolean>
}

function useSignInRedirect(): SignInRedirect {
  const nuxtApp = useNuxtApp()

  async function leaveIfSignedOut(error: unknown): Promise<boolean> {
    const reason = signInReason(error)
    if (!reason) {
      return false
    }
    await nuxtApp.runWithContext(async () => {
      // Nothing of this inbox stays behind, and the middleware asks the server who is signed in
      clearNuxtState(Object.values(stateKeys), { reset: true })
      await navigateTo({ path: '/sign-in', query: { reason } })
    })
    return true
  }

  return { leaveIfSignedOut }
}

export default useSignInRedirect
