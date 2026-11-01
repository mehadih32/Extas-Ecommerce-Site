// S13 · PR 259 (Blueprint C6.2, demo 93-admin-ads.js "Campaigns" and "Connections") — Marketing › Ad platforms: the
// shop's ad accounts as the platforms see them, read through their adapters (Meta first; TikTok PR 260, Google
// PR 261).
//
// - "Read now" reads the account, its campaigns and ad sets through the platform's Marketing API (read only) and keeps
//   them as AdAccount / AdCampaign / AdSet rows: new ones added, changed ones updated, ones the platform no longer
//   lists marked gone (archivedAt) — never deleted.
// - Until the key is in and its test passes the reader is a practice copy: the page shows its example account and
//   campaigns, marked as practice, and nothing is saved (A1.3).
// - A platform campaign can be tied to one of the shop's own campaigns (PR 256), so its spend (PR 265) and the orders
//   and deliveries of its landing pages meet in one place.
// - Nothing here pauses a campaign or changes a budget (PR 268, behind a confirm and the owner's OK), moves money or
//   touches an order. Seeing needs `marketing.campaigns.read`; reading and tying need `marketing.campaigns.write`;
//   both audited (marketing.adPlatforms.sync / .link).
import { ADS_READER_CONNECTION, adsReaderAdapters, createConnections, type AdsAccountFacts, type AdsCampaignFacts, type AdsPlatform, type AdsReader, type Connections } from '@extas/adapters';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AppResolver } from '../settings';

const S = MOTHER_STORE_ID;
/** The platforms with a reader so far, in their fixed order. */
export const AD_READER_PLATFORMS = Object.keys(ADS_READER_CONNECTION) as AdsPlatform[];
const ENUM: Record<AdsPlatform, 'META' | 'GOOGLE' | 'TIKTOK'> = { meta: 'META', google: 'GOOGLE', tiktok: 'TIKTOK' };
/** The campaigns listed per account (newest first). */
export const AD_CAMPAIGNS_MAX = 300; // hardcode-ok: a list length, not a business number

export class AdPlatformsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface AdPlatformsDeps {
  db: PrismaClient;
  resolver: AppResolver;
  vault: Pick<Vault, 'get'> | null;
  /** Tests pass their own connections (a stand-in platform). */
  connections?: Connections;
  now?: () => Date;
}

export interface AdPlatformsWho {
  actor: Actor;
  ctx: RequestContext;
}

async function connectionsOf(deps: AdPlatformsDeps): Promise<Connections> {
  if (deps.connections) return deps.connections;
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  return createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: adsReaderAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
}

async function readerOf(deps: AdPlatformsDeps, platform: AdsPlatform): Promise<AdsReader> {
  const c = ADS_READER_CONNECTION[platform];
  if (!c) throw new AdPlatformsError('INVALID_INPUT', 400, ['platform']);
  const link = await (await connectionsOf(deps)).use<AdsReader>(c.kind, { storeId: S, provider: c.provider });
  return link.api;
}

export interface AdCampaignRow {
  id: string;
  externalId: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudgetMinor: number | null;
  lifetimeBudgetMinor: number | null;
  currency: string;
  adSets: number;
  gone: boolean;
  lastSyncedAt: string | null;
  campaign: { id: string; name: string } | null;
}

export interface AdPlatformView {
  platform: AdsPlatform;
  /** MOCK until the key is in and its test passed. */
  mode: string;
  lastTest: { at: string; ok: boolean } | null;
  accounts: { id: string; externalId: string; name: string; currency: string; campaigns: AdCampaignRow[] }[];
  /** The practice copy's example (mode MOCK): shown, never saved. */
  practice: { account: AdsAccountFacts; campaigns: AdsCampaignFacts[] } | null;
}

export interface AdPlatformsOverview {
  platforms: AdPlatformView[];
  /** The shop's own campaigns a platform campaign can be tied to. */
  ours: { id: string; name: string }[];
}

export async function adPlatformsOverview(deps: AdPlatformsDeps): Promise<AdPlatformsOverview> {
  const [links, accounts, ours] = await Promise.all([
    deps.db.integration.findMany({ where: { archivedAt: null, enabled: true, OR: AD_READER_PLATFORMS.map((p) => ({ kind: ADS_READER_CONNECTION[p]!.kind, provider: ADS_READER_CONNECTION[p]!.provider })), AND: [{ OR: [{ storeId: S }, { storeId: null }] }] }, orderBy: { updatedAt: 'desc' } }),
    deps.db.adAccount.findMany({
      where: { storeId: S, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        platform: true,
        externalId: true,
        name: true,
        currency: true,
        campaigns: {
          orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
          take: AD_CAMPAIGNS_MAX,
          select: { id: true, externalId: true, name: true, status: true, objective: true, dailyBudgetMinor: true, lifetimeBudgetMinor: true, currency: true, archivedAt: true, lastSyncedAt: true, campaign: { select: { id: true, name: true } }, _count: { select: { adSets: { where: { archivedAt: null } } } } },
        },
      },
    }),
    deps.db.campaign.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: AD_CAMPAIGNS_MAX, select: { id: true, name: true } }),
  ]);
  const platforms: AdPlatformView[] = [];
  for (const platform of AD_READER_PLATFORMS) {
    const c = ADS_READER_CONNECTION[platform]!;
    const row = links.find((r) => r.kind === c.kind && r.provider === c.provider);
    const mode = row?.mode ?? 'MOCK';
    let practice: AdPlatformView['practice'] = null;
    if (mode === 'MOCK') {
      const r = await readerOf(deps, platform);
      const [a, cs] = await Promise.all([r.account(), r.campaigns()]);
      if (r.practice && a.ok && cs.ok) practice = { account: a.value, campaigns: cs.value };
    }
    platforms.push({
      platform,
      mode,
      lastTest: row?.lastTestAt ? { at: row.lastTestAt.toISOString(), ok: !!row.lastTestOk } : null,
      practice,
      accounts: accounts
        .filter((x) => x.platform === ENUM[platform])
        .map((x) => ({
          id: x.id,
          externalId: x.externalId,
          name: x.name,
          currency: x.currency,
          campaigns: x.campaigns.map((k) => ({
            id: k.id,
            externalId: k.externalId,
            name: k.name,
            status: k.status,
            objective: k.objective,
            dailyBudgetMinor: k.dailyBudgetMinor,
            lifetimeBudgetMinor: k.lifetimeBudgetMinor,
            currency: k.currency,
            adSets: k._count.adSets,
            gone: !!k.archivedAt,
            lastSyncedAt: k.lastSyncedAt?.toISOString() ?? null,
            campaign: k.campaign,
          })),
        })),
    });
  }
  return { platforms, ours };
}

export interface SyncOutcome {
  platform: AdsPlatform;
  practice: boolean;
  campaigns: number;
  adSets: number;
  /** Campaigns and ad sets the platform no longer lists (marked gone, never deleted). */
  gone: number;
}

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new AdPlatformsError('PLATFORM', 502, [r.error]);
  return r.value;
};

/** "Read now": the account, its campaigns and ad sets, kept as rows (a practice copy is counted, never saved). */
export async function syncAdPlatform(deps: AdPlatformsDeps, who: AdPlatformsWho, platform: unknown): Promise<SyncOutcome> {
  if (typeof platform !== 'string' || !(AD_READER_PLATFORMS as string[]).includes(platform)) throw new AdPlatformsError('INVALID_INPUT', 400, ['platform']);
  const p = platform as AdsPlatform;
  const reader = await readerOf(deps, p);
  const account = unwrap(await reader.account());
  const campaigns = unwrap(await reader.campaigns());
  const adSets = unwrap(await reader.adSets());
  if (reader.practice) return { platform: p, practice: true, campaigns: campaigns.length, adSets: adSets.length, gone: 0 };
  const now = deps.now ? deps.now() : new Date();
  const currency = account.currency || (await deps.resolver.value('store.currency', { storeId: S }));
  let gone = 0;
  await deps.db.$transaction(async (tx) => {
    const acc = await tx.adAccount.upsert({
      where: { storeId_platform_externalId: { storeId: S, platform: ENUM[p], externalId: account.externalId } },
      create: { storeId: S, platform: ENUM[p], externalId: account.externalId, name: account.name, currency },
      update: { name: account.name, currency, archivedAt: null },
      select: { id: true },
    });
    const ids = new Map<string, string>();
    for (const c of campaigns) {
      const data = { name: c.name, status: c.status, objective: c.objective, dailyBudgetMinor: c.dailyBudgetMinor, lifetimeBudgetMinor: c.lifetimeBudgetMinor, currency, lastSyncedAt: now, archivedAt: null };
      const row = await tx.adCampaign.upsert({ where: { adAccountId_externalId: { adAccountId: acc.id, externalId: c.externalId } }, create: { storeId: S, adAccountId: acc.id, externalId: c.externalId, ...data }, update: data, select: { id: true } });
      ids.set(c.externalId, row.id);
    }
    gone += (await tx.adCampaign.updateMany({ where: { storeId: S, adAccountId: acc.id, archivedAt: null, externalId: { notIn: [...ids.keys()] } }, data: { archivedAt: now } })).count;
    const setIds: string[] = [];
    for (const a of adSets) {
      const parent = ids.get(a.campaignExternalId);
      if (!parent) continue;
      const data = { name: a.name, status: a.status, dailyBudgetMinor: a.dailyBudgetMinor, targeting: (a.targeting ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull, archivedAt: null };
      const row = await tx.adSet.upsert({ where: { adCampaignId_externalId: { adCampaignId: parent, externalId: a.externalId } }, create: { storeId: S, adCampaignId: parent, externalId: a.externalId, ...data }, update: data, select: { id: true } });
      setIds.push(row.id);
    }
    gone += (await tx.adSet.updateMany({ where: { storeId: S, adCampaign: { adAccountId: acc.id }, archivedAt: null, id: { notIn: setIds } }, data: { archivedAt: now } })).count;
  });
  const out: SyncOutcome = { platform: p, practice: false, campaigns: campaigns.length, adSets: adSets.length, gone };
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adPlatforms.sync', entityType: 'AdAccount', entityId: account.externalId, after: { ...out } }, who.ctx);
  return out;
}

/** Ties a platform campaign to one of the shop's own campaigns (null unties it). */
export async function linkAdCampaign(deps: AdPlatformsDeps, who: AdPlatformsWho, input: unknown): Promise<void> {
  const i = (input && typeof input === 'object' ? input : {}) as { adCampaignId?: unknown; campaignId?: unknown };
  if (typeof i.adCampaignId !== 'string') throw new AdPlatformsError('INVALID_INPUT', 400, ['adCampaignId']);
  if (i.campaignId !== null && typeof i.campaignId !== 'string') throw new AdPlatformsError('INVALID_INPUT', 400, ['campaignId']);
  const uuid = /^[0-9a-f-]{36}$/i;
  const row = uuid.test(i.adCampaignId) ? await deps.db.adCampaign.findFirst({ where: { id: i.adCampaignId, storeId: S }, select: { id: true, campaignId: true } }) : null;
  if (!row) throw new AdPlatformsError('NOT_FOUND', 404);
  const ours = i.campaignId && uuid.test(i.campaignId) ? await deps.db.campaign.findFirst({ where: { id: i.campaignId, storeId: S, archivedAt: null }, select: { id: true } }) : null;
  if (i.campaignId && !ours) throw new AdPlatformsError('INVALID_INPUT', 400, ['campaignId']);
  const to = ours?.id ?? null;
  if (row.campaignId === to) return;
  await deps.db.adCampaign.update({ where: { id: row.id }, data: { campaignId: to } });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adPlatforms.link', entityType: 'AdCampaign', entityId: row.id, before: { campaignId: row.campaignId }, after: { campaignId: to } }, who.ctx);
}

const answer = (e: unknown): Response => (e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/ad-platforms — GET the overview (`marketing.campaigns.read`); POST {action: 'sync', platform}
 * or {action: 'link', adCampaignId, campaignId|null} (`marketing.campaigns.write`).
 */
export async function adPlatformsHandler(request: Request, deps: AdminDeps | null, extra: Partial<AdPlatformsDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: AdPlatformsDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, overview: await adPlatformsOverview(d) });
    const b = (await body(request)) as { action?: unknown; platform?: unknown } | null;
    if (b?.action === 'sync') return json({ ok: true, outcome: await syncAdPlatform(d, who, b.platform), overview: await adPlatformsOverview(d) });
    if (b?.action === 'link') {
      await linkAdCampaign(d, who, b);
      return json({ ok: true, overview: await adPlatformsOverview(d) });
    }
    throw new AdPlatformsError('INVALID_INPUT', 400, ['action']);
  } catch (e) {
    return answer(e);
  }
}
