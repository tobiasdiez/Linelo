import db from '../utils/db'
import { sql } from 'drizzle-orm'

/** Readiness probe: 200 when the database answers, 503 otherwise. */
export default defineEventHandler(async () => {
  try {
    await db.execute(sql`select 1`)
  } catch (error) {
    console.error('Database unreachable', error)
    throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  }
  return { status: 'ok' }
})
