// PR 72 — the indexer the background worker runs (`search.index`, packages/jobs): it brings a store's Meilisearch index
// to the catalogue's version. Idempotent: a version already indexed is "unchanged" and nothing is sent; a run cut off
// halfway is simply run again (documents are replaced by id, the leftovers of older versions are deleted by filter,
// and the version is written last). Without Meilisearch, or with `search.engine.mode` 'postgres', it does nothing.
//
// The index is set up with the shop's rules: the name weighs most, then the category, the colours and the rest;
// `kind` and the version can be filtered; the owner's order breaks ties; one slip from `search.match.oneTypoAt`
// letters, two from `twoTyposAt`; the start of a word finds it when `prefix` is on; the synonyms are the word lists'.
import type { DocText } from './docs';
import { catalogueVersion, readDocTexts } from './docs';
import { metaIndex, productIndex, readRules, versionRules, type SearchDeps, type SearchRules } from './engine';
import { wordLists } from './match';
import { Meili } from './meili';
import { norm } from './text';

export type IndexResult =
  | { status: 'skipped'; reason: 'no-server' | 'postgres-mode' }
  | { status: 'unchanged'; version: string }
  | { status: 'indexed'; version: string; products: number; categories: number };

/** Meilisearch's settings for an index, from the shop's rules. */
export function indexSettings(rules: SearchRules): Record<string, unknown> {
  const lists = wordLists(rules.words);
  const synonyms: Record<string, string[]> = {};
  for (const [w, alts] of lists.synonyms) synonyms[w] = alts;
  return {
    searchableAttributes: ['nameEn', 'nameBn', 'category', 'colours', 'more'],
    filterableAttributes: ['kind', 'v'],
    sortableAttributes: [],
    displayedAttributes: ['id', 'kind'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness', 'rank:desc'],
    synonyms,
    typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: rules.match.oneTypoAt, twoTypos: rules.match.twoTyposAt } },
    prefixSearch: rules.match.prefix ? 'indexingTime' : 'disabled',
  };
}

/** One document as Meilisearch stores it (its texts as search reads them, the version it belongs to). */
export function indexDoc(t: DocText, v: string): Record<string, unknown> {
  return { id: t.id, kind: t.kind, nameEn: norm(t.nameEn), nameBn: norm(t.nameBn), category: norm(t.category), colours: norm(t.colours), more: norm(t.more), rank: t.rank, v };
}

/** The version of the store's index now (null: never indexed, or no index). */
export async function indexedVersion(m: Meili, prefix: string, storeId: number): Promise<string | null> {
  const meta = await m.getDocument<{ v?: string }>(metaIndex(prefix), storeId);
  return typeof meta?.v === 'string' ? meta.v : null;
}

export async function indexStore(deps: SearchDeps, storeId: number): Promise<IndexResult> {
  const rules = await readRules(deps.settings, storeId);
  if (!deps.meili) return { status: 'skipped', reason: 'no-server' };
  if (rules.engine.mode !== 'auto') return { status: 'skipped', reason: 'postgres-mode' };
  const m = new Meili(deps.meili, rules.engine.timeoutMs * 10);
  const waitMs = rules.engine.taskWaitSeconds * 1000;
  const prefix = rules.engine.indexPrefix;
  const version = await catalogueVersion(deps.db, storeId, versionRules(rules));
  if ((await indexedVersion(m, prefix, storeId)) === version) return { status: 'unchanged', version };

  const index = productIndex(prefix, storeId);
  const meta = metaIndex(prefix);
  await m.waitTask(await m.createIndex(index, 'id'), waitMs, ['index_already_exists']);
  await m.waitTask(await m.createIndex(meta, 'id'), waitMs, ['index_already_exists']);
  await m.waitTask(await m.updateSettings(index, indexSettings(rules)), waitMs);
  await m.waitTask(await m.updateSettings(meta, { filterableAttributes: [], searchableAttributes: ['id'] }), waitMs);

  const texts = await readDocTexts(deps.db, storeId);
  for (let i = 0; i < texts.length; i += rules.engine.batchSize) {
    const batch = texts.slice(i, i + rules.engine.batchSize).map((t) => indexDoc(t, version));
    await m.waitTask(await m.addDocuments(index, batch), waitMs);
  }
  // what an older version had and this one does not (unpublished, archived, hidden): out
  await m.waitTask(await m.deleteByFilter(index, `v != "${version}"`), waitMs);
  await m.waitTask(await m.addDocuments(meta, [{ id: storeId, v: version }]), waitMs);
  return { status: 'indexed', version, products: texts.filter((t) => t.kind === 'product').length, categories: texts.filter((t) => t.kind === 'category').length };
}

/** Whether a store's index is behind the catalogue (the worker's planner asks this on every tick). */
export async function indexBehind(deps: SearchDeps, storeId: number): Promise<{ behind: boolean; version: string } | null> {
  if (!deps.meili) return null;
  const rules = await readRules(deps.settings, storeId);
  if (rules.engine.mode !== 'auto') return null;
  const version = await catalogueVersion(deps.db, storeId, versionRules(rules));
  const m = new Meili(deps.meili, rules.engine.timeoutMs * 10);
  return { behind: (await indexedVersion(m, rules.engine.indexPrefix, storeId)) !== version, version };
}
