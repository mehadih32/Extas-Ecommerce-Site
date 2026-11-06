// S13 · PR 569 (register "Geography-led ad guidance: the shop knows where parcels are actually delivered and paid for,
// district by district … The platforms cannot work this out themselves — they see orders, not outcomes") — Marketing ›
// Where to advertise on the database.
//
// - The figures are the Sales by area figure (@extas/metrics `salesByArea`, PR 568) by district over the last
//   `ads.geoGuide.days` shop days, for the whole shop or one category (with its sub-categories): delivered and
//   returned orders, the return rate, and Sales (delivered only) for those who may see money (`books.read`).
// - With `ads.geoGuide.on` each district gets its word (geo-guide-model.ts) and the page lists the "more" and "less"
//   districts as one line each, to copy into an ad platform's location targeting by hand.
// - Advice only: nothing here changes a budget, a campaign, an audience or a target (hard rule 6). Seeing needs
//   `marketing.campaigns.read`; the card `marketing.campaigns.write` (audited).
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { lastDays, salesByArea } from '@extas/metrics';
import { geoGuideSchema, storeTarget, type GeoGuideSettings } from '@extas/settings';
import { body as readBody, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { JournalError, answer, versionOf, type JournalWho } from '../journal/journal';
import { issuesOf } from '../journal/model';
import { copyLine, returnPct, wordOf, type GeoWord } from './geo-guide-model';

const S = MOTHER_STORE_ID;
const KEY = 'ads.geoGuide';
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];

export interface GeoRow {
  areaId: string;
  nameEn: string;
  nameBn: string | null;
  delivered: number;
  returned: number;
  returnPct: number | null;
  /** Sales of the delivered orders (minor units); null without `books.read`. */
  salesMinor: number | null;
  /** The word, null while the guidance is off. */
  word: GeoWord | null;
}

export interface GeoScreen {
  from: string;
  to: string;
  timeZone: string;
  categoryId: string | null;
  categories: { id: string; nameEn: string; nameBn: string | null }[];
  rows: GeoRow[];
  /** Orders with no district on their delivery area. */
  unknown: { delivered: number; returned: number };
  counts: Record<GeoWord, number>;
  /** The lines to copy (English and Bengali names), empty while off. */
  copy: { more: { en: string; bn: string }; less: { en: string; bn: string } };
  card: { key: string; value: GeoGuideSettings; version: string };
}

/** Marketing › Where to advertise: each district's outcome, its word, and the lines to copy. */
export async function geoGuideScreen(db: Db, resolver: Resolver, now: Date, opts: { categoryId?: string | null; money?: boolean } = {}, storeId: number = S): Promise<GeoScreen> {
  const [s, timeZone] = await Promise.all([resolver.value(KEY, { storeId }), resolver.value('store.timeZone', { storeId })]);
  const categories = await db.category.findMany({ where: { storeId, parentId: null, archivedAt: null }, orderBy: { nameEn: 'asc' }, select: { id: true, nameEn: true, nameBn: true } });
  const categoryId = opts.categoryId && isUuid(opts.categoryId) && categories.some((c) => c.id === opts.categoryId) ? opts.categoryId : null;
  const { from, to } = lastDays(s.days, now, timeZone);
  const sales = await salesByArea(db, storeId, { from, to }, { timeZone, level: 'district', categoryId });
  const rows: GeoRow[] = sales.rows
    .map((r) => ({
      areaId: r.areaId,
      nameEn: r.nameEn,
      nameBn: r.nameBn,
      delivered: r.delivered,
      returned: r.returned,
      returnPct: returnPct(r),
      salesMinor: opts.money ? r.salesMinor : null,
      word: s.on ? wordOf(r, s) : null,
    }))
    .sort((a, b) => b.delivered + b.returned - (a.delivered + a.returned) || a.nameEn.localeCompare(b.nameEn));
  const counts: Record<GeoWord, number> = { more: 0, hold: 0, less: 0, few: 0 };
  for (const r of rows) if (r.word) counts[r.word] += 1;
  const line = (w: GeoWord) => {
    const of = rows.filter((r) => r.word === w);
    return { en: copyLine(of.map((r) => r.nameEn)), bn: copyLine(of.map((r) => r.nameBn ?? r.nameEn)) };
  };
  return {
    from,
    to,
    timeZone,
    categoryId,
    categories,
    rows,
    unknown: { delivered: sales.unknown.delivered, returned: sales.unknown.returned },
    counts,
    copy: { more: line('more'), less: line('less') },
    card: { key: KEY, value: s, version: versionOf(s) },
  };
}

/** The card (`marketing.campaigns.write`; audited): the Lumen card's {key, on, values}. */
export async function saveGeoGuideSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  if (!(await can(db, who.actor, 'marketing.campaigns.write', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['marketing.campaigns.write']);
  const before = await resolver.value(KEY, { storeId });
  const o = (input ?? {}) as { key?: unknown; on?: unknown; values?: unknown };
  if (o.key !== KEY || typeof o.on !== 'boolean') throw new JournalError('INVALID_INPUT', 400, ['key']);
  const values = o.values && typeof o.values === 'object' ? (o.values as Record<string, unknown>) : {};
  const ok = geoGuideSchema.safeParse({ ...before, ...values, on: o.on });
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Where to advertise' });
  await audit(db, who.actor, { storeId, action: 'ads.geoGuide.settings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/** /api/admin/marketing/geo-guide — GET the page (`marketing.campaigns.read`, ?category=<id>); PUT the card. */
export async function geoGuideHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const now = deps!.now?.() ?? new Date();
  try {
    if (method === 'PUT') await saveGeoGuideSettings(deps!.db, deps!.resolver, { actor: g.actor, ctx: g.ctx }, await readBody(request));
    const money = await can(deps!.db, g.actor, 'books.read', { storeId: S });
    const screen = await geoGuideScreen(deps!.db, deps!.resolver, now, { categoryId: new URL(request.url).searchParams.get('category'), money });
    return json({ ok: true, screen, cards: { [screen.card.key]: screen.card } });
  } catch (e) {
    return answer(e);
  }
}
