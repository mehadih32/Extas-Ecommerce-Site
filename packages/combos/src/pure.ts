// @extas/combos/pure — the parts of the combo code with no database: safe in the browser (the admin's live numbers,
// the storefront's pickers). The model and price rule, the pair generator, set validation, the bag's set lines and
// the set photo's layout, and a rule's pairs as the category and pair pages read them (PR 572–574).
export * from './model';
export * from './tiers';
export * from './validate';
export * from './set-words';
export * from './summary-model';
export * from './photo-layout';
export * from './page-model';
export * from './builder-model';
export * from './rule-page-model';
