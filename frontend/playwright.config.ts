import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level end-to-end config.
 *
 * This layer exists for defects that no other layer can see. The event log
 * silently collapsed the whitespace padding that `who`/`ros`/`pla`/`pri` emit,
 * destroying every ASCII table in a game whose whole identity is monospace
 * terminal output — and it was invisible to the unit, integration and no-mock
 * service layers alike, because it was a CSS rule.
 *
 * REQUIRES A LIVE STACK. Postgres and the NestJS backend must already be
 * running (`npm run start:dev` in backend/); Vite is started automatically here
 * and an existing dev server is reused.
 *
 * Run with: npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 5175);

export default defineConfig({
  testDir: './e2e',
  // The game world runs on a 6-second physics tick, so anything that waits on a
  // tick needs headroom.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Shared game world: parallel workers would fight over sector state and each
  // other's spawned ships.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
