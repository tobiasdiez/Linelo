import { describe, expect, it } from 'vite-plus/test'
import actionRequest from '#server/mail/action-request'
import httpStatus from '#shared/utils/http-status'

/** What Linelo's own `$fetch` sends with a small JSON body. */
const json = { 'Content-Type': 'application/json', 'Content-Length': '120' }

function refusal(headers: Record<string, string>) {
  return actionRequest.refusal(new Headers(headers))?.statusCode
}

describe('mail action requests', () => {
  it.each([
    ['JSON from the same origin', { ...json, 'Sec-Fetch-Site': 'same-origin' }],
    ['JSON with a charset', { ...json, 'Content-Type': 'Application/JSON; charset=utf-8' }],
    ['JSON from a client that sends no fetch metadata', json],
    ['the largest body', { ...json, 'Content-Length': String(actionRequest.maxBodyBytes) }],
  ])('lets %s through', (_, headers) => {
    expect(refusal(headers)).toBeUndefined()
  })

  it.each([
    ['JSON from another site', { ...json, 'Sec-Fetch-Site': 'cross-site' }, httpStatus.forbidden],
    ['JSON from a sibling site', { ...json, 'Sec-Fetch-Site': 'same-site' }, httpStatus.forbidden],
    [
      'a cross-site form post, before its content type',
      { 'Content-Type': 'text/plain', 'Sec-Fetch-Site': 'cross-site' },
      httpStatus.forbidden,
    ],
    [
      'a form post',
      { ...json, 'Content-Type': 'application/x-www-form-urlencoded' },
      httpStatus.unsupportedMediaType,
    ],
    ['plain text', { ...json, 'Content-Type': 'text/plain' }, httpStatus.unsupportedMediaType],
    ['a post without a content type', { 'Content-Length': '120' }, httpStatus.unsupportedMediaType],
    [
      'a body without a length (chunked)',
      { 'Content-Type': 'application/json' },
      httpStatus.lengthRequired,
    ],
    [
      'a body larger than 2 MB',
      { ...json, 'Content-Length': String(actionRequest.maxBodyBytes + 1) },
      httpStatus.payloadTooLarge,
    ],
    [
      'a length that is not a number',
      { ...json, 'Content-Length': 'many' },
      httpStatus.payloadTooLarge,
    ],
  ])('refuses %s', (_, headers, status) => {
    expect(refusal(headers)).toBe(status)
  })

  it('reads a JSON body', () => {
    expect(actionRequest.parseBody('{"accountId":"a","markAsRead":[]}')).toStrictEqual({
      body: { accountId: 'a', markAsRead: [] },
    })
  })

  it.each([
    ['no body', undefined],
    ['text that is not JSON', 'accountId=a'],
    ['broken JSON', '{"accountId":'],
    ['a key that reaches the prototype', '{"__proto__":{"isAdmin":true}}'],
    ['a nested constructor key', '{"to":[{"constructor":{"prototype":{}}}]}'],
  ])('refuses %s as a body', (_, raw) => {
    expect(actionRequest.parseBody(raw)).toBeUndefined()
  })
})
