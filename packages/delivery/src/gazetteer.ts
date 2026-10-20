// PR 549 — the national gazetteer in memory: division → district → upazila / thana → area, every name it is known by
// (English, Bengali and the Banglish people type), its postcodes and, for Dhaka City, its city corporation (DNCC / DSCC).
// The rows live in GeoArea (installation-wide reference data, the same for every store); this index is what the
// resolver (PR 551), the band map (PR 550) and the autocomplete (PR 552) read. It is built once and shared.
import { fold, hasBengali, nameKey } from './text';

export const GEO_LEVELS = ['DIVISION', 'DISTRICT', 'UPAZILA', 'THANA', 'AREA'] as const;
export type GeoLevelName = (typeof GEO_LEVELS)[number];

/** One place, as the engine reads it. */
export interface GeoEntry {
  id: string;
  code: string | null;
  level: GeoLevelName;
  parentId: string | null;
  nameEn: string;
  nameBn: string | null;
  aliases: string[];
  postcodes: string[];
  cityCorporation: string | null;
}

/** One name of a place, in its two comparison forms. */
export interface NameKey {
  key: string;
  folded: string;
  entry: GeoEntry;
  /** The name as written in the gazetteer. */
  name: string;
  /** The place's own English or Bengali name (not an alias). */
  primary: boolean;
}

const sortKeys = (a: NameKey, b: NameKey) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const sortFolded = (a: NameKey, b: NameKey) => (a.folded < b.folded ? -1 : a.folded > b.folded ? 1 : 0);

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const l = m.get(k);
  if (l) {
    if (!l.includes(v)) l.push(v);
  } else m.set(k, [v]);
}

/** First index in a sorted list whose value is >= prefix. */
function lowerBound(list: NameKey[], prefix: string, field: 'key' | 'folded'): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]![field] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class Gazetteer {
  readonly entries: readonly GeoEntry[];
  private readonly byId = new Map<string, GeoEntry>();
  private readonly codeIndex = new Map<string, GeoEntry>();
  private readonly kids = new Map<string, GeoEntry[]>();
  private readonly exact = new Map<string, GeoEntry[]>();
  private readonly loose = new Map<string, GeoEntry[]>();
  private readonly postcodeIndex = new Map<string, GeoEntry[]>();
  private readonly ancestorCache = new Map<string, GeoEntry[]>();
  /** Every name, sorted by its key and by its loose key (prefix search, PR 552). */
  readonly byKey: NameKey[] = [];
  readonly byFolded: NameKey[] = [];
  /** The most words any name has (the resolver reads phrases up to this long). */
  readonly maxNameWords: number;

  constructor(entries: readonly GeoEntry[]) {
    this.entries = entries;
    let max = 1;
    for (const e of entries) {
      this.byId.set(e.id, e);
      if (e.code) this.codeIndex.set(e.code, e);
    }
    for (const e of entries) {
      if (e.parentId && this.byId.has(e.parentId)) push(this.kids, e.parentId, e);
      const names: [string, boolean][] = [[e.nameEn, true]];
      if (e.nameBn) names.push([e.nameBn, true]);
      for (const a of e.aliases) names.push([a, false]);
      const seen = new Set<string>();
      for (const [name, primary] of names) {
        const key = nameKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const folded = fold(key);
        push(this.exact, key, e);
        push(this.loose, folded, e);
        const k: NameKey = { key, folded, entry: e, name, primary };
        this.byKey.push(k);
        this.byFolded.push(k);
        max = Math.max(max, key.split(' ').length);
      }
      for (const pc of e.postcodes) push(this.postcodeIndex, pc, e);
    }
    this.byKey.sort(sortKeys);
    this.byFolded.sort(sortFolded);
    this.maxNameWords = max;
  }

  get size(): number {
    return this.entries.length;
  }

  get(id: string | null | undefined): GeoEntry | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  byCode(code: string): GeoEntry | undefined {
    return this.codeIndex.get(code);
  }

  parent(e: GeoEntry): GeoEntry | undefined {
    return this.get(e.parentId);
  }

  children(e: GeoEntry): readonly GeoEntry[] {
    return this.kids.get(e.id) ?? [];
  }

  /** The chain above a place, nearest first. A broken or circular chain stops where it breaks. */
  ancestors(e: GeoEntry): readonly GeoEntry[] {
    const hit = this.ancestorCache.get(e.id);
    if (hit) return hit;
    const out: GeoEntry[] = [];
    const seen = new Set([e.id]);
    for (let p = this.parent(e); p && !seen.has(p.id); p = this.parent(p)) {
      out.push(p);
      seen.add(p.id);
    }
    this.ancestorCache.set(e.id, out);
    return out;
  }

  /** The place itself and every place above it, nearest first. */
  lineage(e: GeoEntry): GeoEntry[] {
    return [e, ...this.ancestors(e)];
  }

  isAncestor(a: GeoEntry, of: GeoEntry): boolean {
    return this.ancestors(of).includes(a);
  }

  /** How far down the tree a place sits (a division is 0). */
  depth(e: GeoEntry): number {
    return this.ancestors(e).length;
  }

  /** The district a place belongs to (itself when it is one), if any. */
  district(e: GeoEntry): GeoEntry | undefined {
    return this.lineage(e).find((x) => x.level === 'DISTRICT');
  }

  /** Places named exactly so, or so in the loose spelling (a normalized phrase). */
  lookup(key: string): GeoEntry[] {
    const a = this.exact.get(key) ?? [];
    const b = this.loose.get(fold(key)) ?? [];
    return a.length && !b.length ? a : [...new Set([...a, ...b])];
  }

  /** Places that carry this postcode. */
  withPostcode(code: string): readonly GeoEntry[] {
    return this.postcodeIndex.get(code) ?? [];
  }

  /** Names whose key starts with the prefix (in key order), then names whose loose key does. */
  *prefixed(prefix: string): Generator<NameKey> {
    if (!prefix) return;
    const seen = new Set<NameKey>();
    for (let i = lowerBound(this.byKey, prefix, 'key'); i < this.byKey.length && this.byKey[i]!.key.startsWith(prefix); i++) {
      seen.add(this.byKey[i]!);
      yield this.byKey[i]!;
    }
    const f = fold(prefix);
    for (let i = lowerBound(this.byFolded, f, 'folded'); i < this.byFolded.length && this.byFolded[i]!.folded.startsWith(f); i++) {
      if (!seen.has(this.byFolded[i]!)) yield this.byFolded[i]!;
    }
  }

  /** A place's name in a language (Bengali falls back to English). */
  name(e: GeoEntry, lang: 'en' | 'bn'): string {
    return lang === 'bn' && e.nameBn ? e.nameBn : e.nameEn;
  }

  /**
   * The place that tells two places of the same name apart: its district, or for a district its division. A Dhaka
   * City area names Dhaka; Bogura's Gabtali names Bogura.
   */
  parentLabelOf(e: GeoEntry): GeoEntry | undefined {
    if (e.level === 'DIVISION') return undefined;
    if (e.level === 'DISTRICT') return this.parent(e);
    return this.district(e) ?? this.parent(e);
  }

  /** "Gabtali · Bogura" style label in a language. */
  label(e: GeoEntry, lang: 'en' | 'bn', sep: string): string {
    const p = this.parentLabelOf(e);
    return p ? `${this.name(e, lang)}${sep}${this.name(p, lang)}` : this.name(e, lang);
  }
}

/** True when a name is written in Bengali (the autocomplete answers in the script the customer types). */
export const isBengaliName = hasBengali;
