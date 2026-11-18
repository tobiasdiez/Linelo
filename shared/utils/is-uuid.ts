const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

/** Whether `value` is a UUID, as the database's ids are. Anything else names no row. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export default isUuid
