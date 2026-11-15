// Parity round 3, lane F6 · PR 865 (prototype v5 Marketing › Ad campaigns › one campaign, js/m-marketing.js `renderCampaignPage`) —
// what the campaign page reads. Everything is read-only and from what is already stored: spend, clicks and the platform's own
// "purchases" from the spend days, the orders that carry the campaign (placed, delivered, returned, Sales, profit after ads — the
// same figures the list shows), the ads inside it from the ad-level days (a click rate that fell = tired), the days, and where
// and what it sold. Nothing is changed here; the buttons on the page go through the campaign controls.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { campaignWhereWhat, profitByAdCampaign, ymdIn } from '@extas/metrics';
import type { MarketingVerdictsSettings } from '@extas/settings';
import type { AdminDeps } from '../admin-auth';
import { profitInputs } from '../order-profit-view';
import { previousPeriod, resolvePeriod, type PeriodKey } from '../lane-f/period';
import { TIRED_DROP_PCT, type OverviewDeps } from './overview';
import { fatigueOf, salesPerTk, verdictOf, type Verdict } from './overview-model';

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: ms in a day
const TOP = 6; // hardcode-ok: a list length (the prototype shows six districts and six products)
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface CampaignFigures {
  spendMinor: number | null;
  salesMinor: number;
  delivered: number;
  returned: number;
  /** Orders placed through the campaign (not drafts or cancelled). */
  orders: number;
  clicks: number;
  /** What the platform says were purchases. */
  claimed: number;
  profitMinor: number | null;
  perTk: number | null;
  verdict: Verdict;
}

export interface CampaignAd {
  id: string;
  name: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  purchases: number;
  ctrNow: number | null;
  dropPct: number | null;
  tired: boolean;
}

export interface AdCampaignPage {
  found: boolean;
  id: string;
  name: string;
  platform: string;
  status: string;
  dailyBudgetMinor: number | null;
  currency: string;
  storeCurrency: string;
  timeZone: string;
  from: string;
  to: string;
  thresholds: MarketingVerdictsSettings;
  now: CampaignFigures;
  prev: CampaignFigures;
  ads: CampaignAd[];
  days: { day: string; spendMinor: number; salesMinor: number }[];
  districts: { name: string; delivered: number }[];
  products: { name: string; pieces: number }[];
}

async function figures(db: PrismaClient, id: string, range: { from: string; to: string }, timeZone: string, th: MarketingVerdictsSettings, costs: Awaited<ReturnType<typeof profitInputs>>): Promise<CampaignFigures> {
  const lo = new Date(`${range.from}T00:00:00Z`);
  const hi = new Date(`${range.to}T00:00:00Z`);
  const [profit, spend, placed] = await Promise.all([
    profitByAdCampaign(db, S, range, costs).catch(() => new Map()),
    db.adSpendDaily.aggregate({ where: { storeId: S, adCampaignId: id, date: { gte: lo, lte: hi } }, _sum: { clicks: true, purchases: true } }),
    db.order.count({ where: { storeId: S, adCampaignId: id, archivedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] }, createdAt: { gte: new Date(`${range.from}T00:00:00Z`), lt: new Date(Date.parse(`${range.to}T00:00:00Z`) + DAY_MS) } } }),
  ]);
  void timeZone;
  const p = profit.get(id);
  const perTk = salesPerTk(p?.salesMinor ?? 0, p ? p.spendMinor : 0);
  return {
    spendMinor: p ? p.spendMinor : 0,
    salesMinor: p?.salesMinor ?? 0,
    delivered: p?.delivered ?? 0,
    returned: p?.returned ?? 0,
    orders: placed,
    clicks: spend._sum.clicks ?? 0,
    claimed: spend._sum.purchases ?? 0,
    profitMinor: p ? p.profitMinor : null,
    perTk,
    verdict: verdictOf(perTk, th),
  };
}

/** The campaign page for the last days / the named period. `found` is false for an id that is not a live ad campaign. */
export async function adCampaignPage(deps: Pick<OverviewDeps, 'db' | 'resolver' | 'now'>, id: string, period: PeriodKey): Promise<AdCampaignPage> {
  const at = { storeId: S };
  const [timeZone, storeCurrency, th, camp] = await Promise.all([
    deps.resolver.value('store.timeZone', at) as Promise<string>,
    deps.resolver.value('store.currency', at) as Promise<string>,
    deps.resolver.value('marketing.verdicts', at) as Promise<MarketingVerdictsSettings>,
    /^[0-9a-f-]{36}$/i.test(id) ? deps.db.adCampaign.findFirst({ where: { id, storeId: S, archivedAt: null }, select: { id: true, name: true, status: true, dailyBudgetMinor: true, currency: true, adAccount: { select: { platform: true } } } }) : Promise.resolve(null),
  ]);
  const today = ymdIn(deps.now?.() ?? new Date(), timeZone);
  const range = resolvePeriod(period, today);
  const base = { id, thresholds: th, storeCurrency, timeZone, from: range.from, to: range.to };
  if (!camp) {
    const z: CampaignFigures = { spendMinor: 0, salesMinor: 0, delivered: 0, returned: 0, orders: 0, clicks: 0, claimed: 0, profitMinor: null, perTk: null, verdict: 'NONE' };
    return { ...base, found: false, name: '', platform: '', status: '', dailyBudgetMinor: null, currency: storeCurrency, now: z, prev: z, ads: [], days: [], districts: [], products: [] };
  }
  const costs = await profitInputs(deps.resolver as unknown as AdminDeps['resolver'] as never, S);
  const prevRange = previousPeriod(range.from, range.to);
  const [now, prev] = await Promise.all([figures(deps.db, id, range, timeZone, th, costs), figures(deps.db, id, prevRange, timeZone, th, costs)]);

  // the days: this campaign's spend and the Sales of its delivered orders, per shop day
  const lo = new Date(`${range.from}T00:00:00Z`);
  const hi = new Date(`${range.to}T00:00:00Z`);
  const [spendDays, delivered] = await Promise.all([
    deps.db.adSpendDaily.groupBy({ by: ['date'], where: { storeId: S, adCampaignId: id, date: { gte: lo, lte: hi } }, _sum: { spendStoreMinor: true } }),
    deps.db.order.findMany({ where: { storeId: S, adCampaignId: id, archivedAt: null, status: 'DELIVERED', deliveredAt: { gte: new Date(`${range.from}T00:00:00Z`), lt: new Date(Date.parse(`${range.to}T00:00:00Z`) + DAY_MS) } }, select: { deliveredAt: true, totalMinor: true }, take: 20_000 }), // hardcode-ok: a read guard
  ]);
  const spendOf = new Map(spendDays.map((r) => [r.date.toISOString().slice(0, 10), r._sum.spendStoreMinor ?? 0]));
  const salesOf = new Map<string, number>();
  for (const o of delivered) if (o.deliveredAt) salesOf.set(ymdIn(o.deliveredAt, timeZone), (salesOf.get(ymdIn(o.deliveredAt, timeZone)) ?? 0) + o.totalMinor);
  const days: AdCampaignPage['days'] = [];
  for (let d = range.from; d <= range.to; d = addDay(d, 1)) days.push({ day: d, spendMinor: spendOf.get(d) ?? 0, salesMinor: salesOf.get(d) ?? 0 });

  // the ads inside: the period's figures, and the two weeks the click rate is compared over
  const fatFrom = range.from < addDay(today, -13) ? range.from : addDay(today, -13);
  const adDays = await deps.db.adCreativeDay.findMany({
    where: { storeId: S, date: { gte: new Date(`${fatFrom}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) }, ad: { adSet: { adCampaignId: id } } },
    select: { adId: true, date: true, spendStoreMinor: true, impressions: true, clicks: true, purchases: true, ad: { select: { name: true } } },
    take: 20_000, // hardcode-ok: a read guard
  });
  const byAd = new Map<string, { name: string; days: { day: string; impressions: number; clicks: number }[]; spend: number; imp: number; clk: number; buy: number }>();
  for (const r of adDays) {
    const a = byAd.get(r.adId) ?? { name: r.ad.name, days: [], spend: 0, imp: 0, clk: 0, buy: 0 };
    const day = r.date.toISOString().slice(0, 10);
    a.days.push({ day, impressions: r.impressions, clicks: r.clicks });
    if (day >= range.from && day <= range.to) {
      a.spend += r.spendStoreMinor;
      a.imp += r.impressions;
      a.clk += r.clicks;
      a.buy += r.purchases;
    }
    byAd.set(r.adId, a);
  }
  const ads: CampaignAd[] = [...byAd.entries()]
    .map(([adId, a]) => {
      const f = fatigueOf(a.days, today, TIRED_DROP_PCT);
      return { id: adId, name: a.name, spendMinor: a.spend, impressions: a.imp, clicks: a.clk, purchases: a.buy, ctrNow: f.now, dropPct: f.dropPct, tired: f.tired };
    })
    .sort((a, b) => Number(b.tired) - Number(a.tired) || b.spendMinor - a.spendMinor);

  // where it sold and what it sold (delivered orders of the period)
  const ww = await campaignWhereWhat(deps.db, S, id, range, timeZone).catch(() => ({ districts: [], products: [] }));
  const dIds = ww.districts.filter((d) => d.key).slice(0, TOP).map((d) => d.key);
  const pIds = ww.products.slice(0, TOP).map((p) => p.key);
  const [areas, prods] = await Promise.all([
    dIds.length ? deps.db.geoArea.findMany({ where: { id: { in: dIds } }, select: { id: true, nameEn: true } }) : Promise.resolve([]),
    pIds.length ? deps.db.product.findMany({ where: { id: { in: pIds }, storeId: S }, select: { id: true, nameEn: true } }) : Promise.resolve([]),
  ]);
  const aName = new Map(areas.map((a) => [a.id, a.nameEn]));
  const pName = new Map(prods.map((p) => [p.id, p.nameEn]));
  return {
    ...base,
    found: true,
    name: camp.name,
    platform: String(camp.adAccount.platform),
    status: camp.status,
    dailyBudgetMinor: camp.dailyBudgetMinor,
    currency: camp.currency,
    now,
    prev,
    ads,
    days,
    districts: ww.districts.filter((d) => d.key && aName.has(d.key)).slice(0, TOP).map((d) => ({ name: aName.get(d.key) as string, delivered: d.delivered })),
    products: ww.products.filter((p) => pName.has(p.key)).slice(0, TOP).map((p) => ({ name: pName.get(p.key) as string, pieces: p.pieces })),
  };
}
