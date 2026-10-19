// The storage mock: objects in memory, for MOCK mode and tests. Nothing leaves the process.
import type { StorageProvider } from '@extas/db/client';
import { assertKey, type Storage } from './types';

export function memoryStorage(provider: StorageProvider = 'LOCAL_DISK'): Storage {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
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
