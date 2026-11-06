import { defineConfig, devices } from '@playwright/test';
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/p2p_e2e';
const env = { TOTP_REPLAY_PROTECTION: 'on', DATABASE_URL: E2E_DB, PROVIDER_MODE: 'mock', RATE_LIMIT_DISABLED: '1', API_PORT: '4000', WEB_ORIGIN: 'http://localhost:3002', REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379' };
export default defineConfig({
  testDir: './e2e', timeout: 120_000, workers: 1,
  globalSetup: '../web/e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3002', trace: 'off', ...devices['Pixel 7'] },
  webServer: [
    { command: 'node ../api/dist/main.js', url: 'http://localhost:4000/healthz', env, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'pnpm exec next start -p 3002', url: 'http://localhost:3002/en', env: { API_URL: 'http://localhost:4000' }, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
