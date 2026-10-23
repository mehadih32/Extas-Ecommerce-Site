// PR 72 — the search index job's names and its planner (the job itself is in catalogue.ts with the others). The web
// app has no queue client, so a change to the catalogue reaches the worker this way: on every tick the leader compares
// each store's catalogue version (packages/search docs.ts: the newest product, category and colour change, their
// counts, the word lists) with the version Meilisearch holds;
// a store that is behind gets one `search.index` job whose run key is that version. Planned on many ticks, it is added
// once (the queue job id), run once (the run-level idempotency, runs.ts), and the indexer itself does nothing for a
// version it already holds. Without Meilisearch, or with `search.engine.mode` 'postgres', nothing is planned: the shop
// searches PostgreSQL (packages/search engine.ts).
import { indexBehind } from '@extas/search';
import type { JobDeps } from './context';
import type { Planner } from './worker';

export const SEARCH_INDEX_JOB = 'search.index';
export const SEARCH_QUEUE = 'search';

/** The search package's dependencies from the worker's. */
export const searchDeps = (deps: JobDeps) => ({ db: deps.db, settings: deps.settings, meili: deps.search?.meili ?? null });

/** The run key of one store's version: `search.index/<store>/<version>` (no colon: the queue refuses one). */
export const searchRunKey = (storeId: number, version: string): string => `${SEARCH_INDEX_JOB}/${storeId}/${version.replace(/[^a-z0-9.-]/gi, '')}`;

/** Each store whose search index is behind its catalogue: one job, keyed by the version it should reach. */
export const searchPlanner: Planner = async (deps) => {
  if (!deps.search?.meili) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' } }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const b = await indexBehind(searchDeps(deps), s.id);
    if (b?.behind) out.push({ queue: SEARCH_QUEUE, name: SEARCH_INDEX_JOB, payload: { storeId: s.id, version: b.version }, key: searchRunKey(s.id, b.version) });
  }
  return out;
};
