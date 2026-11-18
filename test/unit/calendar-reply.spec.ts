import { describe, expect, it } from 'vite-plus/test'
import replyOf from '#server/calendar/reply'

describe('calendar replies', () => {
  it('sends a body with its status, and no content for 204', () => {
    expect([
      replyOf({ status: 200, body: { events: [] } }),
      replyOf({ status: 201, body: { id: 'decision-1' } }),
      replyOf({ status: 204, body: undefined }),
    ]).toStrictEqual([
      { kind: 'body', status: 200, body: { events: [] } },
      { kind: 'body', status: 201, body: { id: 'decision-1' } },
      { kind: 'empty' },
    ])
  })

  it('throws errors with their message, and the reason the app reads', () => {
    expect([
      replyOf({ status: 404, statusMessage: 'No such event' }),
      replyOf({ status: 403, statusMessage: 'Permission missing', data: { reason: 'consent' } }),
    ]).toStrictEqual([
      { kind: 'error', error: { statusCode: 404, statusMessage: 'No such event' } },
      {
        kind: 'error',
        error: {
          statusCode: 403,
          statusMessage: 'Permission missing',
          data: { reason: 'consent' },
        },
      },
    ])
  })
})
