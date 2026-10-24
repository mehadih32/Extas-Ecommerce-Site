// PR 606 (CN-017 SIM-F-023; Blueprint B8.5 item 4) — the bulk / corporate lane's pure rules, safe in client code: what
// the enquiry form sends, its checks (the page and the server judge it the same way, the phone through the one helper
// phoneNormalizeBD), and when the bag shows "Ordering for a company or a team?" — at the owner's number of pieces, or
// when a line has reached the stock that can be sold now (the bag used to stop there silently: 40 polos became 4).
// No zod here: the client bundle stays small. Nothing here prices anything.
import { phoneNormalizeBD } from '@extas/delivery/phone';

/** Where the enquiry was started. */
export const BULK_SOURCES = ['bag', 'menu', 'page'] as const;
export type BulkSource = (typeof BULK_SOURCES)[number];

/** The team's own stages of an enquiry (the quote flow of ORD-09 adds its steps later). */
export const BULK_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

/** What the enquiry form sends (the server's schema is bulk-service.ts `bulkInputSchema`). */
export interface BulkInput {
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  /** What he wants, in his own words (the bag's lines go with it when he came from the bag). */
  itemsText?: string | null;
  quantity: number | string;
  logo?: boolean;
  /** YYYY-MM-DD, or none. */
  neededBy?: string | null;
  note?: string | null;
}

/** The longest a name, company or "what you need" may be (a guard against pasted pages, not a business limit). */
export const BULK_TEXT_MAX = 2_000;

export const BULK_FIELDS = ['name', 'phone', 'email', 'company', 'itemsText', 'quantity', 'neededBy', 'note'] as const;
export type BulkField = (typeof BULK_FIELDS)[number];
export type BulkProblem = 'empty' | 'short' | 'phone' | 'email' | 'long' | 'few' | 'many' | 'date';

/** The limits the form is checked with (from `orders.bulkLane`, the form's own name minimum and the text maximum). */
export interface BulkLimits {
  nameMin: number;
  textMax: number;
  noteMax: number;
  minQuantity: number | null;
  maxQuantity: number;
  /** Today in the store's time zone (YYYY-MM-DD): a "needed by" date is today or later. */
  today: string;
  /** He came from the bag with its lines, so "what you want" may stay empty. */
  hasBagLines: boolean;
}

export interface BulkValue {
  name: string;
  /** +8801712345678 */
  phone: string;
  email: string | null;
  company: string | null;
  itemsText: string | null;
  quantity: number;
  logo: boolean;
  neededBy: string | null;
  note: string | null;
}

export type BulkCheck = { ok: true; value: BulkValue } | { ok: false; field: BulkField; problem: BulkProblem };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ASCII = (s: string) => s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The quantity he typed, Bengali digits too; NaN when it is not a whole number. */
export function bulkQuantity(v: unknown): number {
  const s = ASCII(String(v ?? '').trim()).replace(/[,\s]/g, '');
  return /^\d{1,9}$/.test(s) ? Number(s) : Number.NaN;
}

/** The enquiry form's checks, field by field in the form's order: the first problem is the one named. */
export function checkBulk(input: BulkInput, l: BulkLimits): BulkCheck {
  const name = clean(input.name);
  if (!name) return { ok: false, field: 'name', problem: 'empty' };
  if (name.length < l.nameMin) return { ok: false, field: 'name', problem: 'short' };
  if (name.length > l.textMax) return { ok: false, field: 'name', problem: 'long' };
  const phone = phoneNormalizeBD(input.phone);
  if (!phone.ok) return { ok: false, field: 'phone', problem: phone.empty ? 'empty' : 'phone' };
  const email = clean(input.email).toLowerCase();
  if (email && (!EMAIL.test(email) || email.length > 254)) return { ok: false, field: 'email', problem: 'email' };
  const company = clean(input.company);
  if (company.length > l.textMax) return { ok: false, field: 'company', problem: 'long' };
  const itemsText = clean(input.itemsText);
  if (!itemsText && !l.hasBagLines) return { ok: false, field: 'itemsText', problem: 'empty' };
  if (itemsText.length > l.textMax) return { ok: false, field: 'itemsText', problem: 'long' };
  const quantity = bulkQuantity(input.quantity);
  if (Number.isNaN(quantity) || quantity < 1) return { ok: false, field: 'quantity', problem: String(input.quantity ?? '').trim() ? 'few' : 'empty' };
  if (l.minQuantity !== null && quantity < l.minQuantity) return { ok: false, field: 'quantity', problem: 'few' };
  if (quantity > l.maxQuantity) return { ok: false, field: 'quantity', problem: 'many' };
  const neededBy = clean(input.neededBy);
  if (neededBy && (!DAY.test(neededBy) || Number.isNaN(Date.parse(`${neededBy}T00:00:00Z`)) || neededBy < l.today)) return { ok: false, field: 'neededBy', problem: 'date' };
  const note = clean(input.note);
  if (note.length > l.noteMax) return { ok: false, field: 'note', problem: 'long' };
  return {
    ok: true,
    value: {
      name,
      phone: phone.e164,
      email: email || null,
      company: company || null,
      itemsText: itemsText || null,
      quantity,
      logo: input.logo === true,
      neededBy: neededBy || null,
      note: note || null,
    },
  };
}

/** The bag's lines as the enquiry needs them (what the bag view gives each item). */
export interface BulkBagLine {
  quantity: number;
  maxQuantity: number;
}

/**
 * Why the bag shows the bulk card, or null: `count` at the owner's number of pieces or more, `stock` when a line has
 * reached the stock that can be sold now (he cannot add more, and a team would want more). Off: never.
 */
export function bulkCardReason(lane: { enabled: boolean; bag: { atPieces: number | null; atStockLimit: boolean } }, pieces: number, lines: readonly BulkBagLine[]): 'count' | 'stock' | null {
  if (!lane.enabled) return null;
  if (lane.bag.atPieces !== null && pieces >= lane.bag.atPieces) return 'count';
  if (lane.bag.atStockLimit && lines.some((l) => l.quantity > 0 && l.quantity >= l.maxQuantity)) return 'stock';
  return null;
}
