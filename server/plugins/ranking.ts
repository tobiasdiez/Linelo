/**
 * TYPESAFE_API_KEY is required outside development: without it the server refuses to start,
 * as it does without BETTER_AUTH_SECRET. In development without it, one line says what that
 * means: the demo mailbox gets its canned judge, and other mail is ranked by the rules alone.
 */
export default defineNitroPlugin(() => {
  if (process.env.TYPESAFE_API_KEY) {
    return
  }
  if (!import.meta.dev) {
    throw new Error(
      'TYPESAFE_API_KEY is not set. Outside development Linelo needs it to rank mail.',
    )
  }
  console.warn(
    'Ranking without Jev: TYPESAFE_API_KEY is not set, so mail other than the demo mailbox is ranked by the rules alone (see README).',
  )
})
