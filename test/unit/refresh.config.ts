/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite-plus'
import { parseEnv } from 'node:util'
import path from 'node:path'

/*
 * For `pnpm ranking:demo-answers` only: runs `demo-answers.refresh.ts`, which the specs'
 * configuration (`vite.config.ts`) leaves out because it calls TypeSafe. Of everything
 * `.env` holds, it passes on TYPESAFE_API_KEY alone.
 */

const rootDir = path.resolve(import.meta.dirname, '../..')
const envFile = path.join(rootDir, '.env')
const settings = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
const apiKey = process.env.TYPESAFE_API_KEY ?? settings.TYPESAFE_API_KEY

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      '#shared': `${rootDir}/shared`,
      '#server': `${rootDir}/server`,
    },
  },
  test: {
    include: ['test/unit/**/*.refresh.ts'],
    environment: 'node',
    env: apiKey ? { TYPESAFE_API_KEY: apiKey } : {},
    coverage: { enabled: false },
  },
})
