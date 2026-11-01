import type { StorybookConfig } from '@nuxtjs/storybook'

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
  staticDirs: ['../public'],
}
export default config
