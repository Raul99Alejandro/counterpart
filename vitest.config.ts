import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup/quiet-logs.ts'],
    globalSetup: ['test/global-setup.ts']
  }
});
