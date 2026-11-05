import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { globalSetup: ['../../packages/core/test/global-setup.ts'], testTimeout: 120_000, hookTimeout: 60_000, fileParallelism: false, pool: 'forks' },
});
