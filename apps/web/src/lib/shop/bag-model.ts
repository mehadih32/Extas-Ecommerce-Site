// PR 105–114 — the bag page's pure helpers (no database, no React): the two cookies, the words that depend on a number
// or a list, and which reassurance lines the bag may say (CN-018: a line shows only when a setting or a flag backs it).
// Shared by the server page, the API and the client pieces; tested in bag-model.test.ts.
import type { ShopT } from './dict';

/** The bag's cookie: a random visitor id (it says nothing about the person). `__Host-`: this site only, path /. */
export const BAG_COOKIE = '__Host-extas_bag';
/** The number on the bag icon (header and bottom bar), read by the server layout; never trusted for money. */
export const COUNT_COOKIE = 'extas_bag_n';
/** The most the badge shows. */
export const BADGE_MAX = 99;

/**
 * A bag cookie: HttpOnly and Secure. SameSite=Lax (not Strict) on purpose: a customer who comes back from a link in
 * Facebook or an SMS must find the same bag.
 */
export function bagCookie(name: string, value: string, days: number): string {
  const maxAge = Math.max(0, Math.floor(days * 86_400));
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** The badge number from its cookie: a whole number 0–99, anything else is 0. */
export function badgeCount(raw: string | null | undefined): number {
  if (!raw || !/^\d{1,6}$/.test(raw)) return 0;
  return Math.min(BADGE_MAX, Number.parseInt(raw, 10));
}

/** "1 item" / "3 items" (the dictionary's `.one` / `.other`). */
export function plural(t: ShopT, key: string, n: number, num: (n: number) => string, vars: Record<string, string | number> = {}): string {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { ...vars, n: num(n) });
}

/** "M and L", "S, M and L" (the two-sizes card). */
export function listText(items: readonly string[], and: string): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`;
}

/** The category's name as a plural noun in a sentence ("Buy more polos"): English lower-cased, Bengali as written. */
export function inSentence(name: string, lang: 'en' | 'bn'): string {
  return lang === 'en' ? name.toLowerCase() : name;
}

/** The reassurance lines the bag may say, each only when its setting or flag is on (CN-018). */
export interface Reassurance {
  cod: boolean;
  exchange: boolean;
  secure: boolean;
  original: boolean;
}

export function reassurance(flags: { cod: boolean; exchange: boolean }, s: { securePayment: boolean; originalLine: boolean }): Reassurance {
  return { cod: flags.cod, exchange: flags.exchange, secure: s.securePayment, original: s.originalLine };
}

/**
 * PR 106 · the panel's delivery line. Free: "Free delivery unlocked". Not free: never "add ৳X more" (that is the bag
 * page's job), only the Cash on Delivery and exchange reassurance when they are on; with neither, nothing.
 */
export function panelDeliveryLine(free: boolean, r: Pick<Reassurance, 'cod' | 'exchange'>): 'free' | 'codExchange' | 'cod' | 'exchange' | null {
  if (free) return 'free';
  if (r.cod && r.exchange) return 'codExchange';
  if (r.cod) return 'cod';
  if (r.exchange) return 'exchange';
  return null;
}
