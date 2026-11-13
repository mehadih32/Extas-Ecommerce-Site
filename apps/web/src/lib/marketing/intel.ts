// S13 · PR 548 (register "Market and competitor intelligence"; demo MKT-07 `97x-adm2-marketing.js` "Market &
// competitors", `/admin/marketing/intel`) — Marketing › Market & competitors on the database.
//
// - The owner follows a shop's own public page by its link (`Competitor`, reused as-is from the S15 teardown-report
//   schema — no migration, no new model); the page is read through the SAME page reader connection PR 33's
//   "Import from a link" and the source-link writer already use, never a second reader. Adding a link reads it at
//   once (the same "no separate preview step" shape PR 529's writer already has).
// - Each read is saved as a `CompetitorReport` (`findings`: the page's own facts, `diff`: what changed since the
//   last read) so the page can show "last change" without re-reading the link every time it is opened.
// - The price table lines our products up against the lowest-matching price the followed shops show, by name alone
//   (Jaccard word overlap, `intel-model.ts`). Proposals only — a price never changes here; it changes in the ERP
//   (hard rule 6: nothing here is allowed to write a price).
// - `ads.intel.on` ("Change alerts") only highlights a change on the page itself; no Telegram/e-mail copy exists yet
//   (an honest gap — the staff-notification channel is a later S14 PR). "Check all"/the daily run (BullMQ) are not
//   wired either; only a manual "Check now" per link is built. `maxLinks`/`refreshHours`/`matchScore` are settings
//   with no card field yet, the same honest gap PR 529's `allowedHosts` has.
import { currencyDigits } from '@extas/adapters';
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { adsIntelSchema, storeTarget, type AdsIntelSettings } from '@extas/settings';
import { body, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { pageReaderFor } from '../catalogue-tools-api';
import { answer, JournalError, versionOf, type JournalWho } from '../journal/journal';
import { issuesOf } from '../journal/model';
import { diffFacts, matchProducts, publicUrl, type CompetitorPageFacts, type FactsDiff, type MatchedProduct, type OurProduct } from './intel-model';

const S = MOTHER_STORE_ID;
const KEY = 'ads.intel';
const LINKS_TAKE_MAX = 200; // hardcode-ok: far above `maxLinks`'s own ceiling of 50 — only a sanity bound on the query
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];

export interface CompetitorRow {
  id: string;
  name: string;
  url: string;
  archived: boolean;
  lastRunAt: string | null;
  matched: number;
  change: FactsDiff['kind'] | null;
}

export interface IntelScreen {
  currency: string;
  links: CompetitorRow[];
  linksMax: number;
  table: MatchedProduct[];
  card: { key: string; value: AdsIntelSettings; version: string };
}

const nameFromUrl = (u: URL): string =>
  u.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.')[0]!
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

async function ourProducts(db: Db, storeId: number): Promise<OurProduct[]> {
  const rows = await db.product.findMany({
    where: { storeId, archivedAt: null, status: 'PUBLISHED', isDemo: false },
    select: {
      id: true,
      nameEn: true,
      variants: { where: { archivedAt: null, priceMinor: { not: null } }, orderBy: { priceMinor: 'asc' }, select: { active: true, priceMinor: true } },
    },
  });
  const out: OurProduct[] = [];
  for (const p of rows) {
    const v = p.variants.find((x) => x.active) ?? p.variants[0];
    if (v?.priceMinor != null) out.push({ id: p.id, name: p.nameEn, priceMinor: v.priceMinor });
  }
  return out;
}

/** The last saved facts for a link (null when it has never been read). */
async function lastFactsOf(db: Db, competitorId: string, storeId: number): Promise<CompetitorPageFacts | null> {
  const r = await db.competitorReport.findFirst({ where: { storeId, competitorId }, orderBy: { createdAt: 'desc' }, select: { findings: true } });
  return (r?.findings as unknown as CompetitorPageFacts) ?? null;
}

/** Marketing › Market & competitors: the followed links, the price table against our own products, the card. */
export async function intelScreen(db: Db, resolver: Resolver, storeId: number = S): Promise<IntelScreen> {
  const [s, currency, competitors, ours] = await Promise.all([
    resolver.value(KEY, { storeId }),
    resolver.value('store.currency', { storeId }),
    db.competitor.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' }, take: LINKS_TAKE_MAX }),
    ourProducts(db, storeId),
  ]);
  const digits = currencyDigits(currency);
  const factsByCompetitor = new Map<string, CompetitorPageFacts>();
  const links: CompetitorRow[] = [];
  for (const c of competitors) {
    const latest = await db.competitorReport.findFirst({ where: { storeId, competitorId: c.id }, orderBy: { createdAt: 'desc' }, select: { findings: true, diff: true } });
    const facts = (latest?.findings as unknown as CompetitorPageFacts) ?? null;
    if (facts) factsByCompetitor.set(c.id, facts);
    links.push({
      id: c.id,
      name: c.name,
      url: c.url,
      archived: !!c.archivedAt,
      lastRunAt: c.lastRunAt?.toISOString() ?? null,
      matched: facts ? facts.products.length : 0,
      change: (latest?.diff as unknown as FactsDiff | null)?.kind ?? null,
    });
  }
  const theirs = [...factsByCompetitor.values()].flatMap((f) => f.products);
  const table = matchProducts(ours, theirs, s.matchScore / 100, currency, digits);
  return { currency, links, linksMax: s.maxLinks, table, card: { key: KEY, value: s, version: versionOf(s) } };
}

/**
 * Reads one followed link now (through the page reader connection) and saves its facts as a new `CompetitorReport`,
 * with the diff since the link's last read. Shared by "Add link" (reads it once, at once) and "Check now".
 */
async function readCompetitorNow(deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>, competitor: { id: string; url: string }, now: Date, storeId: number): Promise<void> {
  const [maxKb, timeoutSeconds, maxRedirects] = await Promise.all([
    deps.resolver.value('catalogue.linkImport.maxPageKb', { storeId }),
    deps.resolver.value('catalogue.linkImport.timeoutSeconds', { storeId }),
    deps.resolver.value('catalogue.linkImport.maxRedirects', { storeId }),
  ]);
  const reader = await pageReaderFor(deps as AdminDeps, storeId);
  let page: { html: string; finalUrl: string };
  try {
    page = await reader.api.read(competitor.url, { maxBytes: maxKb * 1024, timeoutMs: timeoutSeconds * 1000, maxRedirects });
  } catch {
    throw new JournalError('PAGE_UNREADABLE', 502, ['read']);
  }
  const { parseCompetitorPage } = await import('./intel-model');
  const facts = parseCompetitorPage(page.html, page.finalUrl);
  const prev = await lastFactsOf(deps.db, competitor.id, storeId);
  const currency = await deps.resolver.value('store.currency', { storeId });
  const diff = diffFacts(prev, facts, currencyDigits(currency));
  await deps.db.$transaction([
    deps.db.competitorReport.create({ data: { storeId, competitorId: competitor.id, findings: facts as never, diff: diff as never } }),
    deps.db.competitor.update({ where: { id: competitor.id }, data: { lastRunAt: now } }),
  ]);
}

/** POST {url} — follow a shop's own page (`marketing.campaigns.write`); reads it once, at once, like any new link. */
export async function addCompetitorLink(
  deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>,
  who: JournalWho,
  input: unknown,
  now: Date = new Date(),
  storeId: number = S,
): Promise<{ id: string }> {
  if (!(await can(deps.db, who.actor, 'marketing.campaigns.write', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['marketing.campaigns.write']);
  const o = (input ?? {}) as { url?: unknown };
  const u = typeof o.url === 'string' ? publicUrl(o.url) : null;
  if (!u) throw new JournalError('INVALID_INPUT', 400, ['url']);
  const [set, activeCount] = await Promise.all([deps.resolver.value(KEY, { storeId }), deps.db.competitor.count({ where: { storeId, archivedAt: null } })]);
  if (activeCount >= set.maxLinks) throw new JournalError('LINKS_LIMIT', 409, [String(set.maxLinks)]);
  const created = await deps.db.competitor.create({ data: { storeId, name: nameFromUrl(u), url: u.toString() } });
  try {
    await readCompetitorNow(deps, created, now, storeId);
  } catch {
    // The link is still followed; "last read" stays empty and the row shows it was never read. "Check now" retries.
  }
  await audit(
    deps.db,
    who.actor,
    { storeId, action: 'ads.intel.addLink', entityType: 'Competitor', entityId: created.id, after: { url: created.url, name: created.name } },
    who.ctx,
  );
  return { id: created.id };
}

async function setArchived(db: Db, who: JournalWho, id: string, archived: boolean, now: Date, storeId: number): Promise<void> {
  if (!(await can(db, who.actor, 'marketing.campaigns.write', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['marketing.campaigns.write']);
  if (!isUuid(id)) throw new JournalError('INVALID_INPUT', 400, ['id']);
  const c = await db.competitor.findFirst({ where: { id, storeId } });
  if (!c) throw new JournalError('NOT_FOUND', 404, ['id']);
  await db.competitor.update({ where: { id }, data: { archivedAt: archived ? now : null } });
  await audit(
    db,
    who.actor,
    { storeId, action: archived ? 'ads.intel.archiveLink' : 'ads.intel.restoreLink', entityType: 'Competitor', entityId: id, after: { archived } },
    who.ctx,
  );
}

/** Stop following a link (kept, not deleted — hard rule 3). */
export const archiveCompetitorLink = (db: Db, who: JournalWho, id: string, now: Date, storeId: number = S) => setArchived(db, who, id, true, now, storeId);
/** Follow it again. */
export const restoreCompetitorLink = (db: Db, who: JournalWho, id: string, now: Date, storeId: number = S) => setArchived(db, who, id, false, now, storeId);

/** POST {id} — "Check now": re-reads one followed link outside its `refreshHours` schedule (`marketing.campaigns.write`). */
export async function runCompetitorIntel(
  deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>,
  who: JournalWho,
  id: string,
  now: Date = new Date(),
  storeId: number = S,
): Promise<void> {
  if (!(await can(deps.db, who.actor, 'marketing.campaigns.write', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['marketing.campaigns.write']);
  if (!isUuid(id)) throw new JournalError('INVALID_INPUT', 400, ['id']);
  const c = await deps.db.competitor.findFirst({ where: { id, storeId, archivedAt: null } });
  if (!c) throw new JournalError('NOT_FOUND', 404, ['id']);
  await readCompetitorNow(deps, c, now, storeId);
  await audit(deps.db, who.actor, { storeId, action: 'ads.intel.checkNow', entityType: 'Competitor', entityId: id, after: {} }, who.ctx);
}

/** The card (`marketing.campaigns.write`; audited): the Lumen card's {key, on, values}. */
export async function saveIntelSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  if (!(await can(db, who.actor, 'marketing.campaigns.write', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['marketing.campaigns.write']);
  const before = await resolver.value(KEY, { storeId });
  const o = (input ?? {}) as { key?: unknown; on?: unknown; values?: unknown };
  if (o.key !== KEY || typeof o.on !== 'boolean') throw new JournalError('INVALID_INPUT', 400, ['key']);
  const values = o.values && typeof o.values === 'object' ? (o.values as Record<string, unknown>) : {};
  const ok = adsIntelSchema.safeParse({ ...before, ...values, on: o.on });
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Market & competitors' });
  await audit(db, who.actor, { storeId, action: 'ads.intel.settings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/**
 * /api/admin/marketing/intel — GET the screen (`marketing.campaigns.read`); PUT the card; POST {url} to follow a
 * link, {id, action: 'check' | 'archive' | 'restore'} to act on one (all `marketing.campaigns.write`).
 */
export async function intelHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const resolver = deps!.resolver;
  const now = deps!.now?.() ?? new Date();
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'PUT') {
      await saveIntelSettings(db, resolver, who, await body(request));
    } else if (method === 'POST') {
      const o = (await body(request)) as { url?: unknown; id?: unknown; action?: unknown };
      if (typeof o.url === 'string') await addCompetitorLink(deps!, who, { url: o.url }, now);
      else if (typeof o.id === 'string' && o.action === 'check') await runCompetitorIntel(deps!, who, o.id, now);
      else if (typeof o.id === 'string' && o.action === 'archive') await archiveCompetitorLink(db, who, o.id, now);
      else if (typeof o.id === 'string' && o.action === 'restore') await restoreCompetitorLink(db, who, o.id, now);
      else throw new JournalError('INVALID_INPUT', 400, ['action']);
    }
    return json({ ok: true, screen: await intelScreen(db, resolver) });
  } catch (e) {
    return answer(e);
  }
}
