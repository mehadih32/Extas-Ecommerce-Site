import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests sit beside the code (src/*.test.ts). No database: the documents are data in, PDF bytes out. The text tests
  // shape real letters with the server's fonts, so they get a generous timeout.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
