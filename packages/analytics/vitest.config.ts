import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests sit beside the code (src/*.test.ts). The database tests (*.db.test.ts) create a throwaway database and apply
  // the migrations, so they get a generous timeout; they run only when TEST_DATABASE_ADMIN_URL is set. The pure tests
  // never need a database.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
