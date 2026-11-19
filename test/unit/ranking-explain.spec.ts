import { describe, expect, it } from 'vite-plus/test'
import explain from '#server/ranking/explain'
import rankingFakes from './ranking-fakes'
import scoring from '#server/ranking/score'

const CLOSING = 'Nothing in it should need an answer.'

/** Points as the weights give them; for the line only their size and sign matter. */
const POINTS = {
  flag: 30,
  asksMe: 10,
  asksNothing: -6,
  urgent: 10,
  soon: 5,
  notUrgent: -5,
  timeWords: 8,
  fewTimeWords: 4,
  writesOften: 18,
  writesMost: 24,
  hasWritten: 10,
  wroteRecently: 4,
  toMeAlone: 10,
  toMeWithOthers: 6,
  recency: 6,
  sameOrganisation: 5,
  discussionList: -8,
  bulk: -40,
  automatedAddress: -15,
  automated: -14,
  sortedOther: -8,
} as const

function factor(name: Ranking.FactorName, points: number, judged = false): Ranking.Factor {
  return { name, points, judged }
}

function evaluation(
  factors: Ranking.Factor[],
  { suggestHandled = false }: { suggestHandled?: boolean } = {},
): Ranking.Evaluation {
  return {
    score: 50,
    tier: 'normal',
    factors,
    bulk: false,
    assisted: factors.some(entry => entry.judged),
    suggestHandled,
  }
}

/** The line for one reason next to a reason that has nothing to say. */
function lineFor(reason: Ranking.Factor): string {
  const recency = factor('recency', POINTS.recency)
  return explain.whyShown(evaluation([reason, recency]))
}

describe('ranking: why a message is shown', () => {
  it.each([
    { reason: factor('flag', POINTS.flag), sentence: 'You flagged this in Outlook.' },
    {
      reason: factor('asksMe', POINTS.asksMe, true),
      sentence: 'Reads like it asks you for an answer.',
    },
    {
      reason: factor('timePressure', POINTS.soon, true),
      sentence: 'Reads like it is needed soon.',
    },
    {
      reason: factor('timeWords', POINTS.timeWords),
      sentence: 'Mentions today or a day close by.',
    },
    {
      reason: factor('writesOften', POINTS.writesOften),
      sentence: 'From someone you write to often.',
    },
    {
      reason: factor('hasWritten', POINTS.hasWritten),
      sentence: 'From someone you have written to.',
    },
    { reason: factor('toMeAlone', POINTS.toMeAlone), sentence: 'Sent to you alone.' },
    { reason: factor('cc', 0), sentence: 'You are in Cc.' },
    {
      reason: factor('discussionList', POINTS.discussionList),
      sentence: 'A newsletter or mailing list.',
    },
    {
      reason: factor('automatedAddress', POINTS.automatedAddress),
      sentence: 'Sent by a system, not a person.',
    },
    {
      reason: factor('automated', POINTS.automated, true),
      sentence: 'Sent by a system, not a person.',
    },
    {
      reason: factor('sortedOther', POINTS.sortedOther),
      sentence: 'Outlook sorted it under Other.',
    },
  ])('says $reason.name in one sentence', ({ reason, sentence }) => {
    expect(lineFor(reason)).toBe(sentence)
  })

  it('has nothing to say about reasons without a sentence', () => {
    const quiet = evaluation([
      factor('recency', POINTS.recency),
      factor('sameOrganisation', POINTS.sameOrganisation),
      factor('toMeWithOthers', POINTS.toMeWithOthers),
      factor('asksNothing', POINTS.asksNothing, true),
      factor('timePressure', POINTS.notUrgent, true),
    ])

    expect(explain.whyShown(quiet)).toBe('Unread in your inbox.')
  })

  it('names the reason that moved the item most, then the next one of another group', () => {
    const line = explain.whyShown(
      evaluation([
        factor('hasWritten', POINTS.hasWritten),
        factor('wroteRecently', POINTS.wroteRecently),
        factor('asksMe', POINTS.asksMe, true),
        factor('timeWords', POINTS.timeWords),
        factor('timePressure', POINTS.urgent, true),
        factor('toMeAlone', POINTS.toMeAlone),
      ]),
    )

    // Time: 18 points in all, said by its strongest part; standing: 14; the ask and the addressing: 10 each
    expect(line).toBe('Reads like it is needed soon. From someone you have written to.')
  })

  it('names the earlier group first on a tie, and each group once', () => {
    const tie = explain.whyShown(
      evaluation([
        factor('toMeAlone', POINTS.toMeAlone),
        factor('asksMe', POINTS.asksMe, true),
        factor('hasWritten', POINTS.hasWritten),
      ]),
    )
    const once = explain.whyShown(
      evaluation([
        factor('timeWords', POINTS.fewTimeWords),
        factor('timePressure', POINTS.urgent, true),
        factor('cc', 0),
      ]),
    )

    expect(tie).toBe('Reads like it asks you for an answer. From someone you have written to.')
    expect(once).toBe('Reads like it is needed soon. You are in Cc.')
  })

  it('leads with the flag, whatever else moved the item', () => {
    const line = explain.whyShown(
      evaluation([
        factor('flag', 0),
        factor('writesOften', POINTS.writesMost),
        factor('asksMe', POINTS.asksMe, true),
      ]),
    )

    expect(line).toBe('You flagged this in Outlook. From someone you write to often.')
  })

  it('ends bulk and automated mail with the closing sentence', () => {
    const newsletter = evaluation(
      [
        factor('bulk', POINTS.bulk),
        factor('toMeAlone', POINTS.toMeAlone),
        factor('automated', POINTS.automated, true),
      ],
      { suggestHandled: true },
    )
    const notice = evaluation(
      [factor('automatedAddress', POINTS.automatedAddress), factor('toMeAlone', POINTS.toMeAlone)],
      { suggestHandled: true },
    )

    expect(explain.whyShown(newsletter)).toBe(`A newsletter or mailing list. ${CLOSING}`)
    expect(explain.whyShown(notice)).toBe(`Sent by a system, not a person. ${CLOSING}`)
  })

  it('suggests Mark as handled exactly when the evaluation says so', () => {
    const handled = { kind: 'handled', id: 'handled', label: 'Nothing to act on' }
    const asks = evaluation([factor('asksMe', POINTS.asksMe, true)])

    expect(explain.suggestions(evaluation([], { suggestHandled: true }))).toStrictEqual([handled])
    expect(explain.suggestions(asks)).toStrictEqual([])
  })
})

describe('ranking: no closing sentence against the owner or the model', () => {
  const now = new Date('2026-10-12T10:30:00Z')
  const facts: Ranking.Facts = {
    senderKey: 'sender',
    sameOrganisation: false,
    addressing: 'alone',
    flagged: false,
    importance: 'normal',
    unsubscribable: false,
    automatedAddress: false,
    timeWords: 'none',
  }
  const asks: Ranking.Answers = {
    asksMe: 0.95,
    automated: 0.3,
    timePressure: { score: 1, confidence: 0.9 },
  }

  function explained(overrides: Partial<Ranking.Facts>, answers: Ranking.Answers | null) {
    const result = scoring.evaluate({
      facts: { ...facts, ...overrides },
      correspondents: {},
      answers,
      receivedAt: now,
      now,
    })
    return { whyShown: explain.whyShown(result), suggestions: explain.suggestions(result) }
  }

  it('says a flagged newsletter is flagged, without "Nothing to act on"', () => {
    expect(explained({ unsubscribable: true, flagged: true }, rankingFakes.none)).toStrictEqual({
      whyShown: 'You flagged this in Outlook. A newsletter or mailing list.',
      suggestions: [],
    })
  })

  it('says mail from a no-reply address reads like an ask, when the model reads it so', () => {
    expect(explained({ automatedAddress: true }, asks)).toStrictEqual({
      whyShown: 'Sent by a system, not a person. Reads like it asks you for an answer.',
      suggestions: [],
    })
  })
})
