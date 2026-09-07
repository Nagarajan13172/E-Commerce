import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Each integration test file gets its own MongoMemoryReplSet, so they must
    // not share process state.
    isolate: true,
    /**
     * Cap how many test files run at once.
     *
     * Every integration file starts its own in-memory replica set, so
     * unrestricted parallelism means seven mongod processes holding elections
     * simultaneously. That is a well-known source of intermittent failures —
     * a slow election surfaces as an unrelated assertion mismatch — and it
     * saturates the machine for very little wall-clock gain.
     */
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 },
    },
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
