// The storage mock: objects in memory, for MOCK mode and tests. Nothing leaves the process.
//
// - memoryStorage(): a fresh, private store (tests build their own).
// - sharedMemoryStorage(provider): what an adapter's MOCK mode hands out — ONE store per provider for the whole process.
//   The connection layer builds a client per lookup ("where files go now", "the provider this file was written to")
//   and again when its cache expires, so a mock that made a new map each time would lose every file between two
//   lookups: an uploaded original could never be read back to make its sizes (PR 22 follow-up). The store is kept on
//   globalThis because Next.js may load this module more than once in one process (routes, pages, `after()` tasks).
//   It still lives only in this process: several app replicas need the media volume (EXTAS_MEDIA_DIR) or Blob.
import type { StorageProvider } from '@extas/db/client';
import { assertKey, type Storage } from './types';

type Objects = Map<string, { body: Uint8Array; contentType: string }>;

function over(provider: StorageProvider, objects: Objects): Storage {
  return {
    provider,
    async put(key, body, contentType) {
      assertKey(key);
      objects.set(key, { body: new Uint8Array(body), contentType });
      return { key, bytes: body.byteLength, contentType };
    },
    async get(key) {
      assertKey(key);
      const o = objects.get(key);
      return o ? { body: new Uint8Array(o.body), contentType: o.contentType } : null;
    },
    async head(key) {
      assertKey(key);
      const o = objects.get(key);
      return o ? { key, bytes: o.body.byteLength, contentType: o.contentType } : null;
    },
  };
}

/** A fresh, private in-memory store. */
export function memoryStorage(provider: StorageProvider = 'LOCAL_DISK'): Storage {
  return over(provider, new Map());
}

const holder = globalThis as unknown as { __extasMockStorage?: Map<StorageProvider, Objects> };

/** The process-wide in-memory store of a provider's MOCK mode (the same objects on every call). */
export function sharedMemoryStorage(provider: StorageProvider): Storage {
  holder.__extasMockStorage ??= new Map();
  let objects = holder.__extasMockStorage.get(provider);
  if (!objects) {
    objects = new Map();
    holder.__extasMockStorage.set(provider, objects);
  }
  return over(provider, objects);
}
