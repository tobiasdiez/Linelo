import { describe, expect, it } from 'vite-plus/test'
import createJudges from '#server/ranking/judges'
import demoAnswers from '#server/ranking/judges/demo-answers.json'
import mailFakes from './mail-fakes'

const demo = { ...mailFakes.mailbox('demo-account'), providerId: 'demo' }
const microsoft = mailFakes.mailbox('microsoft-account')

function judgeIds(options: { apiKey?: string; model?: string; development: boolean }) {
  const { judgeFor } = createJudges({
    apiKey: options.apiKey,
    model: options.model,
    fetch: globalThis.fetch,
    development: options.development,
  })
  return { demo: judgeFor(demo)?.id, microsoft: judgeFor(microsoft)?.id }
}

describe('ranking: the judge of a mailbox', () => {
  it.each([
    [
      'development without a key',
      { development: true },
      { demo: 'demo/jev-1.14.0/1', microsoft: undefined },
    ],
    [
      'development with a key',
      { development: true, apiKey: 'key' },
      { demo: 'demo/jev-1.14.0/1', microsoft: 'jev-1.14.0/1' },
    ],
    [
      'production with a key',
      { development: false, apiKey: 'key' },
      { demo: undefined, microsoft: 'jev-1.14.0/1' },
    ],
    [
      'production with another model',
      { development: false, apiKey: 'key', model: 'jev-1.15.0' },
      { demo: undefined, microsoft: 'jev-1.15.0/1' },
    ],
  ])('in %s', (_, options, expected) => {
    expect(judgeIds(options)).toStrictEqual(expected)
  })

  it("gives the demo judge the pinned Jev's answers", () => {
    // After a new model or new questions, `pnpm ranking:demo-answers` asks Jev again
    expect(demoAnswers.judge).toBe(judgeIds({ development: false, apiKey: 'key' }).microsoft)
  })
})
