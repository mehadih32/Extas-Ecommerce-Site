// @extas/accounts — the customer accounts of S04 (Blueprint D3.13–D3.15; register PR 129–137). The storefront's account
// pages, their API, the checkout and the thank-you page call these server functions; the customer's sign-in sessions
// are @extas/auth's (PR 15), kept apart from the staff's.
// - PR 129 the account made with the first order, never with a guessable password (identity.ts, SIM-F-039).
export * from './context';
export * from './identity';
