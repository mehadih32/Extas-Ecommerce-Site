import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The database tests create a throwaway database and apply the migrations, so they get a generous timeout. They run
  // only when TEST_DATABASE_ADMIN_URL is set; the pure-logic tests never need a database.
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
