// The storage adapter (PR 18, 604; Blueprint A2.9.15): media and files go through one interface, so the shop works on
// local disk, Azure Blob or any S3-compatible service, with or without the CDN. Keys are relative paths such as
// `media/2026/10/abc.webp`; the provider is recorded on MediaAsset.storage so a file is always read from where it went.
import type { StorageProvider } from '@extas/db/client';
import { AdapterError } from '../define';

export interface StoredObject {
  key: string;
  bytes: number;
  contentType: string;
}

export interface Storage {
  provider: StorageProvider;
  /** Writes (or replaces) the object. */
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
  /** The object, or null when there is none. */
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  head(key: string): Promise<StoredObject | null>;
}

const KEY = /^[a-zA-Z0-9_][a-zA-Z0-9._\-/]*$/;
const MAX_KEY = 1024;

/** A relative, normalised key: no leading slash, no `.`/`..` segments, no empty segments. */
export function assertKey(key: string): void {
  const ok =
    key.length > 0 &&
    key.length <= MAX_KEY &&
    KEY.test(key) &&
    key.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
  if (!ok) throw new AdapterError(`invalid storage key "${key.slice(0, 80)}"`);
}

/** Where the Test button writes and reads back. Overwritten each time, never deleted (nothing is deleted). */
export const PROBE_KEY = '_extas/connection-test.txt';

export async function probe(storage: Storage): Promise<string> {
  const body = new TextEncoder().encode(`connection test ${new Date().toISOString()}`);
  await storage.put(PROBE_KEY, body, 'text/plain');
  const back = await storage.get(PROBE_KEY);
  if (!back || Buffer.compare(Buffer.from(back.body), Buffer.from(body)) !== 0) {
    throw new AdapterError('wrote a test file but could not read the same bytes back');
  }
  return 'wrote and read back a test file';
}
