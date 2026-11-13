// S13 · PR 274 (register "Incomplete-order capture"; SIM-F-026; Blueprint C6.3) — the pure part of Orders › Incomplete:
// how far an unfinished checkout got (typed phone → typed address → reached payment; the further, the hotter), what its
// bag is worth at the prices put in the bag, which visit brought him, the WhatsApp and call links, and the list's views
// read from the address. No database, no clock: lib/admin-orders/incomplete.ts reads the rows.

/** How far he got, coldest first (a bag with no phone number is only counted, never listed: nobody to contact). */
export const INCOMPLETE_STAGES = ['phone', 'address', 'payment'] as const;
export type IncompleteStage = (typeof INCOMPLETE_STAGES)[number];

/** The checkout's own step names (CheckoutForm: details, delivery, payment) as the list's stages. */
export function stageOf(lastStep: string | null | undefined): IncompleteStage {
  if (lastStep === 'payment') return 'payment';
  if (lastStep === 'delivery') return 'address';
  return 'phone';
}

/** Hotter first (reached payment, then address, then phone), then the most recent first. */
export function hotFirst<T extends { stage: IncompleteStage; lastAt: Date }>(rows: readonly T[]): T[] {
  const rank = (s: IncompleteStage) => INCOMPLETE_STAGES.indexOf(s);
  return [...rows].sort((a, b) => rank(b.stage) - rank(a.stage) || b.lastAt.getTime() - a.lastAt.getTime());
}

export interface BagLineFact {
  quantity: number;
  unitPriceMinor: number;
  comboGroupKey: string | null;
  setPriceMinor: number | null;
}

/**
 * The bag's worth at the prices it holds: each line's price × pieces, and a set (lines sharing `comboGroupKey` with a
 * locked set price) counted once at its set price. Delivery, offers and codes are not in it (the checkout prices those).
 */
export function bagValue(lines: readonly BagLineFact[]): number {
  let sum = 0;
  const sets = new Set<string>();
  for (const l of lines) {
    if (l.comboGroupKey && l.setPriceMinor !== null) {
      if (!sets.has(l.comboGroupKey)) sum += l.setPriceMinor;
      sets.add(l.comboGroupKey);
    } else sum += l.quantity * l.unitPriceMinor;
  }
  return sum;
}

/** A WhatsApp chat with the number (international digits only, no words put in his mouth). */
export const whatsAppLink = (e164: string): string => `https://wa.me/${e164.replace(/\D/g, '')}`;
/** A phone call to the number. */
export const callLink = (e164: string): string => `tel:${e164.replace(/[^\d+]/g, '')}`;

export interface VisitChannel {
  /** META, GOOGLE or TIKTOK (from the click id), else null. */
  platform: string | null;
  source: string | null;
  campaign: string | null;
  /** He came through one of the shop's own landing pages. */
  landing: boolean;
}

/** Which visit brought him: the campaign tags the draft kept (`data.attribution`) and a landing-page bag line; null: unknown. */
export function channelOf(data: unknown, landing: boolean): VisitChannel | null {
  const a = data && typeof data === 'object' ? (data as { attribution?: unknown }).attribution : null;
  const o = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const c: VisitChannel = { platform: text(o.adPlatform), source: text(o.utmSource), campaign: text(o.utmCampaign), landing };
  return c.platform || c.source || c.campaign || c.landing ? c : null;
}

/** The list's views: open (nobody marked it handled), given to me, handled, and ordered later (the person came back and ordered; PR 668). */
export const INCOMPLETE_VIEWS = ['open', 'mine', 'handled', 'later'] as const;
export type IncompleteView = (typeof INCOMPLETE_VIEWS)[number];

export function viewOf(v: unknown): IncompleteView {
  const s = Array.isArray(v) ? v[0] : v;
  return INCOMPLETE_VIEWS.find((x) => x === s) ?? 'open';
}

/** The longest note a person leaves when marking one handled. */
export const HANDLED_NOTE_MAX = 300; // hardcode-ok: a field-length guard, not a business number

/** PR 668 — the date filter's presets; `custom` reads `from` and `to` (YYYY-MM-DD). */
export const INCOMPLETE_RANGES = ['all', 'today', 'yesterday', 'week', 'month', 'lastMonth', 'custom'] as const;
export type IncompleteRange = (typeof INCOMPLETE_RANGES)[number];
export const rangeOf = (v: unknown): IncompleteRange => INCOMPLETE_RANGES.find((x) => x === (Array.isArray(v) ? v[0] : v)) ?? 'all';

/** A day key (YYYY-MM-DD) in the shop's own clock: `offsetMinutes` is the shop's offset from UTC (a setting, never code). */
export const dayKey = (at: Date, offsetMinutes: number): string => new Date(at.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);

/** The [from, to) instants of a preset in the shop's clock; null for `all` or an unreadable custom range. */
export function rangeBounds(range: IncompleteRange, now: Date, offsetMinutes: number, custom?: { from?: string | null; to?: string | null }): { from: Date; to: Date } | null {
  const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day
  const local = new Date(now.getTime() + offsetMinutes * 60_000);
  const startOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - offsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  if (range === 'today') return { from: startOf(y, m, d), to: startOf(y, m, d + 1) };
  if (range === 'yesterday') return { from: startOf(y, m, d - 1), to: startOf(y, m, d) };
  if (range === 'week') return { from: startOf(y, m, d - 6), to: startOf(y, m, d + 1) };
  if (range === 'month') return { from: startOf(y, m, 1), to: startOf(y, m, d + 1) };
  if (range === 'lastMonth') return { from: startOf(y, m - 1, 1), to: startOf(y, m, 1) };
  if (range === 'custom') {
    const ok = (t?: string | null) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T00:00:00Z`) : null);
    const a = ok(custom?.from);
    const b = ok(custom?.to);
    if (!a || !b || b < a) return null;
    return { from: new Date(a.getTime() - offsetMinutes * 60_000), to: new Date(b.getTime() + DAY_MS - offsetMinutes * 60_000) };
  }
  return null;
}

/** Newest first, the order inside each day (PR 668: per day, then the hottest within the day is NOT used: the owner reads the day's newest on top). */
export function newestFirst<T extends { lastAt: Date }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

/** The four ready messages: the words in braces are filled in (unknown words are left out, never printed as braces). */
export function fillTemplate(text: string, vars: { name?: string | null; items?: string | null; link?: string | null; offer?: string | null }): string {
  return text
    .replace(/\{(name|items|link|offer)\}/g, (_m, k: 'name' | 'items' | 'link' | 'offer') => (vars[k] ?? '').trim())
    .replace(/\s+([.,:;!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** WhatsApp chat with a message put in the box (the person still presses send), and the same for SMS. */
export const whatsAppTextLink = (e164: string, text: string): string => `${whatsAppLink(e164)}?text=${encodeURIComponent(text)}`;
export const smsLink = (e164: string, text: string): string => `sms:${e164.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text)}`;

/** The shop's offset from UTC (minutes) at an instant, from its IANA zone (`store.timeZone`); 0 when the zone is unreadable. */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  try {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
  } catch {
    return 0;
  }
}
