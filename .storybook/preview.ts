import { UApp } from '#components'
import currentUser from '~/data/current-user'

const config = {
  tags: ['autodocs'],
  decorators: [
    // Nuxt UI needs UApp for tooltips, toasts and programmatic overlays
    (story: unknown) => ({
      components: { story, UApp },
      setup() {
        // Components read the signed-in user from state that the auth middleware fills in the app
        useCurrentUser().set(currentUser)
      },
      template: '<UApp><story /></UApp>',
    }),
  ],
}

export default config
