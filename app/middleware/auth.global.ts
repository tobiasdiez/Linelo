import stateKeys from '~/data/state-keys'

const SIGN_IN = '/sign-in'

/**
 * Signed out, every page leads to sign-in; signed in, sign-in leads to the inbox.
 * The signed-in user and their mail accounts are loaded once per app session,
 * during server rendering (with the request's cookie), into the current-user state.
 */
export default defineNuxtRouteMiddleware(async to => {
  // Only pages need a session: unknown paths get the 404 page, and Storybook's canvas route renders no page
  if (to.matched.every(record => !record.components?.default)) {
    return undefined
  }
  const currentUser = useCurrentUser()
  const checked = useState(stateKeys.currentUserChecked, () => false)
  if (!currentUser.user.value && !checked.value) {
    const me = await useRequestFetch()<Inbox.MeResponse>('/api/me').catch((error: unknown) => {
      // Signed out for this navigation only: the next one asks again
      console.error('Loading the signed-in user failed', error)
      return undefined
    })
    if (me) {
      checked.value = true
      if (me.user) {
        currentUser.set({ ...me.user, accounts: me.accounts })
      }
    }
  }
  if (!currentUser.user.value) {
    return to.path === SIGN_IN ? undefined : navigateTo(SIGN_IN)
  }
  // Signed in, the sign-in page is only for signing in again, or for reading why that failed
  if (to.path === SIGN_IN && !to.query.reason && !to.query.error) {
    return navigateTo('/')
  }
  return undefined
})
