import { defineConfig } from 'vite-plus'

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
    config: [
      {
        files: '**/*.vue',
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
    jsPlugins: ['@nuxt/eslint-plugin'],
    options: { typeAware: true, typeCheck: true },
    plugins: ['eslint', 'import', 'unicorn', 'typescript', 'oxc', 'vue', 'vitest'],
  },
})
