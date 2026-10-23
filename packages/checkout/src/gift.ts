// PR 605 (CN-014 h, CN-020 (2), SIM-F-007) — gift mode's pure rules, safe in client code: what the gift card sends,
// its checks (the page and the order placement judge it the same way), the "deliver on or after" date window in the
// store's time zone, and how much of a gift is paid ahead (`checkout.gift.advance`). The receiver is the order's own
// name, phone and address (checked by checkForm like any order: a Bangladeshi phone); the sender's contact may be a
// phone of any country or an e-mail, used only for the order's updates and never as a trust signal. No zod here: the
// client bundle stays small.
/** What the page sends with a gift order (the schema is the server's: place.ts `giftInputSchema`). */
export interface GiftInput {
  senderName: string;
  senderContact: string;
  note?: string | null;
  /** YYYY-MM-DD in the store's time zone, or none. */
  deliverAfter?: string | null;
  hidePrices?: boolean;
}

/** The gift's own boxes. */
export const GIFT_FIELDS = ['senderName', 'senderContact', 'note', 'deliverAfter'] as const;
export type GiftField = (typeof GIFT_FIELDS)[number];
export type GiftProblem = 'empty' | 'short' | 'contact' | 'long' | 'date';

/** The limits the gift card is checked with (from `checkout.gift`, and the form's own name minimum). */
export interface GiftLimits {
  nameMin: number;
  noteMax: number;
  maxDays: number;
}

export interface GiftValue {
  senderName: string;
  /** "+8801712345678" style for a phone (digits and a leading +), or the e-mail in lower case. */
  senderContact: string;
  note: string | null;
  deliverAfter: string | null;
  hidePrices: boolean;
}

export type GiftCheck = { ok: true; gift: GiftValue } | { ok: false; field: GiftField; problem: GiftProblem };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** E.164 allows 15 digits; a national number has at least 7. */
const PHONE_MIN = 7;
const PHONE_MAX = 15;

/** A phone of any country ("+44 7700 900123", "01712-345678") as digits with its +, or null. */
export function intlPhone(v: string): string | null {
  const t = v.trim();
  if (!/^\+?[\d\s().-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, '');
  if (digits.length < PHONE_MIN || digits.length > PHONE_MAX) return null;
  return t.startsWith('+') ? `+${digits}` : digits;
}

/** The sender's contact, cleaned: an e-mail (lower case) or a phone of any country; null when it is neither. */
export function senderContactOf(v: string): string | null {
  const t = v.trim();
  if (EMAIL.test(t)) return t.toLowerCase();
  return intlPhone(t);
}

/** Today in the store's time zone, as YYYY-MM-DD. */
export function storeToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** A YYYY-MM-DD date `days` later. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The dates "deliver on or after" may take: from tomorrow up to `maxDays` ahead (null: the date box is off). */
export function giftDateWindow(today: string, maxDays: number): { min: string; max: string } | null {
  return maxDays > 0 ? { min: addDays(today, 1), max: addDays(today, maxDays) } : null;
}

/** The gift card's checks, in the page's order; the first problem is the one the page asks about. */
export function checkGift(input: GiftInput, limits: GiftLimits, today: string, hidePricesDefault: boolean): GiftCheck {
  const name = input.senderName.trim();
  if (!name) return { ok: false, field: 'senderName', problem: 'empty' };
  if ([...name].length < limits.nameMin) return { ok: false, field: 'senderName', problem: 'short' };
  if (!input.senderContact.trim()) return { ok: false, field: 'senderContact', problem: 'empty' };
  const contact = senderContactOf(input.senderContact);
  if (!contact) return { ok: false, field: 'senderContact', problem: 'contact' };
  const note = limits.noteMax > 0 ? (input.note ?? '').trim() : '';
  if ([...note].length > limits.noteMax) return { ok: false, field: 'note', problem: 'long' };
  const window = giftDateWindow(today, limits.maxDays);
  const day = window ? (input.deliverAfter ?? '').trim() : '';
  if (day && (!DATE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || day < window!.min || day > window!.max)) return { ok: false, field: 'deliverAfter', problem: 'date' };
  return { ok: true, gift: { senderName: name, senderContact: contact, note: note || null, deliverAfter: day || null, hidePrices: input.hidePrices ?? hidePricesDefault } };
}

/** The gift's advance setting (`checkout.gift.advance`). */
export interface GiftAdvance {
  required: boolean;
  type: 'full' | 'fixed' | 'percent';
  amountMinor: number | null;
  percent: number | null;
}

/**
 * How a gift is paid: `full` — the whole amount ahead, through the payment step (Cash on Delivery not offered);
 * `part` — this much ahead and the rest at the door (the team collects the part until S07's part payment); `none` — as
 * any order. A part the owner left without its number, or one as big as the order, is the whole amount ahead.
 */
export function giftAdvanceOf(a: GiftAdvance, dueMinor: number): { kind: 'none' } | { kind: 'full' } | { kind: 'part'; amountMinor: number } {
  if (!a.required) return { kind: 'none' };
  const part = a.type === 'fixed' ? a.amountMinor : a.type === 'percent' && a.percent ? Math.ceil((dueMinor * a.percent) / 100) : null;
  if (a.type === 'full' || !part || part >= dueMinor) return { kind: 'full' };
  return { kind: 'part', amountMinor: part };
}
