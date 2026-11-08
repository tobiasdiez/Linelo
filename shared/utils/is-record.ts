/** Whether `value` is a non-null object, so its properties can be read. For guarding parsed JSON. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export default isRecord
