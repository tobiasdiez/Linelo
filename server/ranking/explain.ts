/*
 * The "why shown" line, written from fixed sentences so nothing a sender wrote ends up in
 * Linelo's voice: the reason that moved the item most, then the next one of another
 * group; bulk and automated mail ends with a closing sentence instead.
 */

/** Factors that say the same thing share a group; one sentence per group at most. */
type Group = 'flag' | 'asks' | 'time' | 'standing' | 'addressing' | 'bulk' | 'automated' | 'sorting'

/** On equal points, the earlier group is named first. */
const GROUP_ORDER: readonly Group[] = [
  'flag',
  'asks',
  'time',
  'standing',
  'addressing',
  'bulk',
  'automated',
  'sorting',
]

const SYSTEM = 'Sent by a system, not a person.'
const LIST = 'A newsletter or mailing list.'

/**
 * Every factor's group and what it says, if anything; a model's reading is marked as a
 * reading. Total, so a new factor needs a decision here. Time pressure says "needed soon"
 * only when it moved the item up (`sentenceOf`).
 */
const FACTORS: Record<Ranking.FactorName, { group?: Group; sentence?: string }> = {
  flag: { group: 'flag', sentence: 'You flagged this in Outlook.' },
  asksMe: { group: 'asks', sentence: 'Reads like it asks you for an answer.' },
  asksNothing: { group: 'asks' },
  timePressure: { group: 'time' },
  timeWords: { group: 'time', sentence: 'Mentions today or a day close by.' },
  writesOften: { group: 'standing', sentence: 'From someone you write to often.' },
  hasWritten: { group: 'standing', sentence: 'From someone you have written to.' },
  wroteRecently: { group: 'standing' },
  toMeAlone: { group: 'addressing', sentence: 'Sent to you alone.' },
  toMeWithOthers: { group: 'addressing' },
  cc: { group: 'addressing', sentence: 'You are in Cc.' },
  notToMe: { group: 'addressing' },
  bulk: { group: 'bulk', sentence: LIST },
  discussionList: { group: 'bulk', sentence: LIST },
  automatedAddress: { group: 'automated', sentence: SYSTEM },
  automated: { group: 'automated', sentence: SYSTEM },
  sortedOther: { group: 'sorting', sentence: 'Outlook sorted it under Other.' },
  sameOrganisation: {},
  important: {},
  lowImportance: {},
  recency: {},
}
const NEEDED_SOON = 'Reads like it is needed soon.'
const CLOSING = 'Nothing in it should need an answer.'
const NOTHING_TO_SAY = 'Unread in your inbox.'
const MAX_SENTENCES = 2

interface Reason {
  group: Group
  /** How far the group's factors moved the item, either way. */
  weight: number
  sentence: string
}

function sentenceOf(entry: Ranking.Factor): string | undefined {
  if (entry.name === 'timePressure') {
    // Only time pressure that moved the item up reads as "needed soon"
    return entry.points > 0 ? NEEDED_SOON : undefined
  }
  return FACTORS[entry.name].sentence
}

/** One reason per group that has something to say, strongest first; the flag always leads. */
function reasons(factors: readonly Ranking.Factor[]): Reason[] {
  const byGroup = new Map<Group, { weight: number; best?: { points: number; sentence: string } }>()
  for (const entry of factors) {
    const { group } = FACTORS[entry.name]
    if (!group) {
      continue
    }
    const current = byGroup.get(group) ?? { weight: 0 }
    current.weight += entry.points
    const sentence = sentenceOf(entry)
    if (sentence && (!current.best || Math.abs(entry.points) > Math.abs(current.best.points))) {
      current.best = { points: entry.points, sentence }
    }
    byGroup.set(group, current)
  }
  return [...byGroup.entries()]
    .flatMap(([group, { weight, best }]) =>
      best
        ? [
            {
              group,
              weight: group === 'flag' ? Infinity : Math.abs(weight),
              sentence: best.sentence,
            },
          ]
        : [],
    )
    .toSorted(
      (first, second) =>
        second.weight - first.weight ||
        GROUP_ORDER.indexOf(first.group) - GROUP_ORDER.indexOf(second.group),
    )
}

/** The "why shown" line: at most two sentences. */
function whyShown(evaluation: Ranking.Evaluation): string {
  const found = reasons(evaluation.factors).map(reason => reason.sentence)
  const [first] = found
  if (!first) {
    return evaluation.suggestHandled ? CLOSING : NOTHING_TO_SAY
  }
  if (evaluation.suggestHandled) {
    return `${first} ${CLOSING}`
  }
  return found.slice(0, MAX_SENTENCES).join(' ')
}

/** The fixed suggestion for bulk and automated mail. */
const HANDLED_SUGGESTION: Inbox.HandledSuggestion = {
  kind: 'handled',
  id: 'handled',
  label: 'Nothing to act on',
}

function suggestions(evaluation: Ranking.Evaluation): Inbox.Suggestion[] {
  return evaluation.suggestHandled ? [HANDLED_SUGGESTION] : []
}

const explain = { whyShown, suggestions }

export default explain
