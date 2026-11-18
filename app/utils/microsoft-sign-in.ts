import authClient from './auth-client'

/** What the sign-in with Microsoft is started with: back to `returnTo`, with `?error=` when it did not work. */
function optionsFor(returnTo: string): {
  provider: 'microsoft'
  callbackURL: string
  errorCallbackURL: string
} {
  return { provider: 'microsoft', callbackURL: returnTo, errorCallbackURL: returnTo }
}

/**
 * Starts the sign-in with Microsoft, which comes back to `returnTo`. For an account that
 * is signed in already it updates its tokens and asks for the permissions it lacks. In one
 * object, so tests can stand in for leaving the page.
 */
const microsoftSignIn = {
  optionsFor,
  start: (returnTo: string) => authClient.signIn.social(optionsFor(returnTo)),
}

export default microsoftSignIn
