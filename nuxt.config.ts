export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  srcDir: '.',
  serverDir: 'server',
  devServer: {
    host: 'visidiff.localhost',
    port: 3000
  },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/tailwind.css'],
  tailwindcss: { cssPath: '~/assets/css/tailwind.css' },
  devtools: { enabled: false },
  nitro: {
    experimental: {
      // SSE works fine without this; left as documentation
    }
  },
  app: {
    head: {
      title: 'VisiDiff',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  }
})
