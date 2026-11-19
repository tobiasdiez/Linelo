import createInboxFixtures from '#shared/data/inbox-fixtures'

/*
 * Development only: the judge of the demo mailbox, with canned answers per example
 * thread, so the whole ranking runs without a TypeSafe key. It says "asks you" for the
 * three colleagues' asks, "asks nothing" for the rest, and "automated" for the delivery
 * notice, the scan and the newsletter. It does not read time.
 */

/** Not confident about time pressure: it moves nothing. */
const TIME_UNREAD = { score: 1, confidence: 0.3 }
const ASKS: Ranking.Answers = { asksMe: 0.95, automated: 0.03, timePressure: TIME_UNREAD }
const INFORMS: Ranking.Answers = { asksMe: 0.1, automated: 0.05, timePressure: TIME_UNREAD }
const AUTOMATED: Ranking.Answers = { asksMe: 0.05, automated: 0.95, timePressure: TIME_UNREAD }

const ANSWERS_BY_THREAD: Readonly<Record<string, Ranking.Answers>> = {
  'thread-vendor-review': ASKS,
  'thread-offsite-venue': ASKS,
  'thread-migration-plan': ASKS,
  'thread-staging': INFORMS,
  'thread-newsletter': AUTOMATED,
  'thread-delivery': AUTOMATED,
  'thread-scan': AUTOMATED,
}

/** The judge of the demo mailbox, which knows the example messages by their subject. */
function createDemoJudge(): Ranking.Judge {
  const bySubject = new Map(
    createInboxFixtures().flatMap(({ thread }) => {
      const answers = ANSWERS_BY_THREAD[thread.id]
      return answers ? [[thread.subject, answers] as const] : []
    }),
  )
  return {
    id: 'demo/1',
    judge: input => {
      const answers = bySubject.get(input.subject)
      return answers
        ? Promise.resolve({ answers })
        : Promise.reject(new Error('The demo judge knows no answer for this message'))
    },
  }
}

export default createDemoJudge
