// The checkout's pure rules, safe in client code (no database, no React): the order of the form's fields (PR 115,
// CN-012) and the form's checks (PR 116). Shared by the server page, the API and the client form, so the browser and
// the order placement judge a form the same way; tested in pure.test.ts.
import { phoneNormalizeBD, type PhoneBD } from '@extas/delivery/phone';
export type { CheckoutView, DeliveryCharge, DeliveryView, FreeReason, GiftView, Totals, WalletView } from './quote';
export type { CardType, CodOff, PaymentChoice, PaymentInput, PaymentView, RewardOffer, Wallet } from './payment';
export type { ConsentAnswer, ConsentInput } from './consent';
// PR 605: gift mode's checks and its advance (gift.ts, no zod: safe in the client bundle)
export * from './gift';

/** PR 120 — the payment step's methods, in the page's order. */
export const PAY_METHODS = ['cod', 'mobile', 'card', 'online'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export type { PlaceName } from './address';
export type { BandOut } from '@extas/delivery';
export { phoneNormalizeBD, type PhoneBD };

/** The three fields of "Delivery details", in the shop's own order. */
export const FIELDS = ['name', 'phone', 'address'] as const;
export type Field = (typeof FIELDS)[number];

/** The owner's field order (`checkout.fieldOrder`): known fields once each, in his order, then any he left out. */
export function fieldOrder(v: readonly string[] | null | undefined): Field[] {
  const out: Field[] = [];
  for (const k of v ?? []) if ((FIELDS as readonly string[]).includes(k) && !out.includes(k as Field)) out.push(k as Field);
  for (const k of FIELDS) if (!out.includes(k)) out.push(k);
  return out;
}

/** What "Delivery details" holds. */
export interface DetailsForm {
  name: string;
  phone: string;
  address: string;
}

/** The form's limits (settings `checkout.form.nameMin`, `checkout.form.addressMin`). */
export interface FormLimits {
  nameMin: number;
  addressMin: number;
}

/** Why a field is not done yet: empty, too short, or (the phone) not a Bangladeshi mobile number. */
export type FieldProblem = 'empty' | 'short' | 'phone';

export type FormCheck =
  | { ok: true; phone: Extract<PhoneBD, { ok: true }> }
  | { ok: false; field: Field; problem: FieldProblem; all: Partial<Record<Field, FieldProblem>> };

const letters = (s: string) => [...s.trim()].length;

/** One field's problem, or null when it is fine. */
export function fieldProblem(field: Field, form: DetailsForm, limits: FormLimits): FieldProblem | null {
  if (field === 'phone') {
    const p = phoneNormalizeBD(form.phone);
    return p.ok ? null : p.empty ? 'empty' : 'phone';
  }
  const v = field === 'name' ? form.name : form.address;
  const min = field === 'name' ? limits.nameMin : limits.addressMin;
  if (!v.trim()) return 'empty';
  return letters(v) < min ? 'short' : null;
}

/** The whole form: the first field (in the owner's order) still to fill in, or the cleaned phone when all is done. */
export function checkForm(form: DetailsForm, limits: FormLimits, order: readonly string[] = FIELDS): FormCheck {
  const fields = fieldOrder(order);
  const all: Partial<Record<Field, FieldProblem>> = {};
  for (const f of fields) {
    const p = fieldProblem(f, form, limits);
    if (p) all[f] = p;
  }
  const first = fields.find((f) => all[f]);
  if (first) return { ok: false, field: first, problem: all[first]!, all };
  const phone = phoneNormalizeBD(form.phone);
  return phone.ok ? { ok: true, phone } : { ok: false, field: 'phone', problem: 'phone', all: { phone: 'phone' } };
}

const BN_ZERO = 0x09e6;

/** Bengali digits typed into the phone box become 0-9 as they are typed (the rest of what he typed stays). */
export const latinDigits = (s: string): string => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - BN_ZERO));
