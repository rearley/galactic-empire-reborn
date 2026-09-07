import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/public': { target: 'http://localhost:3000', changeOrigin: true },
      '/admin': { target: 'http://localhost:3000', changeOrigin: true },
      '/debug': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // e2e/ holds Playwright specs — they import @playwright/test and drive a
    // real browser against a live stack, so Vitest must not collect them.
    // Run them with `npm run test:e2e`.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
});
