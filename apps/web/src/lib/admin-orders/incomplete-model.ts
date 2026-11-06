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

/** The list's views: open (nobody marked it handled), given to me, handled. */
export const INCOMPLETE_VIEWS = ['open', 'mine', 'handled'] as const;
export type IncompleteView = (typeof INCOMPLETE_VIEWS)[number];

export function viewOf(v: unknown): IncompleteView {
  const s = Array.isArray(v) ? v[0] : v;
  return INCOMPLETE_VIEWS.find((x) => x === s) ?? 'open';
}

/** The longest note a person leaves when marking one handled. */
export const HANDLED_NOTE_MAX = 300; // hardcode-ok: a field-length guard, not a business number
