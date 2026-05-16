import { defineConfig } from 'vite-plus'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { playwright } from 'vite-plus/test/browser-playwright'

// @ts-expect-error: dirname is provided
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
    rules: {
      // Disable sort-keys as this is often undesired
      'eslint/sort-keys': 'off',
      // False-positives for imports from vite-plus/test. TODO: Reactivate this rule
      'vitest/prefer-importing-vitest-globals': 'off',
      // Verify correct test filename pattern
      'vitest/consistent-test-filename': [
        'error',
        {
          pattern: '.*\\.spec\\.ts$',
        },
      ],
      // Restrict prefer-expect-assertions as it is requires to much boilerplate otherwise
      'vitest/prefer-expect-assertions': [
        'error',
        {
          onlyFunctionsWithAsyncKeyword: true,
          onlyFunctionsWithExpectInCallback: true,
          onlyFunctionsWithExpectInLoop: true,
        },
      ],
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
          include: ['test/unit/**/*.spec.ts'],
          environment: 'node',
        },
      },
      // @ts-expect-error: type error upstream
      () =>
        defineVitestProject({
          test: {
            name: 'nuxt',
            include: ['test/nuxt/**/*.spec.ts'],
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
                },
              },
            },
            browser: {
              enabled: true,
              // @ts-expect-error: type error upstream
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
