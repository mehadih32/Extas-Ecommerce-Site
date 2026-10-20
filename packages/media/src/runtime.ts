// The media dependencies for a server process (the web app, the CLI, later the image worker): storage through the
// connection layer (PR 18) — the store's Blob or S3 connection when one is switched on, else local disk on the media
// volume (EXTAS_MEDIA_DIR), else the in-memory mock (development without a volume).
import { createConnections, storageAdapters, storageFallback } from '@extas/adapters';
import type { Vault } from '@extas/vault';
import type { Settings } from './config';
import { storageFromConnections, type Db, type MediaDeps } from './deps';

// Technical defaults; the server may set its own through the environment.
const intEnv = (env: NodeJS.ProcessEnv, name: string, fallback: number) => {
  const n = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** A vault that knows no key: every connection then runs on its fallback or its mock (A1.3). */
export const NO_VAULT: Pick<Vault, 'get'> = { get: async () => null };

export function mediaRuntime(o: {
  db: Db;
  settings: Settings;
  vault: Pick<Vault, 'get'> | null;
  env?: NodeJS.ProcessEnv;
  defer?: MediaDeps['defer'];
  enqueue?: MediaDeps['enqueue'];
}): MediaDeps {
  const env = o.env ?? process.env;
  const fallback = storageFallback(env);
  const connections = createConnections({
    db: o.db,
    vault: o.vault ?? NO_VAULT,
    adapters: storageAdapters,
    secretCacheMs: intEnv(env, 'ADAPTER_SECRET_CACHE_MS', 60_000),
    testTimeoutMs: intEnv(env, 'ADAPTER_TEST_TIMEOUT_MS', 10_000),
    ...(fallback ? { fallbacks: { STORAGE: fallback } } : {}),
  });
  return { db: o.db, settings: o.settings, storage: storageFromConnections(connections), defer: o.defer, enqueue: o.enqueue };
}
