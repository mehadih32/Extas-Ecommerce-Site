// @extas/accounts — the customer accounts of S04 (Blueprint D3.13–D3.15; register PR 129–137). The storefront's account
// pages, their API, the checkout and the thank-you page call these server functions; the customer's sign-in sessions
// are @extas/auth's (PR 15), kept apart from the staff's.
// - PR 129 the account made with the first order, never with a guessable password (identity.ts, SIM-F-039).
// - PR 130 the one-time SMS code with its limits (codes.ts), signing in by code or by a password the customer set, the
//   code on a new device, logging out and setting a password (login.ts); follow-up 18.
// - PR 131 My account: the header's figures, the order cards and the wallet (dashboard.ts), Profile with its addresses
//   and the marketing consent (profile.ts), the tracking steps read from the stored order (pure.ts, also "./pure").
// - PR 132 the offer banner: the real wallet balance and the owner's offers whose coupon really works (offers.ts).
export * from './context';
export * from './identity';
export * from './codes';
export * from './login';
export * from './pure';
export * from './dashboard';
export * from './profile';
export * from './offers';
