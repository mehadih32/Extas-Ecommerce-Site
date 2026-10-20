import { defineConfig } from 'vitest/config';

// *.db.test.ts files create a throwaway database (only with TEST_DATABASE_ADMIN_URL, else skipped): generous timeouts.
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 180_000 } });
