import { describe, expect, it } from 'vite-plus/test'
import type { LocationQuery } from 'vue-router'
import signInNotice from '~/utils/sign-in-notice'

describe('sign-in notice', () => {
  it('says nothing on a plain visit', () => {
    expect(signInNotice({})).toBeUndefined()
  })

  it('asks to sign in again when Linelo lost access', () => {
    expect(signInNotice({ reason: 'reconnect' })).toBe('reconnect')
  })

  it('stays quiet about a cancelled sign-in', () => {
    expect(
      signInNotice({
        error: 'access_denied',
        error_description: 'AADSTS65004: User declined to consent',
      }),
    ).toBe('cancelled')
  })

  it('recognises an organisation that has to approve Linelo first', () => {
    const queries: LocationQuery[] = [
      {
        error: 'access_denied',
        error_description: 'AADSTS65001: The user or administrator has not consented',
      },
      { error: 'invalid_request', error_description: 'AADSTS90094: Admin consent is required' },
      { error: 'consent_required' },
    ]

    expect(queries.map(query => signInNotice(query))).toStrictEqual([
      'approval',
      'approval',
      'approval',
    ])
  })

  it('explains an email address that another sign-in already uses', () => {
    expect(signInNotice({ error: 'account_not_linked' })).toBe('taken')
  })

  it('falls back to a plain failure, also over a reconnect reason', () => {
    expect(signInNotice({ error: 'state_mismatch', reason: 'reconnect' })).toBe('failed')
    expect(signInNotice({ error: ['invalid_code', 'second'] })).toBe('failed')
  })
})
