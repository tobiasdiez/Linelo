import isRecord from '#shared/utils/is-record'

/**
 * The `reason` a failed API call carries (`server/mail/http-error.ts`), with its status:
 * `data` is the response body, and h3 puts the error's own data under `data` again.
 */
function reasonOf(error: unknown): { status: unknown; reason: unknown } {
  if (!isRecord(error)) {
    return { status: undefined, reason: undefined }
  }
  const body = isRecord(error.data) ? error.data : {}
  return { status: error.statusCode, reason: isRecord(body.data) ? body.data.reason : undefined }
}

export default reasonOf
