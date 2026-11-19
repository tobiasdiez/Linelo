/// <reference types="node" />
import { Buffer } from 'node:buffer'
import { vi } from 'vite-plus/test'
import { zstdDecompressSync } from 'node:zlib'

/*
 * A stand-in for TypeSafe's API behind the SDK's `fetch` option, for the specs of the Jev
 * judge: it reads each request (the SDK compresses larger bodies with zstd), records it,
 * and answers with `answer`.
 */

/** A request as the fake saw it. */
interface TypeSafeCall {
  url: URL
  headers: Headers
  body: unknown
}

type Answer = (call: TypeSafeCall, signal: AbortSignal | undefined) => Response | Promise<Response>

interface Reading {
  asks: number
  automated: number
  score: number
  confidence: number
}

/** The values of the documentation's example. */
const EXAMPLE: Reading = { asks: 0.94, automated: 0.03, score: 2.2, confidence: 0.71 }

/** Jev's documented answer to the three questions, with these values. */
function jevAnswer(reading: Partial<Reading> = {}): Response {
  const { asks, automated, score, confidence } = { ...EXAMPLE, ...reading }
  return Response.json({
    model: 'jev-1.14.0',
    usage: { input_tokens: 640, output_tokens: 0 },
    answers: {
      asks_reader: { type: 'noul', noul: asks },
      automated: { type: 'noul', noul: automated },
      time_pressure: {
        type: 'score',
        score,
        confidence,
        legend: {},
        probabilities: {},
      },
    },
  })
}

/** TypeSafe's refusal with this status, to be repeated at once where the SDK repeats. */
function refusal(status: number, body: unknown = { error: { message: 'Refused by the test' } }) {
  return Response.json(body, { status, headers: { 'retry-after-ms': '0' } })
}

/** An answer that never comes: the request ends only when it is aborted, as with `fetch`. */
function never(_: TypeSafeCall, signal: AbortSignal | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      reject(signal.reason)
    })
  })
}

async function bodyOf(init: RequestInit | undefined, headers: Headers): Promise<unknown> {
  const bytes = Buffer.from(await new Response(init?.body).arrayBuffer())
  const text =
    headers.get('content-encoding') === 'zstd'
      ? zstdDecompressSync(bytes).toString('utf8')
      : bytes.toString('utf8')
  return JSON.parse(text)
}

function fakeTypeSafe(answer: Answer = () => jevAnswer()) {
  const calls: TypeSafeCall[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const headers = new Headers(init?.headers)
    const call = { url, headers, body: await bodyOf(init, headers) }
    calls.push(call)
    return answer(call, init?.signal ?? undefined)
  })
  return { fetch, calls }
}

const fakeTypeSafes = { typesafe: fakeTypeSafe, jevAnswer, refusal, never }

export default fakeTypeSafes
