import isRecord from './is-record'

/** Whether a provider answered an id with "no such event" (404) instead of the event. */
function isGone(entry: unknown): entry is Calendar.Gone {
  return isRecord(entry) && entry.gone === true
}

export default isGone
