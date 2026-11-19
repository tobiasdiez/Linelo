/*
 * The two short lists of time words, in English and German. Deliberately small and worth
 * few points: a list cannot tell "about 40% more than today" from a deadline.
 */

/** Today or at once. */
const NOW_WORDS = [
  'today',
  'tonight',
  'urgent',
  'urgently',
  'asap',
  'as soon as possible',
  'eod',
  'end of day',
  'end of the day',
  'right away',
  'immediately',
  'heute',
  'dringend',
  'eilig',
  'sofort',
  'umgehend',
  'schnellstmöglich',
  'so schnell wie möglich',
]

/** A day close by. */
const DAYS_WORDS = [
  'tomorrow',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'deadline',
  'this week',
  'end of the week',
  'übermorgen',
  'montag',
  'dienstag',
  'mittwoch',
  'donnerstag',
  'freitag',
  'samstag',
  'sonnabend',
  'sonntag',
  'frist',
  'diese woche',
  'ende der woche',
]

/** German "morgen" (tomorrow) only in lower case: "Morgen" is mostly the morning ("Guten Morgen"). */
const CASE_SENSITIVE_DAYS_WORDS = ['morgen']

/** The words as whole words, so "today" does not match "todays" and "frist" not "fristlos". */
function pattern(words: readonly string[], flags: string): RegExp {
  const alternatives = words.map(word => word.replaceAll(' ', String.raw`\s+`)).join('|')
  return new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${alternatives})(?![\p{L}\p{N}])`, flags)
}

const NOW = pattern(NOW_WORDS, 'iu')
const DAYS = pattern(DAYS_WORDS, 'iu')
const DAYS_CASE_SENSITIVE = pattern(CASE_SENSITIVE_DAYS_WORDS, 'u')

/** The strongest time words in the text: "now" before "days". */
function timeWordsIn(text: string): Ranking.Facts['timeWords'] {
  if (NOW.test(text)) {
    return 'now'
  }
  return DAYS.test(text) || DAYS_CASE_SENSITIVE.test(text) ? 'days' : 'none'
}

export default timeWordsIn
