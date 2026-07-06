export default defineNuxtConfig({
  ssr: false,

  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  fonts: {
    provider: 'local'
  },

  devtools: {
    enabled: false
  },

  css: ['~/assets/css/main.css'],

  app: {
    buildAssetsDir: 'assets/'
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  nitro: {
    devProxy: {
      '/api': {
        target: 'http://localhost:8080/api',
        changeOrigin: true,
      }
    }
  },

  compatibilityDate: '2026-06-30',
})
