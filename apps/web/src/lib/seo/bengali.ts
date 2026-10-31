// S11 · PR 588 (Blueprint C12.1) — the Bengali translation gate. A `/bn` page is listed by search engines, named in the
// sitemap and given hreflang only once its page key is in `language.bengali.readyPages` (lib/shop/meta, the sitemaps).
// This file:
// - the page keys are the ones the pages pass to `shopMetadata` (lib/seo/bengali-gate `bengaliPageKey`);
// - `bengaliCoverage`: every page that could be listed, whether its main content has Bengali text (a product's,
//   collection's or set's own Bengali name and description; pages made of the shop's words always do), and whether
//   it is marked ready — the "Bengali coverage" report of Website › SEO › Bengali pages;
// - `setBengaliReady`: marks pages ready or not (`seo.manage`, audited `seo.bengali.ready`). A page is marked ready
//   only when its Bengali text is there; nothing is marked or unmarked by itself.
// - the gate's own setting (`language.bengali.gate`: what a not-ready Bengali page shows), saved here too.
// Nothing here moves money, changes a price or touches an order or a customer.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { bengaliGateSchema, storeTarget, type BengaliGateSettings } from '@extas/settings';
import type { AppResolver } from '../settings';
import { ROUTES } from '../shop/routes';

const S = MOTHER_STORE_ID;
/** How many keys one change may carry (a page of the list). */
export const BENGALI_BATCH_MAX = 500; // hardcode-ok: a request-size guard, not a business number

export const BENGALI_KINDS = ['pages', 'collections', 'products', 'combos'] as const;
export type BengaliKind = (typeof BENGALI_KINDS)[number];
export const BENGALI_STATES = ['all', 'ready', 'waiting', 'missing'] as const;
export type BengaliState = (typeof BENGALI_STATES)[number];

const trim = (p: string) => p.replace(/^\/+|\/+$/g, '');

export interface BengaliRow {
  key: string;
  kind: BengaliKind;
  path: string;
  name: string;
  /** Its main content has Bengali text (true for pages made of the shop's own words). */
  hasBengali: boolean;
  /** What is missing when it has not: `name`, `description`, `intro`, `title`. */
  missing: string[];
  ready: boolean;
}

export interface BengaliCoverage {
  bengaliOn: boolean;
  rows: BengaliRow[];
  counts: { total: number; withBengali: number; ready: number; readyMissing: number; byKind: Record<BengaliKind, { total: number; ready: number }> };
  /** Keys marked ready whose page is not there any more (kept; they do nothing). */
  leftOver: string[];
  ready: { value: string[]; version: string };
  gate: { key: 'gate'; value: BengaliGateSettings; version: string };
}

export interface BengaliDeps {
  db: PrismaClient;
  resolver: AppResolver;
}
export interface BengaliWho {
  actor: Actor;
  ctx: RequestContext;
}

export class BengaliError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'NO_BENGALI' | 'NOT_FOUND',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isBengaliError = (e: unknown): e is BengaliError => e instanceof BengaliError;

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const has = (s: string | null | undefined) => Boolean(s && s.trim());
/** What is missing: the Bengali of each English text that is there. */
const gaps = (pairs: [string, string | null | undefined, string | null | undefined][]) => pairs.filter(([, en, bn]) => has(en) && !has(bn)).map(([k]) => k);

/** Every page that could be listed, with its Bengali state. */
export async function bengaliCoverage(deps: BengaliDeps, storeId: number = S): Promise<BengaliCoverage> {
  const at = { storeId };
  const [bengaliOn, ready, gate, prefix, landing, helpSet] = await Promise.all([
    deps.resolver.value('language.bengali.enabled', at),
    deps.resolver.value('language.bengali.readyPages', at),
    deps.resolver.value('language.bengali.gate', at),
    deps.resolver.value('naming.productPathPrefix', at),
    deps.resolver.value('combos.landing', at),
    deps.resolver.value('pages.help', at),
  ]);
  const isReady = new Set(ready);
  const rows: BengaliRow[] = [];
  const add = (kind: BengaliKind, key: string, path: string, name: string, missing: string[]) => rows.push({ key, kind, path, name, hasBengali: missing.length === 0, missing, ready: isReady.has(key) });

  // pages made of the shop's own words (both languages come from the dictionary and the owner's texts)
  add('pages', 'home', ROUTES.home, 'home', []);
  // the help pages that are on (their owner's texts are always written in both languages)
  for (const [slug, page] of Object.entries(helpSet.pages)) if (page.on) add('pages', `help-${slug}`, ROUTES.help(slug), `help.${slug}`, []);
  if (landing.on) add('pages', trim(ROUTES.combos), ROUTES.combos, 'combos', []);
  add('pages', trim(ROUTES.buildSet), ROUTES.buildSet, 'buildSet', []);

  const [cats, products, combos, rules] = await Promise.all([
    deps.db.category.findMany({ where: { storeId, isVisible: true, archivedAt: null }, select: { slug: true, nameEn: true, nameBn: true, introEn: true, introBn: true }, orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] }),
    deps.db.product.findMany({ where: { storeId, status: 'PUBLISHED', archivedAt: null }, select: { slug: true, nameEn: true, nameBn: true, descriptionEn: true, descriptionBn: true }, orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }] }),
    deps.db.combo.findMany({ where: { storeId, isFeatured: true, archivedAt: null, status: { not: 'DRAFT' } }, select: { slug: true, nameEn: true, nameBn: true, descriptionEn: true, descriptionBn: true }, orderBy: [{ sortRank: 'desc' }, { slug: 'asc' }] }),
    deps.db.comboAutoRule.findMany({ where: { storeId, archivedAt: null, status: { not: 'DRAFT' } }, select: { key: true, name: true, nameBn: true, titleEn: true, titleBn: true }, orderBy: { key: 'asc' } }),
  ]);
  for (const c of cats) add('collections', `collections/${c.slug}`, ROUTES.category(c.slug), c.nameEn, gaps([['name', c.nameEn, c.nameBn], ['intro', c.introEn, c.introBn]]));
  const newIn = ROUTES.newIn.split('/').pop()!;
  if (!cats.some((c) => c.slug === newIn)) add('collections', `collections/${newIn}`, ROUTES.newIn, 'newIn', []);
  const p = trim(prefix);
  for (const x of products) add('products', `${p}/${x.slug}`, `/${p}/${x.slug}`, x.nameEn, gaps([['name', x.nameEn, x.nameBn], ['description', x.descriptionEn, x.descriptionBn]]));
  for (const x of combos) add('combos', `combo/${x.slug}`, ROUTES.combo(x.slug), x.nameEn, gaps([['name', x.nameEn, x.nameBn], ['description', x.descriptionEn, x.descriptionBn]]));
  for (const r of rules) add('combos', `combos/${r.key}`, ROUTES.comboRule(r.key), r.name, gaps([['name', r.name, r.nameBn], ['title', r.titleEn, r.titleBn]]));

  const keys = new Set(rows.map((r) => r.key));
  const byKind = Object.fromEntries(BENGALI_KINDS.map((k) => [k, { total: 0, ready: 0 }])) as BengaliCoverage['counts']['byKind'];
  for (const r of rows) {
    byKind[r.kind].total += 1;
    if (r.ready) byKind[r.kind].ready += 1;
  }
  return {
    bengaliOn,
    rows,
    counts: { total: rows.length, withBengali: rows.filter((r) => r.hasBengali).length, ready: rows.filter((r) => r.ready).length, readyMissing: rows.filter((r) => r.ready && !r.hasBengali).length, byKind },
    leftOver: ready.filter((k) => !keys.has(k)),
    ready: { value: ready, version: versionOf(ready) },
    gate: { key: 'gate', value: gate, version: versionOf(gate) },
  };
}

/** The rows a view shows: one kind (or all) and one state. */
export function pickRows(rows: BengaliRow[], kind: BengaliKind | 'all', state: BengaliState): BengaliRow[] {
  return rows.filter((r) => (kind === 'all' || r.kind === kind) && (state === 'all' || (state === 'ready' ? r.ready : state === 'waiting' ? !r.ready && r.hasBengali : !r.hasBengali)));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Marks pages ready (only those with Bengali text) or not ready (`seo.manage`, audited). */
export async function setBengaliReady(deps: BengaliDeps, who: BengaliWho, input: unknown): Promise<BengaliCoverage> {
  await requirePermission(deps.db, who.actor, 'seo.manage', { storeId: S });
  if (!isObj(input) || typeof input.ready !== 'boolean' || !Array.isArray(input.keys) || !input.keys.length || input.keys.length > BENGALI_BATCH_MAX || !input.keys.every((k) => typeof k === 'string')) {
    throw new BengaliError('INVALID_INPUT', 400, ['keys']);
  }
  const cov = await bengaliCoverage(deps);
  if (input.version !== cov.ready.version) throw new BengaliError('STALE', 409);
  const wanted = [...new Set(input.keys as string[])];
  const byKey = new Map(cov.rows.map((r) => [r.key, r]));
  let next: string[];
  if (input.ready) {
    const unknown = wanted.filter((k) => !byKey.has(k));
    if (unknown.length) throw new BengaliError('NOT_FOUND', 404, unknown.slice(0, 20));
    const empty = wanted.filter((k) => !byKey.get(k)!.hasBengali);
    if (empty.length) throw new BengaliError('NO_BENGALI', 409, empty.slice(0, 20));
    next = [...cov.ready.value, ...wanted.filter((k) => !cov.ready.value.includes(k))];
  } else {
    next = cov.ready.value.filter((k) => !wanted.includes(k));
  }
  const added = next.filter((k) => !cov.ready.value.includes(k));
  const removed = cov.ready.value.filter((k) => !next.includes(k));
  if (added.length || removed.length) {
    await deps.resolver.set('language.bengali.readyPages', next, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › SEO › Bengali pages' });
    await audit(deps.db, who.actor, { storeId: S, action: 'seo.bengali.ready', entityType: 'Setting', entityId: 'language.bengali.readyPages', before: { count: cov.ready.value.length }, after: { count: next.length, added, removed } }, who.ctx);
  }
  return bengaliCoverage(deps);
}

/** The gate's choice for a not-ready page (`seo.manage`, audited). */
export async function saveBengaliGate(deps: BengaliDeps, who: BengaliWho, input: unknown): Promise<BengaliCoverage> {
  await requirePermission(deps.db, who.actor, 'seo.manage', { storeId: S });
  if (!isObj(input) || input.key !== 'gate') throw new BengaliError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('language.bengali.gate', { storeId: S });
  if (input.version !== versionOf(before)) throw new BengaliError('STALE', 409);
  const ok = bengaliGateSchema.safeParse(input.value);
  if (!ok.success) throw new BengaliError('INVALID_INPUT', 400, ['notReady']);
  if (ok.data.notReady !== before.notReady) {
    await deps.resolver.set('language.bengali.gate', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › SEO › Bengali pages' });
    await audit(deps.db, who.actor, { storeId: S, action: 'seo.bengali.gate', entityType: 'Setting', entityId: 'language.bengali.gate', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return bengaliCoverage(deps);
}
