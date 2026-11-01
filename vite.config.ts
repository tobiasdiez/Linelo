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
    rules: {
      // Disable sort-keys as this is often undesired
      'eslint/sort-keys': 'off',
      // Allow export statements everywhere (handy for eg nuxt modules)
      'import/exports-last': 'off',
      // Enforce function declarations
      'eslint/func-style': ['error', 'declaration'],
      // Enforce minimum identifier length of 2, with exceptions for common short variables like i, j, and _ (often used for unused variables)
      'eslint/id-length': [
        'error',
        {
          min: 2,
          exceptions: ['i', 'j', '_'],
        },
      ],
      // Don't check max statements per function
      'eslint/max-statements': 'off',
      // Allow continue
      'eslint/no-continue': 'off',
      // Allow multiple variable declarations instead of combining them into one statement
      'eslint/one-var': 'off',
      // Allow ternary expressions
      'eslint/no-ternary': 'off',
      // Allow only certain magic numbers
      'eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
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
      {
        files: ['modules/**/*.ts'],
        rules: {
          'import/no-nodejs-modules': 'off',
        },
      },
      {
        files: ['test/**'],
        plugins: ['vitest'],
        rules: {
          // Vitest globals are not enabled, so they need to be imported
          'vitest/no-importing-vitest-globals': 'off',
          // Verify correct test filename pattern
          'vitest/consistent-test-filename': [
            'error',
            {
              pattern: String.raw`.*\.spec\.ts$`,
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
      },
    ],
    plugins: ['eslint', 'import', 'unicorn', 'typescript', 'oxc', 'vue'],
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
