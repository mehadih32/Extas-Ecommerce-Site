import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // The repository root holds the docs the status page is generated from.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // Workspace packages ship TypeScript source (PR 13 database client, PR 491 settings, PR 493 vault, PR 15 auth,
  // PR 18 adapters, PR 22 media, PR 19 catalogue, S09 inventory, S10 rules, S03 combos, S06 delivery zones, PR 72 search, PR 602 cache, CN-029 erp-types).
  transpilePackages: ['@extas/db', '@extas/accounts', '@extas/settings', '@extas/vault', '@extas/auth', '@extas/adapters', '@extas/media', '@extas/catalogue', '@extas/inventory', '@extas/rules', '@extas/combos', '@extas/delivery', '@extas/cart', '@extas/checkout', '@extas/jobs', '@extas/metrics', '@extas/search', '@extas/messages', '@extas/cache', '@extas/erp-types'],
  // PR 22: sharp (the image pipeline) is a native module: loaded from node_modules at run time, never bundled.
  serverExternalPackages: ['sharp'],
  // PR 378: the proxy now sees /api (cross-site check, request limits); Next keeps only this much of a request body
  // there (10 MB by default), so it is the highest media upload the settings allow (media.upload.maxBytes, at most
  // 200 MB). Each route still enforces its own setting.
  experimental: { proxyClientMaxBodySize: '200mb' },
};

export default config;
