import { UApp } from '#components'

const config = {
  tags: ['autodocs'],
  decorators: [
    // Nuxt UI needs UApp for tooltips, toasts and programmatic overlays
    (story: unknown) => ({
      components: { story, UApp },
      template: '<UApp><story /></UApp>',
    }),
  ],
}

export default config
