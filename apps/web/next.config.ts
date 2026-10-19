import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // The repository root holds the docs the status page is generated from.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default config;
