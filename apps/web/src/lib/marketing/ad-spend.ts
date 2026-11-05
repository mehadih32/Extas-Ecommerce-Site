// S13 · PR 265 (Blueprint C6.2, demo 93-admin-ads.js "Spend", register "Ad spend import, per platform, per campaign")
// — what Meta, TikTok and Google spent, per campaign and per day, kept as AdSpendDaily rows: the profit and loss
// (packages/metrics pnl.ts), the channel profit (channels.ts) and the per-order profit (order-profit.ts) already read
// them, so an import fills those figures with no other change.
//
// - Each platform's reader (`AdsReader.spend`, @extas/adapters ads/spend.ts) reads the last `days` days, today included
//   (store time); each campaign's day is one row, replaced when read again (the platforms correct recent days), so
//   reading twice never counts twice. A campaign the shop has not seen yet is read first ("Read now", read only).
// - Until the key is in and its test passes the reader is a practice copy: its example days are counted and shown,
//   nothing is saved (A1.3).
// - The row keeps the platform's own currency. Spend in the store's currency is copied to `spendStoreMinor`; another
//   currency (a dollar account) is turned into the store's currency by the owner's USD rate of that day (PR 266,
//   lib/exchange-rate.ts), else left empty and counted (`noRate`) until he types one.
// - Daily: `ads.spendImport` (registry v172, off as it ships) lets the background worker run it once a day from the
//   owner's hour (packages/jobs ad-spend-import.ts → POST /api/internal/ads/spend-import with the server's internal
//   token). "Import now" works with the switch off.
// - Read only on the platforms: nothing pauses a campaign or changes a budget (rule 6). Audited
//   (marketing.adSpend.import, counts only).
// - PR 267: the daily hook then checks the owner's cost alerts (ad-alerts.ts `sendCostAlerts`).
import { createHash } from 'node:crypto';
import { adsSpendImportSchema, storeTarget, type AdsSpendImportSettings } from '@extas/settings';
import type { AdsPlatform, AdsSpendFacts, AdsSpendRange } from '@extas/adapters';
import { audit, SYSTEM } from '@extas/auth';
import { localClock } from '@extas/inventory';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { adminDeps, body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { AD_READER_PLATFORMS, AdPlatformsError, readerOf, syncAdPlatform, type AdPlatformsDeps, type AdPlatformsWho } from './ad-platforms';
import { internalCaller } from './audience-push';
import { pricerFor, type Pricer } from '../exchange-rate';
import { sendCostAlerts } from './ad-alerts';

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day
const ENUM: Record<AdsPlatform, 'META' | 'GOOGLE' | 'TIKTOK'> = { meta: 'META', google: 'GOOGLE', tiktok: 'TIKTOK' };

/** The days ending today (store time), `days` of them, today included. */
export function spendRange(now: Date, timeZone: string, days: number): AdsSpendRange {
  const to = localClock(now, timeZone).day;
  const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - (Math.max(1, days) - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

export interface SpendImportOutcome {
  platform: AdsPlatform;
  practice: boolean;
  range: AdsSpendRange;
  /** Campaign days read (a practice copy's are counted, never saved). */
  rows: number;
  /** Their spend, in the account currency's minor unit. */
  spendMinor: number;
  currency: string | null;
  /** Days of a campaign the platform names but the shop could not find even after reading the campaigns. */
  unknown: number;
  /** Days kept in another currency with no USD rate for them yet (PR 266). */
  noRate: number;
  /** The platform's refusal, in words (nothing kept for that platform). */
  error: string | null;
}

const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Reads one platform's spend over the range and keeps it (a practice copy only counts it). */
async function importOne(deps: AdPlatformsDeps, who: AdPlatformsWho, p: AdsPlatform, range: AdsSpendRange, price: Pricer): Promise<SpendImportOutcome> {
  const out: SpendImportOutcome = { platform: p, practice: false, range, rows: 0, spendMinor: 0, currency: null, unknown: 0, noRate: 0, error: null }; // hardcode-ok: counters start at zero
  const reader = await readerOf(deps, p);
  const read = await reader.spend(range);
  if (!read.ok) return { ...out, error: read.error };
  const facts = read.value.filter((f) => f.day >= range.from && f.day <= range.to);
  out.rows = facts.length;
  out.spendMinor = facts.reduce((n, f) => n + f.spendMinor, 0);
  if (reader.practice) {
    const a = await reader.account();
    return { ...out, practice: true, currency: a.ok ? a.value.currency : null };
  }
  const account = await reader.account();
  if (!account.ok) return { ...out, error: account.error };
  const find = () =>
    deps.db.adAccount.findUnique({
      where: { storeId_platform_externalId: { storeId: S, platform: ENUM[p], externalId: account.value.externalId } },
      select: { id: true, currency: true, campaigns: { select: { id: true, externalId: true } } },
    });
  let acc = await find();
  const named = new Set(facts.map((f) => f.campaignExternalId));
  // a campaign the shop has not seen yet: read the account's campaigns first (read only), then keep the spend
  if (!acc || [...named].some((x) => !acc!.campaigns.some((c) => c.externalId === x))) {
    await syncAdPlatform(deps, who, p);
    acc = await find();
  }
  if (!acc) return { ...out, error: 'the ad account could not be read' };
  const ids = new Map(acc.campaigns.map((c) => [c.externalId, c.id]));
  const currency = acc.currency;
  out.currency = currency;
  const keep: (AdsSpendFacts & { adCampaignId: string })[] = [];
  for (const f of facts) {
    const id = ids.get(f.campaignExternalId);
    if (id) keep.push({ ...f, adCampaignId: id });
    else out.unknown += 1;
  }
  await deps.db.$transaction(async (tx) => {
    for (const f of keep) {
      const priced = price(f.spendMinor, currency, f.day);
      if (!priced) out.noRate += 1;
      const data = { platform: ENUM[p], spendMinor: f.spendMinor, currency, spendStoreMinor: priced?.storeMinor ?? null, exchangeRateId: priced?.exchangeRateId ?? null, impressions: f.impressions, clicks: f.clicks, purchases: f.purchases };
      await tx.adSpendDaily.upsert({
        where: { adAccountId_adCampaignId_date: { adAccountId: acc.id, adCampaignId: f.adCampaignId, date: dayDate(f.day) } },
        create: { storeId: S, adAccountId: acc.id, adCampaignId: f.adCampaignId, date: dayDate(f.day), ...data },
        update: data,
      });
    }
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adSpend.import', entityType: 'AdAccount', entityId: account.value.externalId, after: { platform: p, ...range, rows: keep.length, unknown: out.unknown, noRate: out.noRate } }, who.ctx);
  return out;
}

/**
 * "Import now" (one platform, or every one) and the daily run: the last `days` days (the owner's setting unless given,
 * 1 to its bound), each platform on its own (one refusing does not stop the others).
 */
export async function importAdSpend(deps: AdPlatformsDeps, who: AdPlatformsWho, input: { platform?: unknown; days?: unknown } = {}, price?: Pricer): Promise<SpendImportOutcome[]> {
  let platforms: AdsPlatform[] = AD_READER_PLATFORMS;
  if (input.platform !== undefined && input.platform !== null) {
    if (typeof input.platform !== 'string' || !(AD_READER_PLATFORMS as string[]).includes(input.platform)) throw new AdPlatformsError('INVALID_INPUT', 400, ['platform']);
    platforms = [input.platform as AdsPlatform];
  }
  const [s, tz] = await Promise.all([deps.resolver.value('ads.spendImport', { storeId: S }), deps.resolver.value('store.timeZone', { storeId: S })]);
  let days = s.days;
  if (input.days !== undefined) {
    const ok = adsSpendImportSchema.shape.days.safeParse(input.days);
    if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, ['days']);
    days = ok.data;
  }
  const range = spendRange(deps.now ? deps.now() : new Date(), tz, days);
  // PR 266: another currency (a dollar account) by the owner's rate of that day
  const pricer = price ?? (await pricerFor(deps.db, deps.resolver, S));
  const out: SpendImportOutcome[] = [];
  for (const p of platforms) out.push(await importOne(deps, who, p, range, pricer));
  return out;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export interface SpendCard {
  key: 'spend';
  value: AdsSpendImportSettings;
  version: string;
}

export async function spendCard(resolver: AdPlatformsDeps['resolver']): Promise<SpendCard> {
  const value = await resolver.value('ads.spendImport', { storeId: S });
  return { key: 'spend', value, version: versionOf(value) };
}

/** PUT {key: 'spend', value, version}: the owner's daily import card (audited when it changes). */
export async function saveSpendCard(deps: AdPlatformsDeps, who: AdPlatformsWho, input: unknown): Promise<SpendCard> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'spend') throw new AdPlatformsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.spendImport', { storeId: S });
  if (o.version !== versionOf(before)) throw new AdPlatformsError('STALE', 409);
  const ok = adsSpendImportSchema.safeParse(o.value);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.spendImport', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Ad platforms' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adSpend.settings', entityType: 'Setting', entityId: 'ads.spendImport', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return spendCard(deps.resolver);
}

/** Each platform campaign's spend over the window (minor, account currency) and the platform's purchases. */
export async function campaignSpend(db: Pick<PrismaClient, 'adSpendDaily'>, from: string): Promise<Map<string, { minor: number; storeMinor: number | null; purchases: number; days: number }>> {
  const rows = await db.adSpendDaily.groupBy({ by: ['adCampaignId'], where: { storeId: S, date: { gte: dayDate(from) }, adCampaignId: { not: null } }, _sum: { spendMinor: true, spendStoreMinor: true, purchases: true }, _count: { _all: true, spendStoreMinor: true } });
  return new Map(
    rows.map((r) => [r.adCampaignId!, { minor: r._sum.spendMinor ?? 0, storeMinor: r._count.spendStoreMinor === r._count._all ? (r._sum.spendStoreMinor ?? 0) : null, purchases: r._sum.purchases ?? 0, days: r._count._all }]),
  );
}

/**
 * /api/internal/ads/spend-import — POST {storeId?} from the background worker with the server's internal token
 * (CACHE_HOOK_TOKEN in `x-extas-cache-hook`); without it the answer is "not found". Counts only in the answer.
 */
export async function spendImportHook(request: Request, deps: AdminDeps | null = adminDeps(), extra: Partial<AdPlatformsDeps> & { send?: (text: string) => Promise<void> } = {}): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST' || !internalCaller(request)) return fail(404, 'not-found');
  if (!deps) return fail(503, 'database-not-configured');
  try {
    const o = await body(request);
    const storeId = Number.isInteger(o.storeId) && (o.storeId as number) > 0 ? (o.storeId as number) : S;
    // the ad accounts are the mother store's (Marketing › Ad platforms); another store has none to read
    if (storeId !== S) return json({ ok: true, skipped: 'store', results: [] });
    const s = await deps.resolver.value('ads.spendImport', { storeId });
    if (!s.on) return json({ ok: true, skipped: 'off', results: [] });
    const d: AdPlatformsDeps = { db: deps.db, resolver: deps.resolver, vault: deps.vault, ...extra };
    const results = await importAdSpend(d, { actor: SYSTEM, ctx: { source: 'ad-spend-import' } }, {});
    // PR 267: right after the import, the owner's crossed cost alerts go to his Telegram (`ads.costAlerts`, off as shipped)
    const alerts = await sendCostAlerts({ ...d, send: extra.send });
    return json({ ok: true, skipped: null, alerts, results: results.map((r) => ({ platform: r.platform, practice: r.practice, rows: r.rows, unknown: r.unknown, noRate: r.noRate, error: r.error ? 'PLATFORM' : null })) });
  } catch (e) {
    return errorResponse(e);
  }
}

const answer = (e: unknown): Response => (e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/ad-platforms/spend — GET the daily import card (`marketing.campaigns.read`); POST {platform?,
 * days?}: "Import now" (`marketing.campaigns.write`); PUT {key: 'spend', value, version}: the card (`marketing.campaigns.write`).
 */
export async function adSpendHandler(request: Request, deps: AdminDeps | null, extra: Partial<AdPlatformsDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: AdPlatformsDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, cards: { spend: await spendCard(d.resolver) } });
    if (method === 'PUT') return json({ ok: true, cards: { spend: await saveSpendCard(d, who, await body(request)) } });
    const b = (await body(request)) as { platform?: unknown; days?: unknown };
    return json({ ok: true, results: await importAdSpend(d, who, { platform: b.platform, days: b.days }) });
  } catch (e) {
    return answer(e);
  }
}
