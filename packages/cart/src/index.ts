// @extas/cart — the bag of S04 (Blueprint D3.10, D3.11; register PR 105–114). The storefront's bag page, its API and
// the added-to-bag panel call these server functions; checkout (S05) reads the same bag.
// - PR 105 the bag and its lines: one open bag per visitor, kept for `bag.keepDays`; add with the repeat guard and the
//   duplicate rule, quantity, change colour or size in the bag, take out (archived, with Undo), save for later
//   (cart.ts).
// - PR 106–114 the bag as the shop draws it, priced by the rules and combos engines: lines and set lines, the order
//   summary, the code box with who may use a code and the better-offer reason (SIM-F-009), free-delivery progress,
//   the one offer slot and the tier ladder, the two-sizes groups and their order flags (SIM-F-036), the saved lines
//   (view.ts).
// - The pure rules behind them, safe in client code: size groups and flags, the ladder, the slot's choice, the panel's
//   fill rule and the code box's state (pure.ts, also `@extas/cart/pure`).
export * from './context';
export * from './pure';
export * from './cart';
export * from './view';
