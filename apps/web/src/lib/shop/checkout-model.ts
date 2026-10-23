// S04 — the checkout's small pure helpers (no React, no browser): how the delivery step names a band and a place, and
// how a band's hours and the customer's kept choice are read. Tested in checkout-model.test.ts.
import { PAY_METHODS, type BandOut, type PaymentChoice, type PlaceName } from '@extas/checkout/pure';
import type { ShopLang } from './lang';

/** A name in the page's language (the Bengali one when it exists). */
export const named = (lang: ShopLang, en: string, bn: string | null | undefined) => (lang === 'bn' && bn ? bn : en);

/** "Mirpur 12 · Dhaka": the place and the district that tells it apart. */
export function placeLine(lang: ShopLang, p: PlaceName | null): string {
  if (!p) return '';
  const own = named(lang, p.nameEn, p.nameBn);
  const parent = p.parentEn ? named(lang, p.parentEn, p.parentBn) : '';
  return parent && parent !== own ? `${own} · ${parent}` : own;
}

/** "24–48" from the band's hours (in the page's digits), or null when the owner has not set them. */
export function hoursOf(b: Pick<BandOut, 'hoursMin' | 'hoursMax'>, n: (x: number) => string): string | null {
  const lo = b.hoursMin;
  const hi = b.hoursMax;
  if (lo === null && hi === null) return null;
  return lo !== null && hi !== null && lo !== hi ? `${n(lo)}–${n(hi)}` : n((hi ?? lo)!);
}

/** The band (and place) he picked when he was asked (PR 118). */
export type Confirmed = { bandId: string; areaId: string | null } | null;

/** A band choice kept in the tab's draft, checked before it is sent again (anything else is "no choice"). */
export function confirmedOf(v: unknown): Confirmed {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return typeof o.bandId === 'string' && o.bandId ? { bandId: o.bandId, areaId: typeof o.areaId === 'string' && o.areaId ? o.areaId : null } : null;
}

/** PR 119: the store-wide promise before the band is known — the quickest band's start to the slowest band's end. */
export function anyBandHours(bands: readonly Pick<BandOut, 'hoursMin' | 'hoursMax' | 'priced'>[]): Pick<BandOut, 'hoursMin' | 'hoursMax'> {
  const priced = bands.filter((b) => b.priced);
  const lows = priced.map((b) => b.hoursMin ?? b.hoursMax).filter((x): x is number => x !== null);
  const highs = priced.map((b) => b.hoursMax ?? b.hoursMin).filter((x): x is number => x !== null);
  return { hoursMin: lows.length ? Math.min(...lows) : null, hoursMax: highs.length ? Math.max(...highs) : null };
}

/**
 * PR 120 (demo rule 39): on a phone the payment boxes open after ONE finished word of the address — three letters or
 * more followed by a space or a comma — or two words; until then the step only names what can be paid with.
 */
export function payOpens(address: string): boolean {
  const s = String(address || '');
  if (/[A-Za-z0-9ঀ-৿]{3,}[\s,]/.test(s)) return true;
  return s.split(/[^A-Za-z0-9ঀ-৿]+/).filter((x) => x.length >= 2).length >= 2;
}

/** A payment choice kept in the tab's draft, checked before it is sent again (the server checks it once more). */
export function payChoiceOf(v: unknown): PaymentChoice | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const method = (PAY_METHODS as readonly unknown[]).includes(o.method) ? (o.method as PaymentChoice['method']) : null;
  return method ? { method, option: typeof o.option === 'string' && o.option ? o.option : null } : null;
}
