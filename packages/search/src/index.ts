// @extas/search — storefront search, S02 · PR 72 (the index across products, categories and help pages; prefix,
// typo and synonym matching; Bengali keywords) and the engine under PR 73's results page:
// - text.ts     how search reads words (lower case, Bengali letters and digits, hyphens) and counts slips;
// - match.ts    the matcher (phrases, prefix, slips, other words, singulars, general words), "did you mean" and
//               "what some of the words find" — what PostgreSQL runs and what Meilisearch is set up to do;
// - help.ts     the help pages a query finds, by their words (follow-up 73);
// - docs.ts     what search can find, read from the catalogue, and the catalogue's version;
// - meili.ts    a small Meilisearch client (MEILI_URL / MEILI_MASTER_KEY from the server's environment);
// - engine.ts   the adapter: Meilisearch when it is there and current, else PostgreSQL, same answers;
// - indexer.ts  what the background worker runs (`search.index`): one version indexed once.
// Settings: `search.*` (packages/settings registry-search.ts, registry v24).
export * from './text';
export * from './match';
export * from './help';
export * from './docs';
export * from './meili';
export * from './engine';
export * from './indexer';
