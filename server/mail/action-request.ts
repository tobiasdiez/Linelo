import httpStatus from '#shared/utils/http-status'

/** Far more than any reply or forward Linelo sends (100 000 characters of text at most). */
const MAX_BODY_BYTES = 2_097_152
/** Keys JSON may carry that would reach an object's prototype if anything merged the body. */
const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** Why a request to a mail action is refused before it is read. */
interface Refusal {
  statusCode: number
  statusMessage: string
}

/**
 * Mail actions only take JSON from Linelo's own pages, of a known, bounded size.
 * Refused: a request from anywhere but the same origin (browsers say so in
 * `Sec-Fetch-Site`; clients without it are let through), any content type but JSON
 * (a form or plain-text post needs no CORS preflight), a body without a length
 * (chunked) or longer than 2 MB. `undefined` when the request may go ahead.
 */
function refusal(headers: Headers): Refusal | undefined {
  const site = headers.get('Sec-Fetch-Site')
  if (site !== null && site !== 'same-origin') {
    return { statusCode: httpStatus.forbidden, statusMessage: 'Cross-site request' }
  }
  const [mediaType = ''] = (headers.get('Content-Type') ?? '').split(';')
  if (mediaType.trim().toLowerCase() !== 'application/json') {
    return { statusCode: httpStatus.unsupportedMediaType, statusMessage: 'Expected JSON' }
  }
  const length = headers.get('Content-Length')
  if (length === null) {
    return { statusCode: httpStatus.lengthRequired, statusMessage: 'Length required' }
  }
  if (!(Number(length) <= MAX_BODY_BYTES)) {
    return { statusCode: httpStatus.payloadTooLarge, statusMessage: 'Request too large' }
  }
  return undefined
}

/** The JSON body, `undefined` when it is not JSON or carries a key that reaches a prototype. */
function parseBody(raw: string | undefined): { body: unknown } | undefined {
  try {
    const body: unknown = JSON.parse(raw ?? '', (key, value: unknown) => {
      if (UNSAFE_KEYS.has(key)) {
        throw new SyntaxError(`Unsafe key ${key}`)
      }
      return value
    })
    return { body }
  } catch {
    return undefined
  }
}

const actionRequest = { refusal, parseBody, maxBodyBytes: MAX_BODY_BYTES }

export default actionRequest
