// @extas/checkout — the checkout of S04 (Blueprint D3.12–D3.14; register PR 115–126). The storefront's checkout page,
// its API and the thank-you page call these server functions; the bag itself is @extas/cart's.
// - PR 115 the page's quote: the bag, the totals and the fingerprint of the money shown (quote.ts); the field order
//   (pure.ts, also `@extas/checkout/pure`).
// - PR 117 the address read with the national gazetteer of S06, longest name first, the district settling it
//   (address.ts); the quote carries the place and band found, or the question to ask.
// - PR 120 the payment choice and the prepaid reward (payment.ts); PR 123 the marketing ticks (consent.ts).
// - PR 125 placing the order, idempotent, with the stock hold, the mock payment's failure path and the unfinished
//   checkout kept for follow-up (place.ts).
// - PR 126 the thank-you page's receipt, for the browser that placed the order only (receipt.ts).
// - PR 605 gift mode: the gift card's checks and the advance (gift.ts, via pure.ts), the gift order (place.ts) and its
//   receipt (receipt.ts).
// - PR 606 the bulk / corporate lane: the enquiry form's checks and the bag's card (bulk.ts, via pure.ts), the enquiry
//   and the team's list of them (bulk-service.ts).
export * from './context';
export * from './address';
export * from './pure';
export * from './quote';
export * from './payment';
export * from './consent';
export * from './place';
export * from './receipt';
export * from './advance';
export * from './bulk-service';
// CN-020 (4) — the voice address: a recording of the address, its words and how sure the reading was.
export * from './voice';
