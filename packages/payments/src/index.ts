// @extas/payments — the payments service of S07 (Blueprint B3; BACKEND-ARCHITECTURE §6.5.0, §6.5.3, §6.5.5, §7.5–7.7;
// register PR 165–174). It writes the payment dimension of an order — never its status (the order service moves that,
// @extas/orders) and never money out of the shop (refunds are PR 172's, with the owner's OK).
// - PR 165 the payment model: the rows' states and the moves between them, the money status, the order's amount due
//   and payment pill, the reason codes of every mismatch (pure.ts, also `@extas/payments/pure`); the one writer of a
//   payment's outcome onto its order (outcome.ts); money received outside the checkout recorded by permitted staff,
//   and one order's money for the payments screen (record.ts).
export * from './context';
export * from './errors';
export * from './pure';
export * from './outcome';
export * from './record';
