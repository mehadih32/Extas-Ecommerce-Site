// @extas/payments — the payments service of S07 (Blueprint B3; BACKEND-ARCHITECTURE §6.5.0, §6.5.3, §6.5.5, §7.5–7.7;
// register PR 165–174). It writes the payment dimension of an order — never its status (the order service moves that,
// @extas/orders) and never money out of the shop (refunds are PR 172's, with the owner's OK).
// - PR 165 the payment model: the rows' states and the moves between them, the money status, the order's amount due
//   and payment pill, the reason codes of every mismatch (pure.ts, also `@extas/payments/pure`); the one writer of a
//   payment's outcome onto its order (outcome.ts); money received outside the checkout recorded by permitted staff,
//   and one order's money for the payments screen (record.ts).
// - PR 166 Cash on Delivery after the door: the door outcomes with their money and reasons, the partial's approval, the
//   courier statement matched line by line with a reason code on every mismatch, cash in transit and days to settle
//   (cod.ts; the pure part, also for the screens, in cod-match.ts).
// - PR 170 payments through a gateway: start (the hosted session), the one callback receiver (signature, stored once,
//   the gateway's own answer), the sweep of open payments (recovered or abandoned) and the team's list of failed,
//   abandoned and waiting payments (gateway.ts). The gateways themselves are @extas/adapters' (PR 167).
// - S06 · PR 542 the pay link of an advance asked from the order (`/pay/<token>`): its page, the test page's answers,
//   "Try again" with the same token and "Pay" on a real gateway (advance-link.ts).
// - PR 171 the wallet: the one ledger writer (a credit, a debit, the balance after it; a correction is a new entry the
//   other way), a customer's wallet with its ledger, a person's own entry and reversal, the late-delivery apology
//   credit and its list of late orders (wallet.ts; the pure part, also for the screens, in wallet-pure.ts).
// - PR 172 refunds: asked by a person within the owner's rules, approved or rejected by someone with the "approve
//   refunds" permission, then completed — to the wallet through the ledger, or the way the money came by a person who
//   records the payout reference (the shop never sends money out by itself) — and the list with the money owed to
//   customers (refunds.ts; the pure part in refund-pure.ts).
// - PR 173 partial payment: a pre-order's advance asked on a Cash on Delivery order within the owner's cap, paid online
//   by the customer, the rest at the door; and the quote the order screen and the checkout show (advance.ts; the pure
//   part in advance-pure.ts).
export * from './context';
export * from './errors';
export * from './pure';
export * from './outcome';
export * from './record';
export * from './cod-match';
export * from './cod';
export * from './gateway';
export * from './advance-link';
export * from './wallet';
export * from './refunds';
export * from './advance';
