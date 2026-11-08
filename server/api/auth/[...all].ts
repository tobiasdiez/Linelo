import auth from '../../utils/auth'

/** Better Auth's endpoints: sign-in, the OAuth callback, session and sign-out. */
export default defineEventHandler(event => auth.handler(toWebRequest(event)))
