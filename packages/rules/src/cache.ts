// The storefront reads the live rules and notices on every page, so it keeps them for `rules.public.cacheSeconds` per
// store. Every publish, status change, archive and notice change in this process drops the store's entry at once;
// another process (a second web container) sees the change when its own entry runs out.
interface Entry<T> {
  at: number;
  value: T;
}

const entries = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, maxAgeMs: number, now: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && maxAgeMs > 0 && now - hit.at < maxAgeMs) return hit.value as T;
  const value = await load();
  entries.set(key, { at: now, value });
  return value;
}

/** Drops everything cached for one store (rules and notices). */
export function bustStore(storeId: number): void {
  for (const k of [...entries.keys()]) if (k.endsWith(`@${storeId}`)) entries.delete(k);
}

/** Drops everything (tests). */
export function bustAll(): void {
  entries.clear();
}
