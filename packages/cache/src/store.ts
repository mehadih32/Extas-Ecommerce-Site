// PR 602 — the server's page cache: ready-made page data kept in this process for a while, each entry with the tags
// of everything it shows (rules.ts), so one change clears exactly the pages it touches. It keeps the loaded objects as
// they are (no copying, no JSON), counts its hits and misses for the Cache page, drops the least recently used entry
// when full, and loads a missing entry once even when many visitors ask for it at the same moment.
//
// A purge that lands while an entry is being loaded wins: what that load returns is handed to its caller but not kept
// (it may have been read before the change was saved).

export interface Loaded<T> {
  value: T;
  /** The tags of everything on the page (a product's, the store's, the category lists'). */
  tags: readonly string[];
}

export interface CacheCounts {
  hits: number;
  misses: number;
}

export interface PageCacheOptions {
  /** How many entries are kept at most; the least recently used goes first. */
  maxEntries: () => number;
  now?: () => number;
  /** Told about every hit and miss (the Redis counters behind the Cache page's hit rate). */
  onCount?: (layer: string, hit: boolean) => void;
}

interface Entry {
  value: unknown;
  tags: readonly string[];
  expires: number;
  layer: string;
}

export class PageCache {
  private readonly entries = new Map<string, Entry>();
  private readonly byTag = new Map<string, Set<string>>();
  private readonly loading = new Map<string, Promise<unknown>>();
  private readonly counts = new Map<string, CacheCounts>();
  private generation = 0;
  private readonly now: () => number;

  constructor(private readonly opts: PageCacheOptions) {
    this.now = opts.now ?? Date.now;
  }

  /**
   * The entry under `key`, or what `load` returns (kept for `ttlMs`; null is never kept). `layer` names the kind of
   * entry for the counters (`page`, `stock`). A `ttlMs` of 0 or less reads through and keeps nothing.
   */
  async get<T>(
    layer: string,
    key: string,
    ttlMs: number,
    load: () => Promise<Loaded<T> | null>,
  ): Promise<T | null> {
    if (ttlMs <= 0) {
      const r = await load();
      return r ? r.value : null;
    }
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.now()) {
      // most recently used goes to the end
      this.entries.delete(key);
      this.entries.set(key, hit);
      this.count(layer, true);
      return hit.value as T;
    }
    if (hit) this.drop(key);
    this.count(layer, false);
    const pending = this.loading.get(key);
    if (pending) return (await pending) as T | null;
    const gen = this.generation;
    const p = (async () => {
      const r = await load();
      if (!r) return null;
      if (gen === this.generation)
        this.put(key, {
          value: r.value,
          tags: r.tags,
          expires: this.now() + ttlMs,
          layer,
        });
      return r.value;
    })().finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return (await p) as T | null;
  }

  /** Clears every entry carrying one of the tags; returns how many went. */
  purgeTags(tags: readonly string[]): number {
    this.generation++;
    const keys = new Set<string>();
    for (const t of tags) for (const k of this.byTag.get(t) ?? []) keys.add(k);
    for (const k of keys) this.drop(k);
    return keys.size;
  }

  /** Clears everything; returns how many entries went. */
  clear(): number {
    this.generation++;
    const n = this.entries.size;
    this.entries.clear();
    this.byTag.clear();
    return n;
  }

  /** Entries kept now, by layer. */
  sizes(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries.values())
      out[e.layer] = (out[e.layer] ?? 0) + 1;
    return out;
  }

  /** Hits and misses since this process started, by layer. */
  stats(): Record<string, CacheCounts> {
    return Object.fromEntries([...this.counts].map(([k, v]) => [k, { ...v }]));
  }

  private count(layer: string, hit: boolean) {
    const c = this.counts.get(layer) ?? { hits: 0, misses: 0 };
    if (hit) c.hits++;
    else c.misses++;
    this.counts.set(layer, c);
    this.opts.onCount?.(layer, hit);
  }

  private put(key: string, e: Entry) {
    this.drop(key);
    this.entries.set(key, e);
    for (const t of e.tags) {
      let s = this.byTag.get(t);
      if (!s) this.byTag.set(t, (s = new Set()));
      s.add(key);
    }
    const max = Math.max(1, this.opts.maxEntries());
    while (this.entries.size > max) {
      const oldest = this.entries.keys().next().value as string;
      this.drop(oldest);
    }
  }

  private drop(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    for (const t of e.tags) {
      const s = this.byTag.get(t);
      if (!s) continue;
      s.delete(key);
      if (!s.size) this.byTag.delete(t);
    }
  }
}

/** Hit share in whole percent, or null when nothing was asked yet. */
export function hitPercent(c: CacheCounts | undefined): number | null {
  if (!c) return null;
  const all = c.hits + c.misses;
  return all ? Math.round((c.hits / all) * 100) : null;
}
