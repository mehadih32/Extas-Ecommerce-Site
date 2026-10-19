import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The migration test runs `prisma migrate diff` (engine start-up), so it gets a generous timeout.
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 60_000 },
});
