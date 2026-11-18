import emailAddress from './email-address'
import isNonEmptyString from './is-non-empty-string'
import isRecord from './is-record'
import participants from './participants'

/** Whether a value has the expected shape. */
type Guard<Value> = (value: unknown) => value is Value

/** A guard per field of `Request`: every field is required, and nothing else is allowed. */
type Shape<Request> = { readonly [Field in keyof Request]-?: Guard<Request[Field]> }

/** More than any thread shows at once; keeps a single request bounded. */
const MAX_MESSAGE_IDS = 100

function boolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/** Text of at most `max` characters; with `required`, not only whitespace. */
function text(max: number, { required = false } = {}): Guard<string> {
  function isText(value: unknown): value is string {
    return (
      typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0)
    )
  }
  return isText
}

/** A list of `min` to `max` entries, each passing `entry`. */
function listOf<Entry>(
  entry: Guard<Entry>,
  { min = 0, max }: { min?: number; max: number },
): Guard<Entry[]> {
  function isList(value: unknown): value is Entry[] {
    return (
      Array.isArray(value) &&
      value.length >= min &&
      value.length <= max &&
      value.every(item => entry(item))
    )
  }
  return isList
}

/** Message ids, at least `min` and at most 100. */
function messageIds({ min = 0 } = {}): Guard<string[]> {
  return listOf(isNonEmptyString, { min, max: MAX_MESSAGE_IDS })
}

/**
 * The first field of `value` that does not fit `fields`: one it should not have,
 * or one that fails its guard. `request` when `value` is not an object at all.
 */
function invalidField(
  value: unknown,
  fields: Readonly<Record<string, Guard<unknown>>>,
): string | undefined {
  if (!isRecord(value) || Array.isArray(value)) {
    return 'request'
  }
  // Own fields only: `constructor` or `toString` are not fields of a request
  const unexpected = Object.keys(value).find(field => !Object.hasOwn(fields, field))
  return unexpected ?? Object.entries(fields).find(([field, guard]) => !guard(value[field]))?.[0]
}

/** Whether `value` is an object with exactly the fields of `shape`, each passing its guard. */
function fits<Request>(value: unknown, shape: Shape<Request>): value is Request {
  return invalidField(value, shape) === undefined
}

/** A name and an address mail can be sent to; nothing else. */
const participantShape: Shape<Inbox.Participant> = {
  name: text(participants.maxNameLength),
  email: emailAddress.isPlausible,
}

function participant(value: unknown): value is Inbox.Participant {
  return fits(value, participantShape)
}

/**
 * Checks a request body against its shape: an object with exactly these fields,
 * each passing its guard. The first field that does not fit is reported by name.
 */
function validate<Request>(value: unknown, shape: Shape<Request>): Inbox.Validated<Request> {
  const misfit: { field?: string } = {}
  // One pass that narrows `value` and remembers what did not fit
  function fitsShape(candidate: unknown): candidate is Request {
    misfit.field = invalidField(candidate, shape)
    return misfit.field === undefined
  }
  return fitsShape(value) ? { value } : { field: misfit.field ?? 'request' }
}

const guards = {
  nonEmptyString: isNonEmptyString,
  boolean,
  text,
  listOf,
  participant,
  messageIds,
  validate,
}

export default guards
