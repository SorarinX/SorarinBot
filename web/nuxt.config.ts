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

  vite: {
    build: {
      rollupOptions: {
        output: {
          // Go embed ignores files starting with _ — force all chunks to start with c
          chunkFileNames: 'assets/c[hash].js',
          entryFileNames: 'assets/e[hash].js',
          assetFileNames: 'assets/a[hash][extname]',
        }
      }
    }
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
