// S11 · PR 238 (Blueprint C4.1 "50% of total sales from organic", C4 build list 5 "organic revenue dashboard — organic
// share of sales against the target, broken down by source: Google, Bing, YouTube, AI assistants") — the period's Sales
// (delivered orders on their delivered day, the one Sales rule) split into organic and the rest by Profit by channel's
// own rule (channels.ts `channelOf`: no ad click, no paid medium, a website or landing-page order), and the organic
// orders named by where they came from (organic-sources.ts): each listed search engine, video site and AI assistant,
// other sites, and "not known" (the visit carried no tag and no address the shop kept). Read-only, store-scoped.
import { channelOf, type ChannelRules } from './channels';
import { basisWhere, type Db } from './metrics';
import { organicOriginOf, type OrganicKind, type OrganicSource } from './organic-sources';
import { daysPeriod } from './pure';

export interface OrganicFigure {
  orders: number;
  salesMinor: number;
}

export interface OrganicRow extends OrganicFigure {
  /** `site:<index in the setting>`, `otherSite` or `notKnown`. */
  key: string;
  /** The listed site's name; null for the other two rows. */
  name: string | null;
  kind: OrganicKind | 'otherSite' | 'notKnown';
}

export interface OrganicReport {
  from: string;
  to: string;
  /** Every Sales order of the period, and the organic ones. */
  all: OrganicFigure;
  organic: OrganicFigure;
  /** Organic Sales ÷ all Sales in %, one decimal; null with no Sales. */
  sharePct: number | null;
  /** Organic by kind (search, video, AI assistants). */
  kinds: Record<OrganicKind, OrganicFigure>;
  /** Organic orders by where they came from, by Sales (sites with no order are left out). */
  rows: OrganicRow[];
}

const none = (): OrganicFigure => ({ orders: 0, salesMinor: 0 });
const add = (f: OrganicFigure, minor: number) => {
  f.orders += 1;
  f.salesMinor += minor;
};
export const pctOf = (part: number, whole: number) => (whole <= 0 ? null : Math.round((part * 1000) / whole) / 10);

type Signal = { source: string; adPlatform: string | null; campaignPlatform: string | null; utmSource: string | null; utmMedium: string | null; referrer: string | null; total: bigint | number };

/** Splits the period's Sales orders (exported for the rule's own tests). */
export function organicOf(orders: readonly Signal[], sources: readonly OrganicSource[], rules: ChannelRules, days: { from: string; to: string }): OrganicReport {
  const all = none();
  const organic = none();
  const kinds: Record<OrganicKind, OrganicFigure> = { search: none(), video: none(), ai: none() };
  const rows = new Map<string, OrganicRow>();
  for (const o of orders) {
    const minor = Number(o.total);
    add(all, minor);
    if (channelOf(o, rules) !== 'organic') continue;
    add(organic, minor);
    const at = organicOriginOf(o, sources);
    const key = typeof at === 'string' ? at : `site:${at.site}`;
    const site = typeof at === 'string' ? null : sources[at.site]!;
    if (site) add(kinds[site.kind], minor);
    const row = rows.get(key) ?? rows.set(key, { key, name: site?.name ?? null, kind: site?.kind ?? (at as 'otherSite' | 'notKnown'), ...none() }).get(key)!;
    add(row, minor);
  }
  const last = (r: OrganicRow) => (r.kind === 'notKnown' ? 2 : r.kind === 'otherSite' ? 1 : 0);
  const sorted = [...rows.values()].sort((a, b) => last(a) - last(b) || b.salesMinor - a.salesMinor || b.orders - a.orders || a.key.localeCompare(b.key));
  return { from: days.from, to: days.to, all, organic, sharePct: pctOf(organic.salesMinor, all.salesMinor), kinds, rows: sorted };
}

/** Organic Sales of one store over the days `from`–`to` (the store's own days). */
export async function organicSales(db: Db, storeId: number, days: { from: string; to: string }, timeZone: string, sources: readonly OrganicSource[], rules: ChannelRules): Promise<OrganicReport> {
  const period = daysPeriod(days.from, days.to, timeZone);
  const orders = await db.$queryRaw<Signal[]>`
    SELECT o."source"::text AS "source", o."adPlatform", a."platform"::text AS "campaignPlatform", o."utmSource", o."utmMedium", o."referrer", o."totalMinor" AS "total"
      FROM "Order" o
      LEFT JOIN "AdCampaign" c ON c."id" = o."adCampaignId" AND c."storeId" = o."storeId"
      LEFT JOIN "AdAccount" a ON a."id" = c."adAccountId" AND a."storeId" = o."storeId"
     WHERE ${basisWhere('sales', storeId, period)}`;
  return organicOf(orders, sources, rules, days);
}
