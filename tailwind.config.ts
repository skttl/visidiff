import type { Config } from 'tailwindcss'

export default <Config>{
  content: [
    './app/**/*.{vue,js,ts}',
    './components/**/*.{vue,js,ts}',
    './pages/**/*.{vue,js,ts}',
    './app.vue'
  ],
  theme: {
    extend: {}
  },
  plugins: []
}
