import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests sit beside the code (src/*.test.ts). Pure: no database, no network.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
