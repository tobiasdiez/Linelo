// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Linelo',
    },
  },
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  typescript: {
    // Type-check the Storybook setup against the app (for `#components`)
    tsConfig: {
      include: ['../.storybook/**/*'],
    },
    // Type-check the plain unit tests against the shared code they cover
    sharedTsConfig: {
      include: ['../test/unit/**/*'],
    },
  },
  ui: {
    // The design system is light-only for the moment
    colorMode: false,
  },
  // A new migration restarts the dev server, which applies it (server/plugins/migrate.ts)
  watch: [/server\/db\/migrations\//],
})
