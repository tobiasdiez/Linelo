/** Whether `value` is a string with something in it. For guarding parsed JSON. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export default isNonEmptyString
