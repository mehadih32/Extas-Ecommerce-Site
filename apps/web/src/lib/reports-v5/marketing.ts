// PR 839 (prototype v5 Reports › Marketing & ads): what the campaign drawer and the ad-channel filter need beyond Marketing › Report's own
// figure — each campaign's ad platform, people reached, clicks, daily budget and its last 14 days of spend (all from the imported
// AdSpendDaily rows of the campaign's ad campaigns), and the ad-channel filter. Read-only.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day
/** How many days the drawer's spend chart shows. */
export const SPEND_DAYS = 14; // hardcode-ok: the prototype's own chart length

/** The ad-channel filter: the prototype's Facebook / Google / TikTok (an ad account of Google or YouTube counts as Google). */
export const AD_FILTERS = ['META', 'GOOGLE', 'TIKTOK'] as const;
export type AdFilter = (typeof AD_FILTERS)[number];
export const adFilterOf = (v: unknown): AdFilter | 'all' => AD_FILTERS.find((x) => x === v) ?? 'all';
/** Does an ad platform fall under the filter? */
export const platformMatches = (platform: string | null, f: AdFilter | 'all'): boolean => f === 'all' || (platform !== null && (f === 'GOOGLE' ? platform === 'GOOGLE' || platform === 'YOUTUBE' : platform === f));
/** A channel key ("ads:META") under the filter. */
export const channelMatches = (key: string, f: AdFilter | 'all'): boolean => (key.startsWith('ads:') ? platformMatches(key.slice(4), f) : f === 'all');

export interface CampaignDetail {
  platform: string | null;
  impressions: number;
  clicks: number;
  dailyBudgetMinor: number;
  days: { day: string; spendMinor: number }[];
}

/** The detail of each campaign (Marketing › Campaigns ids) for the span `from`–`to`; the spend chart covers the 14 days ending `to`. */
export async function loadCampaignDetail(db: PrismaClient, campaignIds: readonly string[], currency: string, from: string, to: string): Promise<Map<string, CampaignDetail>> {
  const out = new Map<string, CampaignDetail>();
  if (!campaignIds.length) return out;
  const ads = await db.adCampaign.findMany({ where: { storeId: S, campaignId: { in: [...campaignIds] } }, select: { id: true, campaignId: true, dailyBudgetMinor: true, adAccount: { select: { platform: true } } }, take: 5000 });
  const owner = new Map(ads.map((a) => [a.id, a]));
  const chartFrom = new Date(new Date(`${to}T00:00:00Z`).getTime() - (SPEND_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  const lo = chartFrom < from ? chartFrom : from;
  const rows = ads.length
    ? await db.adSpendDaily.findMany({
        where: { storeId: S, adCampaignId: { in: ads.map((a) => a.id) }, date: { gte: new Date(`${lo}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
        select: { adCampaignId: true, date: true, spendMinor: true, spendStoreMinor: true, currency: true, impressions: true, clicks: true },
        take: 50_000,
      })
    : [];
  for (const id of campaignIds) out.set(id, { platform: null, impressions: 0, clicks: 0, dailyBudgetMinor: 0, days: [] });
  for (const a of ads) {
    const x = out.get(a.campaignId!);
    if (!x) continue;
    x.platform ??= a.adAccount.platform;
    x.dailyBudgetMinor += a.dailyBudgetMinor ?? 0;
  }
  const perDay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const a = owner.get(r.adCampaignId ?? '');
    const x = a ? out.get(a.campaignId!) : undefined;
    if (!x) continue;
    const day = r.date.toISOString().slice(0, 10);
    const minor = r.currency === currency ? r.spendMinor : (r.spendStoreMinor ?? 0);
    if (day >= from && day <= to) {
      x.impressions += r.impressions;
      x.clicks += r.clicks;
    }
    if (day >= chartFrom) {
      const m = perDay.get(a!.campaignId!) ?? new Map<string, number>();
      m.set(day, (m.get(day) ?? 0) + minor);
      perDay.set(a!.campaignId!, m);
    }
  }
  for (const [id, x] of out) {
    const m = perDay.get(id);
    x.days = Array.from({ length: SPEND_DAYS }, (_, i) => {
      const day = new Date(new Date(`${chartFrom}T00:00:00Z`).getTime() + i * DAY_MS).toISOString().slice(0, 10);
      return { day, spendMinor: m?.get(day) ?? 0 };
    });
  }
  return out;
}

/** A click rate in percent (clicks over people reached); 0 when nobody was reached. */
export const clickRate = (clicks: number, impressions: number) => (impressions ? (clicks / impressions) * 100 : 0);
