// S23 · PR 440–441 — the studio's publishing connection, the same shape as `@extas/media`'s own `mediaRuntime`
// (packages/media/src/runtime.ts): one `createConnections` over the studio's publishing providers
// (`social-publish`), store-scoped, resolved in MOCK until a real key is in and its Test passes (A1.3). Facebook
// and Instagram share the `META` kind (PR 440); TikTok is its own `TIKTOK` kind (PR 441, the same bucket
// `tiktokAds`/`tiktokEvents` already use) — so each platform needs both its own kind and its own provider name.
import { createConnections, studioPublishAdapters, type Kind, type SocialPublisher } from '@extas/adapters';
import type { PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import type { PublisherResolver, PublishablePlatform } from './publish';

const PROVIDER_OF: Record<PublishablePlatform, string> = {
  facebook: 'facebookPagePublish',
  instagram: 'instagramPublish',
  tiktok: 'tiktokPublish',
};

const KIND_OF: Record<PublishablePlatform, Kind> = {
  facebook: 'META',
  instagram: 'META',
  tiktok: 'TIKTOK',
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
      const { api, mode } = await connections.use<SocialPublisher>(KIND_OF[platform], { storeId, provider: PROVIDER_OF[platform] });
      return { api, mode };
    },
  };
}
