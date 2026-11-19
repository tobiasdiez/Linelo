import { describe, expect, it } from 'vite-plus/test'
import calendarTime from '#shared/utils/calendar-time'
import rankingFakes from './ranking-fakes'
import scoring from '#server/ranking/score'

const MS_PER_DAY = calendarTime.MILLISECONDS_PER_DAY
const NOW = new Date('2026-10-12T10:30:00Z')
const BASE = 40
const BULK_CEILING = 30
const FLAG_FLOOR = 90
const BOUND = 20
/** Ten days old: no recency points either way. */
const NEUTRAL_AGE = 10
/** Long enough ago that writing to someone does not count as recent. */
const LONG_AGO = 20
const RECENTLY = 3

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString()
}

/** Facts that move nothing: in Cc, Focused, no marks, no time words. */
const NEUTRAL: Ranking.Facts = {
  senderKey: 'sender',
  sameOrganisation: false,
  addressing: 'cc',
  flagged: false,
  importance: 'normal',
  sorting: 'focused',
  unsubscribable: false,
  automatedAddress: false,
  timeWords: 'none',
}
const ONCE: Ranking.Standing = { sent: 1, lastSentAt: daysAgo(LONG_AGO) }
const OFTEN: Ranking.Standing = { sent: 12, lastSentAt: NOW.toISOString() }
/** The score of the neutral facts from someone written to once: the base and 10. */
const KNOWN = 50

interface Case {
  facts?: Partial<Ranking.Facts>
  standing?: Ranking.Standing
  answers?: Ranking.Answers
  age?: number
}

function evaluate({ facts = {}, standing, answers, age = NEUTRAL_AGE }: Case): Ranking.Evaluation {
  return scoring.evaluate({
    facts: { ...NEUTRAL, ...facts },
    correspondents: standing ? { [NEUTRAL.senderKey]: standing } : {},
    answers: answers ?? rankingFakes.none,
    receivedAt: new Date(daysAgo(age)),
    now: NOW,
  })
}

const NO_TIME = { score: 1, confidence: 1 }
const UNSURE = 0.5
/** The highest level of time pressure. */
const TODAY = 3

describe('ranking: the rules', () => {
  it.each([
    { reason: 'nothing', score: BASE },
    {
      reason: 'writing to the sender 10 times or more',
      standing: { ...ONCE, sent: 10 },
      score: 64,
    },
    { reason: 'writing to the sender 3 to 9 times', standing: { ...ONCE, sent: 3 }, score: 58 },
    { reason: 'writing to the sender once or twice', standing: ONCE, score: 50 },
    {
      reason: 'writing to the sender within 14 days',
      standing: { sent: 1, lastSentAt: daysAgo(RECENTLY) },
      score: 54,
    },
    { reason: 'the same organisation', facts: { sameOrganisation: true }, score: 45 },
    { reason: 'To me alone', facts: { addressing: 'alone' }, score: 50 },
    { reason: 'To me with others', facts: { addressing: 'withOthers' }, score: 46 },
    { reason: 'not addressed to me', facts: { addressing: 'none' }, score: 34 },
    {
      reason: 'importance with standing',
      facts: { importance: 'high' },
      standing: ONCE,
      score: 54,
    },
    { reason: 'importance from a stranger', facts: { importance: 'high' }, score: BASE },
    { reason: 'low importance', facts: { importance: 'low' }, score: 30 },
    { reason: "Outlook's Other", facts: { sorting: 'other' }, score: 32 },
    {
      reason: 'a list the owner writes to',
      facts: { unsubscribable: true },
      standing: ONCE,
      score: 42,
    },
    { reason: 'an automated sender address', facts: { automatedAddress: true }, score: 25 },
    { reason: '"now" words with standing', facts: { timeWords: 'now' }, standing: ONCE, score: 58 },
    { reason: '"now" words from a stranger, halved', facts: { timeWords: 'now' }, score: 44 },
    {
      reason: '"days" words with standing',
      facts: { timeWords: 'days' },
      standing: ONCE,
      score: 54,
    },
    { reason: '"days" words from a stranger, halved', facts: { timeWords: 'days' }, score: 42 },
    { reason: 'half a day of age', age: 0.5, score: 46 },
    { reason: 'a day of age', age: 1, score: 46 },
    { reason: 'four days of age', age: 4, score: 43 },
    { reason: 'a week of age', age: 7, score: BASE },
    { reason: 'more than 30 days of age', age: 31, score: 36 },
  ] satisfies (Case & { reason: string; score: number })[])(
    'scores $reason',
    ({ score, ...input }) => {
      expect(evaluate(input).score).toBe(score)
    },
  )

  it('caps a list from someone never written to as bulk', () => {
    const bulk = evaluate({
      facts: {
        unsubscribable: true,
        addressing: 'alone',
        sameOrganisation: true,
        timeWords: 'now',
      },
      age: 0,
    })
    const capped = { from: 65, to: 15 }

    expect(bulk).toMatchObject({ score: capped.to, tier: 'low', bulk: true, suggestHandled: true })
    expect(bulk.factors.find(entry => entry.name === 'bulk')?.points).toBe(capped.to - capped.from)
  })

  it('clamps the rules to 0–100', () => {
    const lowest = evaluate({
      facts: { addressing: 'none', importance: 'low', sorting: 'other', automatedAddress: true },
      age: 40,
    })
    const highest = evaluate({
      facts: { addressing: 'alone', sameOrganisation: true, importance: 'high', timeWords: 'now' },
      standing: OFTEN,
      age: 0,
    })

    expect({ lowest: lowest.score, highest: highest.score }).toStrictEqual({
      lowest: 0,
      highest: 100,
    })
  })
})

describe('ranking: the judge', () => {
  it('adds only confident answers', () => {
    const unsure = evaluate({
      answers: { asksMe: 0.5, automated: 0.79, timePressure: { score: 3, confidence: 0.49 } },
    })
    const sure = evaluate({
      answers: { asksMe: 0.7, automated: 0.8, timePressure: { score: 3, confidence: 0.5 } },
    })

    expect(unsure).toMatchObject({ score: BASE, assisted: false, suggestHandled: false })
    // +10 for the ask, +5 for urgency (halved: a stranger), −14 for automated; it reads as an ask, so no suggestion
    expect(sure).toMatchObject({ score: 41, assisted: false, suggestHandled: false })
  })

  it('suggests Mark as handled for bulk and automated mail, with the AI badge only where the model says automated', () => {
    const automated = { asksMe: 0.1, automated: 0.95, timePressure: NO_TIME }
    const asks = { asksMe: 0.95, automated: 0.95, timePressure: NO_TIME }
    const cases = {
      byTheModel: evaluate({ answers: automated }),
      byTheHeaderAlone: evaluate({ facts: { unsubscribable: true } }),
      byTheHeaderWhileTheModelAnswered: evaluate({
        facts: { unsubscribable: true },
        answers: { ...automated, automated: 0.1 },
      }),
      byTheAddress: evaluate({ facts: { automatedAddress: true } }),
      bulkThatAsks: evaluate({ facts: { unsubscribable: true }, answers: asks }),
      anAddressThatAsks: evaluate({ facts: { automatedAddress: true }, answers: asks }),
      flaggedBulk: evaluate({ facts: { unsubscribable: true, flagged: true }, answers: automated }),
    }

    expect(
      Object.fromEntries(
        Object.entries(cases).map(([name, { suggestHandled, assisted }]) => [
          name,
          { suggestHandled, assisted },
        ]),
      ),
    ).toStrictEqual({
      byTheModel: { suggestHandled: true, assisted: true },
      byTheHeaderAlone: { suggestHandled: true, assisted: false },
      byTheHeaderWhileTheModelAnswered: { suggestHandled: true, assisted: false },
      byTheAddress: { suggestHandled: true, assisted: false },
      bulkThatAsks: { suggestHandled: true, assisted: true },
      anAddressThatAsks: { suggestHandled: false, assisted: false },
      flaggedBulk: { suggestHandled: false, assisted: false },
    })
  })

  it.each([
    { reading: 'asks the reader something', asksMe: 0.9, automated: 0, score: 60 },
    { reading: 'asks nothing', asksMe: 0.1, automated: 0, score: 44 },
    { reading: 'a system sent it', asksMe: 0.5, automated: 0.95, score: 36 },
  ])('moves the score when the judge says $reading', ({ asksMe, automated, score }) => {
    const answers = { asksMe, automated, timePressure: NO_TIME }

    expect(evaluate({ answers, standing: ONCE }).score).toBe(score)
  })

  it('trusts urgency in proportion to standing', () => {
    const urgent = { asksMe: 0.5, automated: 0, timePressure: { score: 3, confidence: 0.9 } }
    const relaxed = { asksMe: 0.5, automated: 0, timePressure: { score: 0, confidence: 0.9 } }

    expect({
      urgentKnown: evaluate({ answers: urgent, standing: ONCE }).score,
      urgentStranger: evaluate({ answers: urgent }).score,
      relaxedKnown: evaluate({ answers: relaxed, standing: ONCE }).score,
    }).toStrictEqual({ urgentKnown: 60, urgentStranger: 45, relaxedKnown: 45 })
  })

  it('clamps the adjustment to ±20', () => {
    const worst = { asksMe: 0, automated: 1, timePressure: { score: 0, confidence: 1 } }
    const best = { asksMe: 1, automated: 0, timePressure: { score: 3, confidence: 1 } }

    expect(evaluate({ answers: worst, standing: ONCE }).score).toBe(KNOWN - BOUND)
    expect(evaluate({ answers: best, standing: ONCE }).score).toBe(KNOWN + BOUND)
  })

  it('keeps bulk below 30 whatever the judge answers', () => {
    const probabilities = [0, UNSURE, 1]
    const levels = [0, 1, 2, TODAY]
    const facts = { unsubscribable: true, addressing: 'alone', timeWords: 'now' } as const
    const scores = probabilities.flatMap(asksMe =>
      probabilities.flatMap(automated =>
        levels.map(level => {
          const answers = { asksMe, automated, timePressure: { score: level, confidence: 1 } }
          return evaluate({ facts, answers, age: 0 }).score
        }),
      ),
    )

    expect(Math.max(...scores)).toBeLessThan(BULK_CEILING)
  })

  it('never lets a flagged message sink, applying the flag last', () => {
    const flaggedBulk = evaluate({
      facts: { flagged: true, unsubscribable: true, automatedAddress: true },
      answers: { asksMe: 0, automated: 1, timePressure: { score: 0, confidence: 1 } },
    })
    const flaggedHigh = evaluate({
      facts: { flagged: true, addressing: 'alone', sameOrganisation: true, timeWords: 'now' },
      standing: OFTEN,
      age: 0,
    })
    // Above the floor, the flag moves nothing: 40 + 24 + 4 + 10 + 5 + 8 + 6
    const high = { score: 97 }

    expect(flaggedBulk).toMatchObject({ score: FLAG_FLOOR, tier: 'high' })
    expect(flaggedBulk.factors[0]).toStrictEqual({
      name: 'flag',
      points: FLAG_FLOOR,
      judged: false,
    })
    expect(flaggedHigh.score).toBe(high.score)
  })
})

describe('ranking: tiers', () => {
  it.each([
    { score: 72, tier: 'high' },
    { score: 71.99, tier: 'normal' },
    { score: 30, tier: 'normal' },
    { score: 29.99, tier: 'low' },
    { score: 0, tier: 'low' },
  ])('puts $score in the $tier tier', ({ score, tier }) => {
    expect(scoring.tierOf(score)).toBe(tier)
  })
})
