import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Each integration test file gets its own MongoMemoryReplSet, so they must
    // not share process state.
    isolate: true,
    setupFiles: ['./tests/helpers/setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/seed/**', 'src/types/**', 'src/server.ts'],
    },
  },
});
