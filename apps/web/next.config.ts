import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // The repository root holds the docs the status page is generated from.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // Workspace packages ship TypeScript source (PR 13 database client, PR 491 settings, PR 493 vault, PR 15 auth, PR 18 adapters).
  transpilePackages: ['@extas/db', '@extas/settings', '@extas/vault', '@extas/auth', '@extas/adapters'],
};

export default config;
