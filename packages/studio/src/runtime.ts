// S23 · PR 440 — the studio's publishing connection, the same shape as `@extas/media`'s own `mediaRuntime`
// (packages/media/src/runtime.ts): one `createConnections` over the `META` kind's two studio providers
// (`social-publish`), store-scoped, resolved in MOCK until a real Page token is in and its Test passes (A1.3).
import { createConnections, studioPublishAdapters, type SocialPublisher } from '@extas/adapters';
import type { PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import type { PublisherResolver, PublishablePlatform } from './publish';

const PROVIDER_OF: Record<PublishablePlatform, string> = {
  facebook: 'facebookPagePublish',
  instagram: 'instagramPublish',
};

// Technical defaults; the server may set its own through the environment (same names as mediaRuntime's).
const intEnv = (env: NodeJS.ProcessEnv, name: string, fallback: number) => {
  const n = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** A vault that knows no key: every connection then runs on its mock (A1.3). */
export const NO_VAULT: Pick<Vault, 'get'> = { get: async () => null };

export function studioPublisher(o: { db: PrismaClient; vault: Pick<Vault, 'get'> | null; env?: NodeJS.ProcessEnv }): PublisherResolver {
  const env = o.env ?? process.env;
  const connections = createConnections({
    db: o.db,
    vault: o.vault ?? NO_VAULT,
    adapters: studioPublishAdapters,
    secretCacheMs: intEnv(env, 'ADAPTER_SECRET_CACHE_MS', 60_000),
    testTimeoutMs: intEnv(env, 'ADAPTER_TEST_TIMEOUT_MS', 10_000),
  });
  return {
    async resolve(storeId, platform) {
      const { api, mode } = await connections.use<SocialPublisher>('META', { storeId, provider: PROVIDER_OF[platform] });
      return { api, mode };
    },
  };
}
