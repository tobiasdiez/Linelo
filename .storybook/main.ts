import type { StorybookConfig } from '@nuxtjs/storybook'
import { mkdirSync } from 'node:fs'

// Nuxt fonts serves `/_fonts` only in `storybook dev`, through a Vite middleware.
// The static build (Chromatic) needs the files, so serve the module's download cache.
// It is filled by `nuxt build`, which CI runs first, or by any `nuxt dev` session.
const nuxtFontsCache = '../node_modules/.cache/nuxt/fonts/meta/data/fonts'
mkdirSync(new URL(nuxtFontsCache, import.meta.url), { recursive: true })

const config: StorybookConfig = {
  addons: ['storybook-vue-addon', '@chromatic-com/storybook'],
  core: {
    // @ts-expect-error - need to update storybook types
    disableTelemetry: true,
  },
  framework: {
    name: '@storybook-vue/nuxt',
    options: {},
  },
  // Need to specify stories as workaround for https://github.com/storybookjs/storybook/issues/20761
  stories: ['../app/components/**/*.stories.vue'],
  // Serves `/logo.svg` and other public assets
  staticDirs: ['../public', { from: nuxtFontsCache, to: '/_fonts' }],
}
export default config
