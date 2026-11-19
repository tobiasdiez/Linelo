import createDemoJudge from './demo'
import createJevJudge from './jev'

interface Options {
  /** TYPESAFE_API_KEY; without it, real mailboxes are ranked by the rules alone. */
  apiKey: string | undefined
  /** JEV_MODEL, to try another version than the pinned one. */
  model: string | undefined
  fetch: typeof globalThis.fetch
  /** The demo mailbox and its canned judge exist in development only. */
  development: boolean
}

/** The judge for each mailbox: Jev, or the canned one for the demo mailbox. */
function createJudges({ apiKey, model, fetch, development }: Options) {
  const jev = apiKey ? createJevJudge({ apiKey, fetch, model }) : undefined
  const demo = development ? createDemoJudge() : undefined

  /** `undefined`: ranked by the rules alone. */
  function judgeFor(mailbox: Mail.Mailbox): Ranking.Judge | undefined {
    return mailbox.providerId === 'demo' ? demo : jev
  }

  return { judgeFor }
}

export default createJudges
