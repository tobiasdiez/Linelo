import auth from './auth'

/** The signed-in user of the request with these headers, or a 401. */
async function requireUser(headers: Headers): Promise<{ id: string; name: string; email: string }> {
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }
  return session.user
}

export default requireUser
