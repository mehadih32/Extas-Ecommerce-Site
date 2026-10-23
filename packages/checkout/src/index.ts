// @extas/checkout — the checkout of S04 (Blueprint D3.12–D3.14; register PR 115–126). The storefront's checkout page,
// its API and the thank-you page call these server functions; the bag itself is @extas/cart's.
// - PR 115 the page's quote: the bag, the totals and the fingerprint of the money shown (quote.ts); the field order
//   (pure.ts, also `@extas/checkout/pure`).
// - PR 117 the address read with the national gazetteer of S06, longest name first, the district settling it
//   (address.ts); the quote carries the place and band found, or the question to ask.
// - PR 120 the payment choice and the prepaid reward (payment.ts); PR 123 the marketing ticks (consent.ts).
// - PR 125 placing the order, idempotent, with the stock hold, the mock payment's failure path and the unfinished
//   checkout kept for follow-up (place.ts).
export * from './context';
export * from './address';
export * from './pure';
export * from './quote';
export * from './payment';
export * from './consent';
export * from './place';
