import createInboxFixtures from '#shared/data/inbox-fixtures'
import frozen from './demo-answers.json'

/*
 * Development only: the judge of the demo mailbox. It gives the answers Jev gave about
 * each example message when it was last asked (`demo-answers.json`, written by
 * `pnpm ranking:demo-answers`), so the demo shows the product's own ranking without a
 * TypeSafe key and without a call.
 */

const ANSWERS_BY_THREAD: Readonly<Record<string, Ranking.Answers>> = frozen.answers

/** The judge of the demo mailbox, which knows the example messages by their subject. */
function createDemoJudge(): Ranking.Judge {
  const bySubject = new Map(
    createInboxFixtures().flatMap(({ thread }) => {
      const answers = ANSWERS_BY_THREAD[thread.id]
      return answers ? [[thread.subject, answers] as const] : []
    }),
  )
  return {
    // Answers frozen from another Jev count as another judge's
    id: `demo/${frozen.judge}`,
    judge: input => {
      const answers = bySubject.get(input.subject)
      return answers
        ? Promise.resolve({ answers })
        : Promise.reject(new Error('The demo judge knows no answer for this message'))
    },
  }
}

export default createDemoJudge
