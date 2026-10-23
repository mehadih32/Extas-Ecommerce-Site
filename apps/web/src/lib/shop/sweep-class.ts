// PR 86 — the one way a word gets the house sweep (`.sweep`, drawn by pdp.css; switched in `pdp.sweep` and stopped
// by `shop.sweep`, lib/shop/sweep.ts). Kept apart from sweep.ts so the product page's small client parts import no
// settings code.

/** The class that gives a word its sweep, with its leading space, or nothing. */
export const sweepClass = (on: boolean): string => (on ? ' sweep' : '');
