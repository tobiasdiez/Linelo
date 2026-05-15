import { defineConfig } from 'vite-plus'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { playwright } from 'vite-plus/test/browser-playwright'

const rootDir = import.meta.dirname

export default defineConfig({
  fmt: {
    arrowParens: 'avoid',
    quoteProps: 'consistent',
    semi: false,
    singleQuote: true,
  },
  lint: {
    categories: {
      correctness: 'error',
      perf: 'error',
      style: 'error',
      suspicious: 'error',
    },
    jsPlugins: ['@nuxt/eslint-plugin'],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ['**/*.vue'],
        rules: {
          'unicorn/filename-case': [
            'error',
            {
              case: 'pascalCase',
            },
          ],
        },
      },
    ],
    plugins: ['eslint', 'import', 'unicorn', 'typescript', 'oxc', 'vue', 'vitest'],
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '~': `${rootDir}/app`,
            '~~': rootDir,
            '#shared': `${rootDir}/shared`,
            '#server': `${rootDir}/server`,
          },
        },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      () =>
        defineVitestProject({
          test: {
            name: 'nuxt',
            include: ['test/nuxt/**/*.{test,spec}.ts'],
            environment: 'nuxt',
            environmentOptions: {
              nuxt: {
                rootDir,
                overrides: {
                  vue: {
                    runtimeCompiler: true,
                  },
                  experimental: {
                    payloadExtraction: false,
                    viteEnvironmentApi: false,
                  },
                  pwa: {
                    pwaAssets: { disabled: true },
                  },
                  ogImage: { enabled: false },
                },
              },
            },
            browser: {
              enabled: true,
              provider: playwright(),
              instances: [{ browser: 'chromium', headless: true }],
            },
          },
        }),
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      exclude: ['**/node_modules/**', '**/*.json'],
    },
  },
})
