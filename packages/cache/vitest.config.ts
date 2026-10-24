import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests sit beside the code (src/*.test.ts). The Redis tests (*.redis.test.ts) run only when TEST_REDIS_URL is set;
  // the database tests (*.db.test.ts) only when TEST_DATABASE_ADMIN_URL is set. The pure tests need neither.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
