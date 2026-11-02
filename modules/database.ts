import { defineNuxtModule, useLogger } from 'nuxt/kit'
import { cp } from 'node:fs/promises'
import createDatabase from '../server/db/client'
import { join } from 'node:path'

/**
 * Ships the drizzle-kit migrations with the production build and, when the build can
 * reach the database (DATABASE_URL), applies them right away. A build without
 * DATABASE_URL, such as CI, only copies them; `pnpm db:migrate` applies them later.
 */
export default defineNuxtModule({
  meta: {
    name: 'database',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  setup(_, nuxt) {
    if (nuxt.options.dev) {
      return
    }
    const logger = useLogger('database')
    const source = join(nuxt.options.serverDir, 'db/migrations')

    nuxt.hook('nitro:build:public-assets', async nitro => {
      const target = join(nitro.options.output.serverDir, 'db/migrations')
      await cp(source, target, { recursive: true })
      logger.info('Database migrations included in the build')

      // Migrations prefer Neon's direct connection; the pooled one works too
      const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
      if (!url) {
        logger.info('DATABASE_URL is not set, so this build does not migrate the database')
        return
      }
      const database = createDatabase({ kind: 'postgres', url })
      try {
        await database.migrate(target)
        logger.success('Database migrated')
      } finally {
        await database.close()
      }
    })
  },
})
