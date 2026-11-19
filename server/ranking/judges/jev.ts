import {
  AuthenticationError,
  TypeSafeClient,
  UnprocessableEntityError,
  noul,
  score,
} from '@typesafe-ai/sdk'
import isRecord from '#shared/utils/is-record'

/*
 * Jev, TypeSafe AI's hosted decision model, as the judge: the only code that knows
 * TypeSafe, through its official SDK. Three questions about the complete text of one
 * message per request; Jev answers each with a probability or a score and its confidence.
 */

/** Pinned, because thresholds belong to the version they were set for; aliases such as `jev-latest` move without notice. */
const PINNED_MODEL = 'jev-1.14.0'
/**
 * The version of what Jev is asked: the questions below, the state (`stateOf`) and the
 * wording of the input (`input.ts`). Answers to another version are asked again.
 */
const QUESTIONS_VERSION = 1
/** The SDK repeats a rate-limited or failed call this often, honouring `retry-after`. */
const MAX_RETRIES = 2
/** The highest level of `time_pressure`. */
const MAX_TIME_PRESSURE = 3
/** Jev takes 32k tokens of state: longer texts are judged on their beginning. */
const MAX_TEXT = 60_000
/**
 * Per attempt, well under a sync step's budget of 8 s ("about 100 ms" is Jev's usual
 * answer): a hanging call fails, and is asked again later, before the budget ends the step.
 */
const ATTEMPT_TIMEOUT_MS = 3000
/** How much of TypeSafe's error message reaches the log; it may echo the mail it refused. */
const MAX_LOGGED_MESSAGE = 200
/** Fields of TypeSafe's error that describe it without echoing the request. */
const STRUCTURAL_FIELDS = ['type', 'code', 'param', 'loc', 'path']

/** One narrow question each, levels that describe situations, fields named in backticks. */
const QUESTIONS = {
  asks_reader: noul('Does `email.text` ask `reader` to do, decide or answer something?', {
    true: 'Yes: it puts a question, a request or a decision to `reader`, alone or with others it is addressed to.',
    false:
      "No: it only informs, thanks or confirms; or what it asks is addressed to someone else; or it is a promotion's call to action such as 'read more'.",
  }),
  automated: noul(
    'Was `email` sent by a system or to a mailing list, rather than written by a person for `reader` or a few people?',
    {
      true: 'Yes: a newsletter, promotion, notification, receipt, alert, digest or automatic reply.',
      false: 'No: a person wrote it to `reader` or to a few people.',
    },
  ),
  time_pressure: score('How soon does `email.text` say something is needed from `reader`?', [
    'It needs nothing from `reader`, or names no time at all.',
    'It wants something at some point: no date, or one weeks away.',
    'It wants something within days: it names a day close by, or says soon or this week.',
    'It wants something today or at once: it says today, now, urgent or as soon as possible, or that something is blocked until `reader` acts.',
  ]),
}

interface Dependencies {
  apiKey: string
  /** `JEV_MODEL`: another version to try before the pin changes. */
  model?: string
  /** The SDK's own option, so the specs run against a fake. */
  fetch?: typeof globalThis.fetch
  /** Per attempt; 3 s unless given. */
  timeoutMs?: number
  /** Where refusals are reported. */
  logger?: Pick<Console, 'error'>
}

/** What Jev is shown (see `input.ts`): no address, no ids; a very long text cut, and said so. */
function stateOf(input: Ranking.JudgeInput) {
  return {
    reader: input.reader,
    email: {
      from: input.from.name,
      from_domain: input.from.domain,
      addressed: input.addressed,
      subject: input.subject,
      text: input.text.slice(0, MAX_TEXT),
      text_is_cut: input.text.length > MAX_TEXT,
    },
  }
}

/** One entry of TypeSafe's error, as far as it describes the error and does not echo the request. */
function structural(entry: unknown): Record<string, unknown> {
  if (!isRecord(entry)) {
    return {}
  }
  const fields = Object.fromEntries(
    STRUCTURAL_FIELDS.filter(field => entry[field] !== undefined).map(field => [
      field,
      entry[field],
    ]),
  )
  const message = [entry.message, entry.msg].find(value => typeof value === 'string')
  return message === undefined
    ? fields
    : { ...fields, message: message.slice(0, MAX_LOGGED_MESSAGE) }
}

/** What a refusal's body may tell the log: its structure, never the text it may echo. */
function describeRefusal(body: unknown): unknown {
  if (!isRecord(body)) {
    return undefined
  }
  if (Array.isArray(body.detail)) {
    return body.detail.map(entry => structural(entry))
  }
  return structural(isRecord(body.error) ? body.error : body)
}

function isBetween(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
}

/** A `noul` answer's probability. */
function probability(answer: unknown): number | undefined {
  return isRecord(answer) && answer.type === 'noul' && isBetween(answer.noul, 1)
    ? answer.noul
    : undefined
}

/** The three answers, checked: the SDK passes on whatever JSON came back. */
function parseAnswers(answers: unknown): Ranking.Answers {
  const record = isRecord(answers) ? answers : {}
  const asksMe = probability(record.asks_reader)
  const automated = probability(record.automated)
  const time = isRecord(record.time_pressure) ? record.time_pressure : {}
  if (
    asksMe === undefined ||
    automated === undefined ||
    time.type !== 'score' ||
    !isBetween(time.score, MAX_TIME_PRESSURE) ||
    !isBetween(time.confidence, 1)
  ) {
    throw new Error('Jev answered in an unexpected shape')
  }
  return { asksMe, automated, timePressure: { score: time.score, confidence: time.confidence } }
}

/** The input tokens TypeSafe reports, when it does. */
function inputTokensOf(usage: unknown): number | undefined {
  return isRecord(usage) && typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined
}

/**
 * Jev as a `Ranking.Judge`. It rejects whenever there is no usable answer (refused,
 * rate-limited, down, timed out, aborted, malformed), and the caller keeps the rules'
 * score. A refused key is logged once; a request Jev could not process is our bug and is
 * logged with the structure of what TypeSafe said, never with the mail it may echo.
 */
function createJevJudge({
  apiKey,
  model = PINNED_MODEL,
  fetch,
  timeoutMs = ATTEMPT_TIMEOUT_MS,
  logger = console,
}: Dependencies): Ranking.Judge {
  const client = new TypeSafeClient({
    apiKey,
    defaultModel: model,
    retry: { maxRetries: MAX_RETRIES },
    timeout: timeoutMs,
    fetch,
  })
  const reported = { refused: false }

  function report(error: unknown): void {
    if (error instanceof AuthenticationError && !reported.refused) {
      reported.refused = true
      logger.error(
        'TypeSafe refused the API key (TYPESAFE_API_KEY): mail is ranked by the rules alone until it is fixed',
        error.message,
      )
    } else if (error instanceof UnprocessableEntityError) {
      logger.error(
        'TypeSafe could not process a request to Jev, a bug in Linelo',
        error.status,
        describeRefusal(error.body),
      )
    }
  }

  async function judge(
    input: Ranking.JudgeInput,
    { signal }: { signal: AbortSignal },
  ): Promise<Ranking.Judgement> {
    try {
      const { answers, usage } = await client.systemOne(
        { state: stateOf(input), questions: QUESTIONS },
        { signal },
      )
      return { answers: parseAnswers(answers), inputTokens: inputTokensOf(usage) }
    } catch (error) {
      report(error)
      throw error
    }
  }

  return { id: `${model}/${QUESTIONS_VERSION}`, judge }
}

export default createJevJudge
