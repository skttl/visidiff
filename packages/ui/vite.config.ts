import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4321',
      '/screenshots': 'http://localhost:4321',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
