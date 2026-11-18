import { calendarSources, users } from '../db/schema'
import calendar from './providers'
import type createDatabase from '../db/client'
import { eq } from 'drizzle-orm'

/**
 * Starts the demo calendars afresh for a demo sign-in: their copies live in memory and
 * are gone after a restart, so the user's calendar rows (and decisions with them) go too.
 */
async function resetDemoCalendar(
  db: ReturnType<typeof createDatabase>['db'],
  userId: string,
): Promise<void> {
  calendar.resetDemo()
  await db.delete(calendarSources).where(eq(calendarSources.userId, userId))
  // JSON and the database have no `undefined`
  // eslint-disable-next-line unicorn/no-null
  await db.update(users).set({ calendarSyncedAt: null }).where(eq(users.id, userId))
}

export default resetDemoCalendar
