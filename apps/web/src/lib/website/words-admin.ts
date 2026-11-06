// S02 · PR 78 (BACKEND-ARCHITECTURE WEB-05 Words & language) — Website › Words & language, the server side: one page of
// the shop's words with the owner's own text (`language.labels`) and the version they were read at; saving a change to
// some words (the editor's row, or an imported CSV); and the CSV export of every word. A save is checked word by word
// (lib/website/words.ts), refused when someone saved the words in between (STALE, also a save from Orders › Invoices,
// which keeps its words in the same setting), and audited (`website.words.save`, before and after of the changed words
// only). Seeing needs `website.read`, saving `website.words.write`. Nothing here touches a price, an order or a customer.
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { CsvSyntaxError, parseCsv, uncell, writeCsv } from '@extas/catalogue';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { LabelOverrides } from '../shop/dict';
import { applyWords, isWordShow, patchFromCsv, WORD_CSV_HEADER, wordCsvRows, wordList, type WordList, type WordPatch, type WordQuery } from './words';

const S = MOTHER_STORE_ID;
/** Words on one page of the list. */
export const WORDS_PAGE_SIZE = 40;

export class WordsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: (string | number)[],
  ) {
    super(code);
  }
}

export interface WordsDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
}

export interface WordsWho {
  actor: Actor;
  ctx: RequestContext;
}

export type WordsView = WordList & { version: string };

/** The same words give the same version whatever order the database keeps their keys in (jsonb sorts them its way). */
const canonical = (v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(canonical(v ?? null))).digest('hex').slice(0, 16);

async function labelsOf(deps: WordsDeps): Promise<LabelOverrides | null> {
  return ((await deps.resolver.value('language.labels', { storeId: S })) ?? null) as LabelOverrides | null;
}

/** The query from a page's or the API's search parameters. */
export function wordQueryOf(sp: { get(name: string): string | null }): WordQuery {
  const show = sp.get('show');
  return { q: (sp.get('q') ?? '').slice(0, 120), group: sp.get('where') ?? '', show: isWordShow(show) ? show : 'all', p: Number(sp.get('p') ?? 1) };
}

/** One page of the words with the version they were read at. */
export async function wordsView(deps: WordsDeps, query: WordQuery): Promise<WordsView> {
  const labels = await labelsOf(deps);
  return { ...wordList(labels, query, WORDS_PAGE_SIZE), version: versionOf(labels) };
}

/** Every word as CSV (key, where, the shop's English and Bengali, the owner's English and Bengali). */
export async function wordsCsv(deps: WordsDeps): Promise<string> {
  return writeCsv(WORD_CSV_HEADER, wordCsvRows(await labelsOf(deps)), ',');
}

/**
 * PUT {version, words: {key: {en?, bn?}}} or {version, csv}: saves the change. Every word is checked first; one bad word
 * refuses the whole save (nothing half-saved). Answers the saved rows' new state and the new version.
 */
export async function saveWords(deps: WordsDeps, who: WordsWho, input: unknown): Promise<{ version: string; changed: string[]; saved: LabelOverrides }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (typeof o.version !== 'string') throw new WordsError('INVALID_INPUT', 400, ['version']);
  let patch: WordPatch;
  if (typeof o.csv === 'string') {
    let records: string[][];
    try {
      records = parseCsv(o.csv, ',');
    } catch (e) {
      if (e instanceof CsvSyntaxError) throw new WordsError('CSV_SYNTAX', 400, [e.line]);
      throw e;
    }
    const read = patchFromCsv(records, uncell);
    if (read.missing.length) throw new WordsError('CSV_COLUMNS', 400, read.missing);
    if (read.bad.length) throw new WordsError('CSV_KEYS', 400, read.bad.slice(0, 20));
    patch = read.patch;
  } else if (o.words && typeof o.words === 'object' && !Array.isArray(o.words)) {
    patch = o.words as WordPatch;
  } else throw new WordsError('INVALID_INPUT', 400, ['words']);
  const before = await labelsOf(deps);
  if (o.version !== versionOf(before)) throw new WordsError('STALE', 409);
  const r = applyWords(before, patch);
  if (r.bad.length) throw new WordsError('INVALID_INPUT', 400, r.bad.slice(0, 20));
  if (r.changed.length) {
    await deps.resolver.set('language.labels', r.next as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Words & language' });
    const pick = (l: LabelOverrides | null) => Object.fromEntries(r.changed.map((k) => [k, l?.[k] ?? null]));
    await audit(deps.db, who.actor, { storeId: S, action: 'website.words.save', entityType: 'Setting', entityId: 'language.labels', before: pick(before), after: pick(r.next) }, who.ctx);
  }
  return { version: versionOf(r.next), changed: r.changed, saved: Object.fromEntries(Object.keys(patch).map((k) => [k, r.next?.[k] ?? {}])) };
}

const answer = (e: unknown): Response => (e instanceof WordsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/website/dictionary — GET ?q=&where=&show=&p= (or ?format=csv) (`website.read`); PUT a change (`website.words.write`). */
export async function dictionaryHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.words.write', storeId: S });
  if (g instanceof Response) return g;
  const d: WordsDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    if (method === 'GET') {
      const sp = new URL(request.url).searchParams;
      if (sp.get('format') === 'csv')
        return new Response(await wordsCsv(d), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="shop-words.csv"', 'cache-control': 'no-store' } });
      return json({ ok: true, ...(await wordsView(d, wordQueryOf(sp))) });
    }
    return json({ ok: true, ...(await saveWords(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return answer(e);
  }
}
