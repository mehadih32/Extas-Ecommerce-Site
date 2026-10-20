// S06 · PR 550 — the delivery page's pure part (no React, no database), shared by the server page and its components
// and tested on its own (model.test.ts): a band's charge, hours and "charged as" line as text, a place's line, a
// refusal as text, and the band edit form turned into the one change the API takes.
import type { BandOut, BandView, PlaceView, ResolveView } from '@extas/delivery';
import { t, type Dict } from '@/lib/i18n';
import { formatMoney, formatNumber, toMajor, toMinor, type Money } from '../products/model';

export type Lang = 'en' | 'bn';

export const nameOf = (lang: Lang, o: { nameEn: string; nameBn: string | null }) => (lang === 'bn' && o.nameBn ? o.nameBn : o.nameEn);
/** The name in the other language (the demo's tile shows both); '' when there is no second name. */
export const otherName = (lang: Lang, o: { nameEn: string; nameBn: string | null }) => (lang === 'bn' ? (o.nameBn ? o.nameEn : '') : (o.nameBn ?? ''));

/** "80 ৳" when the band is on; "Not set yet" while it is off (an off band has no charge, PR 553). */
export function chargeText(d: Dict, b: Pick<BandView, 'enabled' | 'chargeMinor'>, m: Money): string {
  return b.enabled ? formatMoney(b.chargeMinor, m) : t(d, 'delivery.bands.notSet');
}

export function hoursText(d: Dict, b: Pick<BandView, 'hoursMin' | 'hoursMax'>, locale: string): string {
  const n = (v: number) => formatNumber(v, locale);
  if (b.hoursMin != null && b.hoursMax != null && b.hoursMin !== b.hoursMax) return t(d, 'delivery.bands.hours', { min: n(b.hoursMin), max: n(b.hoursMax) });
  const one = b.hoursMax ?? b.hoursMin;
  return one != null ? t(d, 'delivery.bands.hoursOne', { n: n(one) }) : t(d, 'delivery.bands.noHours');
}

/** The sub-area band folded into another band's charge, in words; '' when it keeps its own. */
export function chargedAsText(d: Dict, b: Pick<BandView, 'role' | 'chargedAs'>): string {
  if (b.role !== 'subArea' || b.chargedAs.role === 'subArea') return '';
  return b.chargedAs.role === 'city' || b.chargedAs.role === 'outside' ? t(d, `delivery.bands.chargedAs.${b.chargedAs.role}`) : '';
}

/** "District · Dhaka" — what tells two places of the same name apart. */
export function placeLine(d: Dict, lang: Lang, p: Pick<PlaceView, 'level' | 'parentEn' | 'parentBn'>): string {
  const parent = lang === 'bn' ? (p.parentBn ?? p.parentEn) : p.parentEn;
  const level = t(d, `delivery.list.levels.${p.level}`);
  return parent ? `${level}${t(d, 'delivery.sep')}${parent}` : level;
}

/** A refusal as text from this screen's messages; field names in words. */
export function refusalText(d: Dict, code: string | undefined, details: string[] = []): string {
  const fields = details
    .map((x) => x.split(':')[0]!.trim())
    .map((f) => {
      const k = `delivery.fields.${f}`;
      const s = t(d, k);
      return s === k ? f : s;
    })
    .join(', ');
  const key = `delivery.errors.${code ?? 'server-error'}`;
  const text = t(d, key, { fields });
  return text === key ? t(d, 'delivery.errors.server-error') : text;
}

export interface BandForm {
  charge: string;
  hoursMin: string;
  hoursMax: string;
  enabled: boolean;
  mode: string;
}

export function bandForm(b: BandView, m: Money): BandForm {
  return { charge: b.enabled ? toMajor(b.chargeMinor, m) : '', hoursMin: b.hoursMin == null ? '' : String(b.hoursMin), hoursMax: b.hoursMax == null ? '' : String(b.hoursMax), enabled: b.enabled, mode: b.mode ?? 'own' };
}

const hoursOf = (s: string): number | null | undefined => {
  const v = s.trim();
  if (!v) return null;
  return /^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : undefined;
};

/**
 * The one PATCH a band's form sends: only what changed, the charge whenever the band is on (switching on needs it in
 * the same change). `error` names what to fix first, before anything is sent.
 */
export function bandPatch(b: BandView, f: BandForm, m: Money): { patch: Record<string, unknown>; error: 'badCharge' | 'badHours' | null } {
  const patch: Record<string, unknown> = {};
  const charge = toMinor(f.charge, m);
  if (charge === undefined || (f.enabled && charge === null)) return { patch, error: 'badCharge' };
  const hMin = hoursOf(f.hoursMin);
  const hMax = hoursOf(f.hoursMax);
  if (hMin === undefined || hMax === undefined || (hMin != null && hMax != null && hMin > hMax)) return { patch, error: 'badHours' };
  if (charge !== null && (charge !== b.chargeMinor || (f.enabled && !b.enabled))) patch.chargeMinor = charge;
  if (f.enabled !== b.enabled) patch.enabled = f.enabled;
  if (hMin !== b.hoursMin) patch.hoursMin = hMin;
  if (hMax !== b.hoursMax) patch.hoursMax = hMax;
  if (b.role === 'subArea' && f.mode !== (b.mode ?? 'own')) patch.mode = f.mode;
  return { patch, error: null };
}

// ------------------------------------------------------------------------------------------------ "Try an address" (PR 551)

type Ask = Extract<ResolveView, { status: 'ask' }>;

/** "Gabtali (Bogura)" — a place with what tells it apart. */
export function placeLabel(lang: Lang, p: Pick<PlaceView, 'nameEn' | 'nameBn' | 'parentEn' | 'parentBn'>): string {
  const parent = lang === 'bn' ? (p.parentBn ?? p.parentEn) : p.parentEn;
  return parent ? `${nameOf(lang, p)} (${parent})` : nameOf(lang, p);
}

/** A band's charge as the customer sees it, or "charge not set" while the band is off. */
export function outCharge(d: Dict, b: Pick<BandOut, 'priced' | 'chargeMinor'>, m: Money): string {
  return b.priced && b.chargeMinor != null ? formatMoney(b.chargeMinor, m) : t(d, 'delivery.try.notSet');
}

/** One choice's second line: "80 ৳ · 24–48 hours". */
export function optionLine(d: Dict, b: BandOut, m: Money, locale: string): string {
  return t(d, 'delivery.try.option', { charge: outCharge(d, b, m), hours: hoursText(d, b, locale) });
}

/** The sentence under "Where is this address?" — naming the places, like the demo's checkout. */
export function askLine(d: Dict, lang: Lang, read: Ask): string {
  const places = [...new Map(read.options.flatMap((o) => o.places).map((p) => [p.id, p])).values()];
  if (read.reason === 'changed') {
    const [kept, now] = read.options;
    const place = now?.places[0] ? placeLabel(lang, now.places[0]) : now ? nameOf(lang, now.band) : '';
    return t(d, 'delivery.try.changed', { place, band: kept ? nameOf(lang, kept.band) : '' });
  }
  if (read.reason === 'two-places' && places.length >= 2) return t(d, 'delivery.try.both', { a: placeLabel(lang, places[0]!), b: placeLabel(lang, places[1]!) });
  if (read.reason === 'wide-place' && places[0]) return t(d, 'delivery.try.wide', { place: placeLabel(lang, places[0]) });
  return t(d, 'delivery.try.none');
}
