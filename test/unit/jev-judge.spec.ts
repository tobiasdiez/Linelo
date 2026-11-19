import { describe, expect, it, vi } from 'vite-plus/test'
import createJevJudge from '#server/ranking/judges/jev'
import fakeTypeSafes from './fake-typesafe'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'
import judgeInput from '#server/ranking/judges/input'
import mailboxOwner from '#shared/data/mailbox-owner'
import rankingFakes from './ranking-fakes'

const API_KEY = 'test-key'
const MAX_TEXT = 60_000
const ATTEMPTS = 3
const OVERLOADED = 529
const UNPROCESSABLE = 422
const SHORT_TIMEOUT_MS = 20
const UNEXPECTED = 'Jev answered in an unexpected shape'
const MAX_LOGGED = 200
/** What Jev is asked, word for word: a change here needs a new questions version in the judge's id. */
const QUESTIONS = {
  asks_reader: {
    type: 'noul',
    instructions: 'Does `email.text` ask `reader` to do, decide or answer something?',
    criteria: {
      true: 'Yes: it puts a question, a request or a decision to `reader`, alone or with others it is addressed to.',
      false:
        "No: it only informs, thanks or confirms; or what it asks is addressed to someone else; or it is a promotion's call to action such as 'read more'.",
    },
  },
  automated: {
    type: 'noul',
    instructions:
      'Was `email` sent by a system or to a mailing list, rather than written by a person for `reader` or a few people?',
    criteria: {
      true: 'Yes: a newsletter, promotion, notification, receipt, alert, digest or automatic reply.',
      false: 'No: a person wrote it to `reader` or to a few people.',
    },
  },
  time_pressure: {
    type: 'score',
    instructions: 'How soon does `email.text` say something is needed from `reader`?',
    criteria: [
      'It needs nothing from `reader`, or names no time at all.',
      'It wants something at some point: no date, or one weeks away.',
      'It wants something within days: it names a day close by, or says soon or this week.',
      'It wants something today or at once: it says today, now, urgent or as soon as possible, or that something is blocked until `reader` acts.',
    ],
  },
}
const priya: Inbox.Participant = { name: 'Priya Nair', email: 'priya.nair@northwind.co' }
const input = judgeInput(
  rankingFakes.envelope('m1', {
    cc: [priya],
    subject: 'Vendor review: can we move sign-off to Thursday?',
    text: 'Hi Mara,\n\nDoes Thursday 14:00 work?\n\nLena',
  }),
  mailboxOwner,
)

function judgeWith(
  answer?: Parameters<typeof fakeTypeSafes.typesafe>[0],
  options: { model?: string; timeoutMs?: number } = {},
) {
  const typesafe = fakeTypeSafes.typesafe(answer)
  const logger = { error: vi.fn<Console['error']>() }
  const judge = createJevJudge({ apiKey: API_KEY, fetch: typesafe.fetch, logger, ...options })
  function ask(signal = new AbortController().signal) {
    return judge.judge(input, { signal })
  }
  return { judge, ask, typesafe, logger }
}

/** The `state` of a recorded request. */
function stateOf(body: unknown): Record<string, unknown> {
  return isRecord(body) && isRecord(body.state) ? body.state : {}
}

describe('the Jev judge', () => {
  it('asks the three questions about the message, with the pinned model and the key', async () => {
    expect.hasAssertions()
    const { ask, judge, typesafe } = judgeWith()

    await ask()

    const [call] = typesafe.calls
    expect({
      url: call?.url.href,
      authorization: call?.headers.get('authorization'),
      id: judge.id,
    }).toStrictEqual({
      url: 'https://api.typesafe.ai/v1/systemone',
      authorization: `Bearer ${API_KEY}`,
      id: 'jev-1.14.0/1',
    })
    expect(call?.body).toMatchObject({
      model: 'jev-1.14.0',
      state: {
        reader: 'Mara Lindqvist',
        email: {
          from: 'Lena Hartmann',
          from_domain: 'northwind.co',
          addressed: 'to the reader alone, 1 other in Cc',
          subject: 'Vendor review: can we move sign-off to Thursday?',
          text: 'Hi Mara,\n\nDoes Thursday 14:00 work?\n\nLena',
          text_is_cut: false,
        },
      },
    })
    // No address field, no ids
    expect(JSON.stringify(call?.body)).not.toMatch(/@|m1|thread/)
  })

  it('asks its questions word for word under the version in its id', async () => {
    expect.hasAssertions()
    const { ask, judge, typesafe } = judgeWith()

    await ask()

    const body = typesafe.calls[0]?.body
    expect({ id: judge.id, questions: isRecord(body) ? body.questions : undefined }).toStrictEqual({
      id: 'jev-1.14.0/1',
      questions: QUESTIONS,
    })
  })

  it('sends the complete text, cut at 60,000 characters', async () => {
    expect.hasAssertions()
    const { judge, typesafe } = judgeWith()
    const long = judgeInput(
      rankingFakes.envelope('m1', { text: `${'x'.repeat(MAX_TEXT)}the end` }),
      mailboxOwner,
    )

    await judge.judge(long, { signal: new AbortController().signal })

    const { email } = stateOf(typesafe.calls[0]?.body)
    expect(isRecord(email) && [String(email.text).length, email.text_is_cut]).toStrictEqual([
      MAX_TEXT,
      true,
    ])
  })

  it('takes another model from JEV_MODEL, and names it in its id', async () => {
    expect.hasAssertions()
    const { ask, judge, typesafe } = judgeWith(undefined, { model: 'jev-1.15.0' })

    await ask()

    expect([judge.id, typesafe.calls[0]?.body]).toStrictEqual([
      'jev-1.15.0/1',
      expect.objectContaining({ model: 'jev-1.15.0' }),
    ])
  })

  it('answers with the three readings', async () => {
    expect.hasAssertions()
    const { ask } = judgeWith(() =>
      fakeTypeSafes.jevAnswer({ asks: 0.94, automated: 0.03, score: 2.2, confidence: 0.71 }),
    )

    await expect(ask()).resolves.toStrictEqual({
      answers: { asksMe: 0.94, automated: 0.03, timePressure: { score: 2.2, confidence: 0.71 } },
      // As TypeSafe reports them, for the line per sync step
      inputTokens: 640,
    })
  })

  it.each([
    ['a probability above 1', () => fakeTypeSafes.jevAnswer({ asks: 1.5 })],
    ['a negative probability', () => fakeTypeSafes.jevAnswer({ automated: -0.1 })],
    ['a level above 3', () => fakeTypeSafes.jevAnswer({ score: 4 })],
    [
      'an answer of the wrong type',
      () =>
        Response.json({
          model: 'jev-1.14.0',
          answers: {
            asks_reader: { type: 'score', noul: 0.5 },
            automated: { type: 'noul', noul: 0.1 },
            time_pressure: { type: 'score', score: 1, confidence: 0.9 },
          },
        }),
    ],
    ['no answers', () => Response.json({ model: 'jev-1.14.0', answers: {} })],
    ['no JSON', () => new Response('<html>')],
  ])('takes an answer with %s as none', async (_, answer) => {
    expect.hasAssertions()
    const { ask } = judgeWith(answer)

    await expect(ask()).rejects.toThrow(UNEXPECTED)
  })

  it('logs a refused key once, and gives no answer', async () => {
    expect.hasAssertions()
    const { ask, logger, typesafe } = judgeWith(() =>
      fakeTypeSafes.refusal(httpStatus.unauthorized),
    )

    await expect(ask()).rejects.toMatchObject({ name: 'AuthenticationError' })
    await expect(ask()).rejects.toMatchObject({ name: 'AuthenticationError' })

    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      'TypeSafe refused the API key (TYPESAFE_API_KEY): mail is ranked by the rules alone until it is fixed',
      expect.any(String),
    )
    // Not repeated: another try would be refused too
    expect(typesafe.calls).toHaveLength(2)
  })

  it('logs a request TypeSafe could not process by its structure, never with the mail it echoes', async () => {
    expect.hasAssertions()
    const mail = 'Hi Mara, the secret numbers are attached.'
    const detail = {
      detail: [
        { loc: ['body', 'state', 'email', 'text'], msg: 'too long', type: 'too_long', input: mail },
      ],
    }
    const { ask, logger } = judgeWith(() => fakeTypeSafes.refusal(UNPROCESSABLE, detail))

    await expect(ask()).rejects.toMatchObject({ name: 'UnprocessableEntityError' })

    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      'TypeSafe could not process a request to Jev, a bug in Linelo',
      UNPROCESSABLE,
      [{ type: 'too_long', loc: ['body', 'state', 'email', 'text'], message: 'too long' }],
    )
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret')
  })

  it('cuts a long message TypeSafe gave in a refusal', async () => {
    expect.hasAssertions()
    const said = 'x'.repeat(MAX_LOGGED + 1)
    const { ask, logger } = judgeWith(() =>
      fakeTypeSafes.refusal(UNPROCESSABLE, { error: { code: 'invalid', message: said } }),
    )

    await expect(ask()).rejects.toMatchObject({ name: 'UnprocessableEntityError' })

    expect(logger.error.mock.calls[0]?.[2]).toStrictEqual({
      code: 'invalid',
      message: 'x'.repeat(MAX_LOGGED),
    })
  })

  it.each([
    ['rate-limited', httpStatus.tooManyRequests, 'RateLimitError'],
    ['overloaded', OVERLOADED, 'InternalServerError'],
  ])('tries twice more when %s, then gives no answer', async (_, status, name) => {
    expect.hasAssertions()
    const { ask, logger, typesafe } = judgeWith(() => fakeTypeSafes.refusal(status))

    await expect(ask()).rejects.toMatchObject({ name })

    expect(typesafe.calls).toHaveLength(ATTEMPTS)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('answers after a rate limit once TypeSafe lets it', async () => {
    expect.hasAssertions()
    const answers = [fakeTypeSafes.refusal(httpStatus.tooManyRequests)]
    const { ask } = judgeWith(() => answers.shift() ?? fakeTypeSafes.jevAnswer())

    await expect(ask()).resolves.toMatchObject({ answers: { asksMe: 0.94 } })
  })

  it('gives no answer when TypeSafe does not answer in time, or the step aborts', async () => {
    expect.hasAssertions()
    const timingOut = judgeWith(fakeTypeSafes.never, { timeoutMs: SHORT_TIMEOUT_MS })
    const aborted = judgeWith(fakeTypeSafes.never)
    const step = new AbortController()

    const asking = aborted.ask(step.signal)
    step.abort()

    await expect(asking).rejects.toMatchObject({ name: 'APIUserAbortError' })
    await expect(timingOut.ask()).rejects.toMatchObject({ name: 'APITimeoutError' })
    expect(timingOut.typesafe.calls).toHaveLength(ATTEMPTS)
  })
})
