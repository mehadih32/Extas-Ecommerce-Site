// Parity round 3, lane F6 · PR 865 (prototype v5 Marketing › Plan & ideas, js/m-marketing.js `renderPlan`) — what the Plan page shows
// beyond the channel plan and the district table: the profit per order of each district, the running campaigns a plan would
// change (so "Use this plan" can ask for each one's new daily budget), creative ideas worked out from the shop's own figures, and the
// competitor links the owner follows. Read-only. Ideas are drawn from what really sold and what really works — never a fixed list —
// and the words come from the messages files. Nothing here changes a budget; the page's button sends each change through the
// campaign controls (lower now, higher waits for the owner).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adDeliveredReturn, contributionByDistrict } from '@extas/metrics';
import type { AdminDeps } from '../admin-auth';
import { profitInputs } from '../order-profit-view';
import { t, type Dict } from '../i18n';
import { calendarOverview, type CalendarDeps } from './calendar';
import { intelScreen } from './intel';
import type { OverviewDeps, PlanData } from './overview';
import { marketingOverview } from './overview';
import { resolvePeriod, type PeriodKey } from '../lane-f/period';

const S = MOTHER_STORE_ID;
const IDEAS_MAX = 5; // hardcode-ok: a list length
const WATCH_MAX = 5; // hardcode-ok: a list length
const SOON_DAYS = 21; // hardcode-ok: how far ahead a countdown post idea looks (a rule of thumb shown by the idea itself)

export interface PlanCampaign {
  id: string;
  name: string;
  platform: string;
  dailyBudgetMinor: number;
  currency: string;
}
export interface PlanIdea {
  key: string;
  tag: 'Carousel' | 'Reel' | 'Post';
  en: string;
  bn: string;
  /** The day a calendar line for it would start. */
  startsOn: string;
  /** Already a line on the owner's plan calendar with these words. */
  onCalendar: boolean;
}
export interface PlanExtras {
  /** District id → profit per delivered, costed order in minor units (null: none costed). */
  profitPerOrder: Map<string, number | null>;
  campaigns: PlanCampaign[];
  ideas: PlanIdea[];
  /** The calendar's own switch: an idea is added to it only while it is on. */
  calendarOn: boolean;
  competitors: { id: string; name: string; lastRunAt: string | null; change: string | null; matched: number }[];
  /** Currency of the shop. */
  currency: string;
}

const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10); // hardcode-ok: ms in a day

export async function planExtras(deps: Pick<OverviewDeps, 'db' | 'resolver' | 'now'> & AdminDeps, p: PlanData, period: PeriodKey, dicts: { en: Dict; bn: Dict }): Promise<PlanExtras> {
  const costs = await profitInputs(deps.resolver as never, S);
  const [profit, campaigns, overview, ret, cal, intel] = await Promise.all([
    contributionByDistrict(deps.db, S, { from: p.from, to: p.to }, costs).catch(() => new Map()),
    deps.db.adCampaign.findMany({ where: { storeId: S, archivedAt: null, dailyBudgetMinor: { not: null } }, select: { id: true, name: true, status: true, dailyBudgetMinor: true, currency: true, adAccount: { select: { platform: true } } }, take: 500 }), // hardcode-ok: a list guard
    marketingOverview(deps, period).catch(() => null),
    adDeliveredReturn(deps.db, S, { from: p.from, to: p.to }, { currency: p.currency, timeZone: p.timeZone }).catch(() => null),
    calendarOverview(deps as unknown as CalendarDeps, { always: true }).catch(() => null),
    intelScreen(deps.db, deps.resolver).catch(() => null),
  ]);
  const profitPerOrder = new Map<string, number | null>();
  for (const [k, v] of profit) profitPerOrder.set(k, v.costed > 0 ? Math.round(v.contributionMinor / v.costed) : null);

  const running = campaigns.filter((c) => /^(ACTIVE|ENABLED|RUNNING|LIVE|ON)$/i.test(c.status) && c.dailyBudgetMinor !== null).map((c) => ({ id: c.id, name: c.name, platform: String(c.adAccount.platform), dailyBudgetMinor: c.dailyBudgetMinor as number, currency: c.currency }));

  // ideas: the best-selling products of the ad orders, the campaign that works best, the next calendar event
  const today = resolvePeriod('today', p.today).from;
  const planTitles = new Set((cal?.plans ?? []).map((x) => x.title));
  const ideas: PlanIdea[] = [];
  const names = new Map<string, string>();
  const top = (ret?.products ?? []).filter((x) => x.deliveredSalesMinor > 0).slice(0, 2);
  if (top.length) {
    const found = await deps.db.product.findMany({ where: { id: { in: top.map((x) => x.key) }, storeId: S }, select: { id: true, nameEn: true } });
    for (const f of found) names.set(f.id, f.nameEn);
  }
  const mk = (key: string, tag: PlanIdea['tag'], id: string, vars: Record<string, string>, startsOn: string): PlanIdea => {
    const en = t(dicts.en, `lf6.plan.idea.${id}`, vars);
    const bn = t(dicts.bn, `lf6.plan.idea.${id}`, vars);
    return { key, tag, en, bn, startsOn, onCalendar: planTitles.has(en) };
  };
  for (const x of top) {
    const name = names.get(x.key);
    if (name) ideas.push(mk(`carousel:${x.key}`, 'Carousel', 'carousel', { name }, addDay(today, 3))); // hardcode-ok: the prototype puts a new idea three days ahead
  }
  const best = (overview?.campaigns ?? []).filter((c) => c.spendMinor > 0 && c.perTk !== null).sort((a, b) => (b.perTk ?? 0) - (a.perTk ?? 0))[0];
  if (best) ideas.push(mk(`reel:${best.id}`, 'Reel', 'reel', { name: best.name }, addDay(today, 5))); // hardcode-ok: a few days ahead
  const soon = (cal?.items ?? []).filter((i) => (i.lane === 'festive' || i.lane === 'home') && i.starts > today && i.starts <= addDay(today, SOON_DAYS)).sort((a, b) => a.starts.localeCompare(b.starts))[0];
  if (soon) ideas.push(mk(`post:${soon.id}`, 'Post', 'post', { name: soon.title.en }, addDay(today, 1)));

  const competitors = (intel?.links ?? [])
    .filter((l) => !l.archived)
    .slice(0, WATCH_MAX)
    .map((l) => ({ id: l.id, name: l.name, lastRunAt: l.lastRunAt, change: l.change, matched: l.matched }));
  return { profitPerOrder, campaigns: running, ideas: ideas.slice(0, IDEAS_MAX), calendarOn: cal?.settings.enabled === true, competitors, currency: p.currency };
}
