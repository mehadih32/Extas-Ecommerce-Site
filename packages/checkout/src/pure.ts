// The checkout's pure rules, safe in client code (no database, no React): the order of the form's fields (PR 115,
// CN-012). Shared by the server page, the API and the client form; tested in pure.test.ts.
export type { CheckoutView, Totals } from './quote';

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
