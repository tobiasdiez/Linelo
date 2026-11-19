import calendarTime from '#shared/utils/calendar-time'

/*
 * The rules and the judge's bounded adjustment: facts, standing and answers → factors,
 * score and tier. The numbers are first guesses, checked against the seven demo threads
 * only (`ranking-golden.spec.ts`); change them here, in one table, and bump the version.
 */

/** Changes with the weights: stored scores of another version are recomputed (`mailbox_profiles.scoresVersion`). */
const RANKING_VERSION = 1

const MS_PER_DAY = calendarTime.MILLISECONDS_PER_DAY

const WEIGHTS = {
  base: 40,
  min: 0,
  max: 100,
  standing: { oftenFrom: 10, often: 24, someFrom: 3, some: 18, once: 10 },
  wroteRecently: { withinDays: 14, points: 4 },
  sameOrganisation: 5,
  addressing: { alone: 10, withOthers: 6, cc: 0, none: -6 },
  flagFloor: 90,
  important: 4,
  lowImportance: -10,
  sortedOther: -8,
  bulk: { baseCap: 15, scoreCeiling: 29 },
  discussionList: -8,
  automatedAddress: -15,
  timeWords: { now: 8, days: 4, none: 0 },
  recency: { fresh: 6, freshDays: 1, goneDays: 7, oldDays: 30, old: -4 },
  judge: {
    bound: 20,
    confident: { yes: 0.7, no: 0.3, score: 0.5, automated: 0.8 },
    asksMe: 10,
    asksNothing: -6,
    timePressurePerLevel: 5,
    automated: -14,
  },
  tiers: { high: 72, normal: 30 },
} as const

interface Input {
  facts: Ranking.Facts
  /** Whom the owner writes to; the sender's standing is looked up here. */
  correspondents: Ranking.Correspondents
  /** The judge's answers; `null` while it has not answered. */
  answers: Ranking.Answers | null
  receivedAt: Date
  now: Date
}

/** What the rules work with: the facts and the owner's standing with the sender (`undefined`: never written to). */
interface RuleInput extends Omit<Input, 'correspondents' | 'answers'> {
  standing: Ranking.Standing | undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function factor(name: Ranking.FactorName, points: number, judged = false): Ranking.Factor {
  return { name, points, judged }
}

/** 10 times or more, 3 to 9 times, or once or twice. */
function countFactor(sent: number): Ranking.Factor {
  const { oftenFrom, often, someFrom, some, once } = WEIGHTS.standing
  if (sent >= oftenFrom) {
    return factor('writesOften', often)
  }
  return sent >= someFrom ? factor('writesOften', some) : factor('hasWritten', once)
}

function standingFactors(standing: Ranking.Standing | undefined, now: Date): Ranking.Factor[] {
  if (!standing) {
    return []
  }
  const count = countFactor(standing.sent)
  const daysSince = (now.getTime() - Date.parse(standing.lastSentAt)) / MS_PER_DAY
  const recent = daysSince <= WEIGHTS.wroteRecently.withinDays
  return recent ? [count, factor('wroteRecently', WEIGHTS.wroteRecently.points)] : [count]
}

const ADDRESSING_FACTORS: Record<Ranking.Facts['addressing'], Ranking.FactorName> = {
  alone: 'toMeAlone',
  withOthers: 'toMeWithOthers',
  cc: 'cc',
  none: 'notToMe',
}

/** Up to +6 under a day old, sliding to nothing at 7 days; −4 after 30. */
function recencyPoints(receivedAt: Date, now: Date): number {
  const { fresh, freshDays, goneDays, oldDays, old } = WEIGHTS.recency
  const days = (now.getTime() - receivedAt.getTime()) / MS_PER_DAY
  if (days > oldDays) {
    return old
  }
  if (days <= freshDays) {
    return fresh
  }
  return Math.max(0, (fresh * (goneDays - days)) / (goneDays - freshDays))
}

/** The facts' factors, apart from bulk, which caps what these add up to. */
function ruleFactors({ facts, standing, receivedAt, now }: RuleInput): Ranking.Factor[] {
  const known = standing !== undefined
  const words = WEIGHTS.timeWords[facts.timeWords]
  const factors = [
    ...standingFactors(standing, now),
    factor(ADDRESSING_FACTORS[facts.addressing], WEIGHTS.addressing[facts.addressing]),
    factor('recency', recencyPoints(receivedAt, now)),
  ]
  if (facts.sameOrganisation) {
    factors.push(factor('sameOrganisation', WEIGHTS.sameOrganisation))
  }
  if (facts.importance === 'high' && known) {
    factors.push(factor('important', WEIGHTS.important))
  }
  if (facts.importance === 'low') {
    factors.push(factor('lowImportance', WEIGHTS.lowImportance))
  }
  if (facts.sorting === 'other') {
    factors.push(factor('sortedOther', WEIGHTS.sortedOther))
  }
  if (facts.unsubscribable && known) {
    factors.push(factor('discussionList', WEIGHTS.discussionList))
  }
  if (facts.automatedAddress) {
    factors.push(factor('automatedAddress', WEIGHTS.automatedAddress))
  }
  if (words !== 0) {
    // Urgency is trusted in proportion to standing
    factors.push(factor('timeWords', known ? words : words / 2))
  }
  return factors
}

/** The judge's factors, only from confident answers; urgency halved without standing. */
function judgeFactors(answers: Ranking.Answers, known: boolean): Ranking.Factor[] {
  const { confident, asksMe, asksNothing, timePressurePerLevel, automated } = WEIGHTS.judge
  const factors: Ranking.Factor[] = []
  if (answers.asksMe >= confident.yes) {
    factors.push(factor('asksMe', asksMe, true))
  } else if (answers.asksMe <= confident.no) {
    factors.push(factor('asksNothing', asksNothing, true))
  }
  const { score, confidence } = answers.timePressure
  if (confidence >= confident.score) {
    const points = (score - 1) * timePressurePerLevel
    factors.push(factor('timePressure', known ? points : points / 2, true))
  }
  if (answers.automated >= confident.automated) {
    factors.push(factor('automated', automated, true))
  }
  return factors.filter(entry => entry.points !== 0)
}

function sum(factors: readonly Ranking.Factor[]): number {
  return factors.reduce((total, entry) => total + entry.points, 0)
}

function tierOf(score: number): Ranking.Tier {
  if (score >= WEIGHTS.tiers.high) {
    return 'high'
  }
  return score >= WEIGHTS.tiers.normal ? 'normal' : 'low'
}

/**
 * The score of a message: the rules' base from 40, clamped to 0–100, a list without
 * standing capped as bulk; the judge's confident answers within ±20; bulk held below 30;
 * the owner's flag as a floor of 90, applied last so a flagged message never sinks.
 */
function evaluate({ correspondents, answers, ...input }: Input): Ranking.Evaluation {
  const { facts } = input
  const standing = correspondents[facts.senderKey]
  const factors = ruleFactors({ ...input, standing })
  const bulk = facts.unsubscribable === true && !standing
  const uncapped = clamp(WEIGHTS.base + sum(factors), WEIGHTS.min, WEIGHTS.max)
  const base = bulk ? Math.min(uncapped, WEIGHTS.bulk.baseCap) : uncapped
  if (bulk) {
    factors.push(factor('bulk', base - uncapped))
  }
  const judged = answers ? judgeFactors(answers, standing !== undefined) : []
  const adjustment = clamp(sum(judged), -WEIGHTS.judge.bound, WEIGHTS.judge.bound)
  const adjusted = clamp(base + adjustment, WEIGHTS.min, WEIGHTS.max)
  const held = bulk ? Math.min(adjusted, WEIGHTS.bulk.scoreCeiling) : adjusted
  const score = facts.flagged ? Math.max(held, WEIGHTS.flagFloor) : held
  if (facts.flagged) {
    factors.unshift(factor('flag', score - held))
  }
  const { confident } = WEIGHTS.judge
  const asks = answers !== null && answers.asksMe >= confident.yes
  const automatedReading = answers !== null && answers.automated >= confident.automated
  // Not against the owner's flag, nor against the model's own reading that it asks something
  const suggestHandled =
    !facts.flagged && (bulk || (!asks && (facts.automatedAddress || automatedReading)))
  return {
    score,
    tier: tierOf(score),
    factors: [...factors, ...judged],
    bulk,
    assisted: suggestHandled && automatedReading,
    suggestHandled,
  }
}

const scoring = { evaluate, tierOf, version: RANKING_VERSION }

export default scoring
