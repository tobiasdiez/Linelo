/**
 * The ranking of the queue (`server/ranking`): facts about each unread message, a
 * judge's answers on its text, and the score and explanation made from them.
 * Declared as a global namespace because the lint setup allows only default exports,
 * and kept in `shared` so the server's unit tests, which run without Nitro, see it too.
 */
declare namespace Ranking {
  /** What the rules know about one message: its marks, and more. No text, no address. */
  interface Facts extends Mail.Marks {
    /** Keyed hash of the sender's address, to look up standing. */
    senderKey: string
    sameOrganisation: boolean
    addressing: 'alone' | 'withOthers' | 'cc' | 'none'
    automatedAddress: boolean
    timeWords: 'now' | 'days' | 'none'
    /** A long text or many recipients, for interleaving. Known once the text was read. */
    heavy?: boolean
  }

  /** What a judge answered about one message. Probabilities are 0 to 1. */
  interface Answers {
    asksMe: number
    automated: number
    /** 0 (nothing time-bound) to 3 (today or at once), and the judge's confidence in it. */
    timePressure: { score: number; confidence: number }
  }

  /** What a judge is shown of a message: the reader's name, the sender's name and domain, how it is addressed, the subject and the complete text. */
  interface JudgeInput {
    reader: string
    from: { name: string; domain: string }
    addressed: string
    subject: string
    text: string
  }

  /** A judge's answers about one message, and what reading it cost. */
  interface Judgement {
    answers: Answers
    /** The input tokens the model reports; `undefined` when there is nothing to report. */
    inputTokens?: number
  }

  interface Judge {
    /** Model, questions and input wording, such as `jev-1.14.0/1`. Answers of another id are not reused. */
    id: string
    /** Rejects when there is no usable answer; the caller keeps the rules' score. */
    judge: (input: JudgeInput, options: { signal: AbortSignal }) => Promise<Judgement>
  }

  /** How much the mailbox owner writes to one address, from Sent Items. */
  interface Standing {
    /** How many of the scanned sent messages went to it, in To or Cc. */
    sent: number
    /** ISO 8601. */
    lastSentAt: string
  }

  /** Whom the account writes to: keyed hash of an address → standing. */
  type Correspondents = Record<string, Standing>

  /** Keys addresses for storage, so the database does not show whom anyone writes to. */
  interface AddressKey {
    /** The keyed hash of the lower-cased address. */
    hash: (address: string) => string
    /** Tells apart profiles hashed with another key. */
    check: string
  }

  type Tier = 'high' | 'normal' | 'low'

  /** One named reason that adds or removes points. */
  type FactorName =
    | 'flag'
    | 'writesOften'
    | 'hasWritten'
    | 'wroteRecently'
    | 'sameOrganisation'
    | 'toMeAlone'
    | 'toMeWithOthers'
    | 'cc'
    | 'notToMe'
    | 'important'
    | 'lowImportance'
    | 'sortedOther'
    | 'bulk'
    | 'discussionList'
    | 'automatedAddress'
    | 'timeWords'
    | 'recency'
    | 'asksMe'
    | 'asksNothing'
    | 'timePressure'
    | 'automated'

  interface Factor {
    name: FactorName
    points: number
    /** From the judge's answers rather than from the rules. */
    judged: boolean
  }

  /** What the rules and the judge made of one message. */
  interface Evaluation {
    score: number
    tier: Tier
    /** Every factor that moved the score, the judge's included. */
    factors: Factor[]
    /** From a mailing list whose sender has no standing: held in the lowest tier. */
    bulk: boolean
    /** The judge's reading "automated" is among the reasons for the suggestion: it carries the AI badge. */
    assisted: boolean
    /**
     * "Mark as handled" is suggested, and the line closes with "Nothing in it should need an
     * answer": bulk, an automated sender address, or what the judge calls automated; never for a
     * message the owner flagged, nor for one the judge reads as asking (unless it is bulk).
     */
    suggestHandled: boolean
  }

  /** How far a sync step got: another step is running, there is more to do, or nothing is left to judge. */
  type StepResult = 'busy' | 'more' | 'done'
}
