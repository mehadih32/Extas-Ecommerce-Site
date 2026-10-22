// @extas/combos — combos and sets, the shop's biggest-selling section (S03, Sawdagor; Blueprint S03, demo
// #/admin/combos, #/combos, #/combo, #/set). What it is for:
//   - the combo model (PR 89): a set of pieces sold together for one set price, with its saving and its active window;
//     fixed combos made by hand and the owner's auto colour-pair combos (PR 571: bind a category or products, 2 or 3
//     pieces, every colour pair becomes its own combo with its own link, which never dies);
//   - the admin services behind /admin/combos (PR 90): make, change, switch on and off, archive (never delete);
//   - set tiers read from Smart Rules (PR 99: "any 2 for X, any 3 for Y" lives in one place, the rules);
//   - set validation (PR 101), the set summary with price and saving (PR 96) and adding a set to the bag as one set
//     with its price locked (PR 97) — the server functions the storefront and the S04 bag call;
//   - the set photo composed from the piece photos with sharp (PR 575) and combo analytics (PR 104).
// The price rule is one decision everywhere (model.ts `setPricing`): never above the regular total, and the struck
// "was" price is only ever the sum of the pieces' own prices (CN-009), behind the owner's switch. Set prices are the
// owner's data: the repository ships sample combos for the sample store only (CLAUDE.md rule 4).
export * from './pure';
export * from './errors';
export * from './context';
export * from './facts';
export * from './combos-service';
export * from './options';
export * from './generate';
export * from './auto-rules';
export * from './set-tiers';
export * from './set-check';
export * from './summary';
export * from './bag';
export * from './set-photo';
export * from './analytics';
