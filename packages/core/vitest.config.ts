import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { env: { TOTP_REPLAY_PROTECTION: 'off' }, globalSetup: ['./test/global-setup.ts'], testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false, pool: 'forks' },
});
