// PR 407 — the invoice's number, without a database (the shop's invoice page and the issuing both use it).

/**
 * The invoice number from the order's (the owner's pattern, `account.invoice.number`): `{number}` is the order number
 * as it is, `{digits}` only its digits (EX-10042 → 10042; an order number with no digit keeps itself). An issued
 * invoice keeps the number it was given (packages/orders invoice.ts); this only makes the first one.
 */
export function invoiceNumberOf(pattern: string, orderNumber: string): string {
  const digits = orderNumber.replace(/\D+/g, '') || orderNumber;
  return pattern.replace(/\{number\}/g, orderNumber).replace(/\{digits\}/g, digits);
}
