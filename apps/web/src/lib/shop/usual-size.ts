// PR 56 · follow-up 62 (SIM-F-047; demo 30-product.js pdp_pills "Your size" and pdp_mySizeOut): the size row's helpers
// for buyers who read sizes better in their own words, and for a returning buyer.
// - Size words (`pdp.sizeWords`, the owner's words, empty = off): a word under each size box ("ছোট", "মাঝারি"), on the
//   Bengali pages or on both.
// - "My usual size" (`pdp.usualSize`, off): the size this browser last put in the bag, kept apart for tops and bottoms,
//   for `days`; the box gets "Your size", and when it is sold out in this colour the colours that have it are named.
//   Kept in this browser only (a reading that fails changes nothing); an account's own size joins with Find My Size
//   (PR 58). Pure, except the two storage calls at the end.
import type { PdpSizeWordsSettings } from '@extas/settings';
import { stockOf, type PdpModel } from './product-model';

export type SizeGroup = 'top' | 'bottom';

export const USUAL_STORAGE_KEY = 'extas.usualSize';
const DAY_MS = 86_400_000;

interface Kept {
  size: string;
  at: number;
}

type Store = Partial<Record<SizeGroup, Kept>>;

/** The words under the size boxes on this page: the owner's word per size key, in the page's language. */
export function sizeWordsFor(set: PdpSizeWordsSettings, lang: 'en' | 'bn'): Record<string, string> {
  if (!set || (set.show === 'bn' && lang !== 'bn')) return {};
  const out: Record<string, string> = {};
  for (const [k, w] of Object.entries(set.words)) {
    const word = w[lang].trim();
    if (word) out[k] = word;
  }
  return out;
}

/** Tops and bottoms keep their own usual size (a chest size is not a waist size). */
export function sizeGroupOf(garment: string | null, diagramFor: Readonly<Record<string, string>>): SizeGroup {
  return garment && diagramFor[garment] === 'bottom' ? 'bottom' : 'top';
}

function parse(raw: string | null): Store {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {};
    const out: Store = {};
    for (const g of ['top', 'bottom'] as const) {
      const k = (v as Record<string, unknown>)[g] as Partial<Kept> | undefined;
      if (k && typeof k.size === 'string' && /^[a-z0-9-]{1,24}$/.test(k.size) && typeof k.at === 'number' && Number.isFinite(k.at)) out[g] = { size: k.size, at: k.at };
    }
    return out;
  } catch {
    return {};
  }
}

/** The usual size of a group, or null: none kept, older than `days`, or not a size this product has. */
export function readUsual(raw: string | null, group: SizeGroup, days: number, now: number, sizes: readonly string[]): string | null {
  const k = parse(raw)[group];
  if (!k || now - k.at > days * DAY_MS || k.at - now > DAY_MS) return null;
  return sizes.includes(k.size) ? k.size : null;
}

/** The stored value after a size of that group went into the bag. */
export function keepUsual(raw: string | null, group: SizeGroup, size: string, now: number): string {
  return JSON.stringify({ ...parse(raw), [group]: { size, at: now } });
}

/** The other colours that have the usual size in stock (empty when this colour has it, or no colour has). */
export function usualElsewhere(m: Pick<PdpModel, 'colours' | 'variants'>, colour: string | null, size: string): { key: string; name: string }[] {
  if (stockOf(m, colour, size) > 0) return [];
  return m.colours.filter((c) => c.key !== colour && stockOf(m, c.key, size) > 0).map((c) => ({ key: c.key, name: c.name }));
}

export function loadUsual(): string | null {
  try {
    return window.localStorage.getItem(USUAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveUsual(value: string): void {
  try {
    window.localStorage.setItem(USUAL_STORAGE_KEY, value);
  } catch {
    /* private window or storage off: the next visit simply has no usual size */
  }
}
