import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup-env.ts'],
    // Integration tests share one database, so files must not run in parallel.
    fileParallelism: false,
    testTimeout: 15_000,
  },
})
