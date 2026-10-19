import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // *.db.test.ts files create a throwaway database (only with TEST_DATABASE_ADMIN_URL, else skipped): generous timeouts.
  test: { environment: 'node', include: ['src/**/*.test.ts', '../../tools/**/*.test.mjs'], testTimeout: 60_000, hookTimeout: 180_000 },
});
