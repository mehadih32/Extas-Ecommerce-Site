// What the media service needs from the app: the database, the settings, the storage adapter (PR 18) and a way to
// hand heavy work to the image worker. The app builds these once; tests pass a memory or local-disk storage.
import type { Connections, Storage } from '@extas/adapters';
import type { PrismaClient, StorageProvider } from '@extas/db/client';
import type { Settings } from './config';
import type { MediaJob } from './jobs';

export type Db = PrismaClient;

/**
 * The storage for a store. Without `provider`: where new files go now (the store's connection, the installation's,
 * the local-disk fallback …). With `provider`: the adapter of that provider, to read a file from where it went.
 */
export type StorageFor = (storeId: number, provider?: StorageProvider) => Promise<Storage>;

export interface MediaDeps {
  db: Db;
  settings: Settings;
  storage: StorageFor;
  /**
   * Hands a job to the image worker (BullMQ, PR 6). When absent, or when `media.processing.mode` is `inline`, the job
   * runs in this process after the upload has been recorded.
   */
  enqueue?: (job: MediaJob) => Promise<void>;
  /** Runs a task after the answer has gone out (Next.js `after`). Without it an inline job is awaited. */
  defer?: (task: () => Promise<void>) => void;
  now?: () => Date;
}

/** Storage-adapter provider key for each StorageProvider value (the adapter definitions in @extas/adapters). */
export const ADAPTER_OF: Record<StorageProvider, string | null> = {
  LOCAL_DISK: 'localDisk',
  AZURE_BLOB: 'azureBlob',
  S3_COMPATIBLE: 's3',
  GOOGLE_DRIVE: null,
};

/** StorageFor on top of the connection layer: `connections.use('STORAGE', …)`. */
export function storageFromConnections(connections: Pick<Connections, 'use'>): StorageFor {
  return async (storeId, provider) => {
    const adapter = provider ? ADAPTER_OF[provider] : undefined;
    if (adapter === null) throw new Error(`no storage adapter reads ${provider}`);
    const c = await connections.use<Storage>('STORAGE', { storeId, ...(adapter ? { provider: adapter } : {}) });
    return c.api;
  };
}

export const nowOf = (deps: Pick<MediaDeps, 'now'>) => (deps.now ? deps.now() : new Date());
