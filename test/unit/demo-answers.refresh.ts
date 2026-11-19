/// <reference types="node" />
import { describe, expect, it } from 'vite-plus/test'
import createDemoProvider from '#server/mail/providers/demo'
import createJevJudge from '#server/ranking/judges/jev'
import judgeInput from '#server/ranking/judges/input'
import mailFakes from './mail-fakes'
import mailboxOwner from '#shared/data/mailbox-owner'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

/*
 * Not a spec: `pnpm ranking:demo-answers` runs it to ask the real Jev about the demo
 * mailbox's messages, one call each, and to freeze its answers as the demo judge's
 * (`server/ranking/judges/demo-answers.json`). It needs TYPESAFE_API_KEY in `.env`. Jev
 * does not answer the same to the hundredth every time, so every run changes the file a
 * little; the golden spec's numbers are updated by the same command.
 */

const FILE = path.resolve(import.meta.dirname, '../../server/ranking/judges/demo-answers.json')
/** More unread messages than the demo mailbox will ever hold. */
const ALL = 50
/** Answers are kept to the hundredth, which is finer than Jev repeats itself. */
const HUNDREDTHS = 100

function rounded(value: number): number {
  return Math.round(value * HUNDREDTHS) / HUNDREDTHS
}

function frozenAnswers({ asksMe, automated, timePressure }: Ranking.Answers): Ranking.Answers {
  return {
    asksMe: rounded(asksMe),
    automated: rounded(automated),
    timePressure: {
      score: rounded(timePressure.score),
      confidence: rounded(timePressure.confidence),
    },
  }
}

/** Jev with the pinned model, so the frozen answers are those of the version the product asks. */
function jev(): Ranking.Judge {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    throw new Error('TYPESAFE_API_KEY is not set: put it into .env to ask Jev (see README)')
  }
  return createJevJudge({ apiKey, fetch: globalThis.fetch })
}

describe('the demo judge', () => {
  it("is given Jev's answers about every example message", async () => {
    expect.hasAssertions()
    const judge = jev()
    const envelopes = await createDemoProvider().listUnread(
      mailFakes.connection('demo-mailbox', mailboxOwner),
      { limit: ALL },
    )
    const { signal } = new AbortController()

    const judged = await Promise.all(
      envelopes.map(async envelope => {
        const { answers } = await judge.judge(judgeInput(envelope, mailboxOwner), { signal })
        return [envelope.threadId, frozenAnswers(answers)] as const
      }),
    )

    const answers = Object.fromEntries(judged)
    // The demo judge knows a message by its thread: two unread messages in one would share an answer
    expect(Object.keys(answers)).toHaveLength(envelopes.length)

    await writeFile(FILE, `${JSON.stringify({ judge: judge.id, answers }, undefined, 2)}\n`)
  })
})
