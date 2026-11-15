// S28 · PR 699 (CN-048; prototype v5 Marketing › Plan & ideas; gap M4) — Marketing › Plan at /admin/marketing/plan: a channel
// budget plan from delivered sales per Tk 1 (a share of the weakest channel's budget suggested for the strongest) and the
// calendar's two warnings: campaigns or ads running at the same time, and stock running low while something is running.
// ADVICE ONLY: nothing here moves a budget or touches an ad account. Seeing needs `marketing.campaigns.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { marketingPlan } from '@/lib/marketing/overview';
import { salesByArea } from '@extas/metrics';
import { Delta, PeriodBar, deltaPct } from '@/components/admin/lane-f/Parts';
import { IdeaButton, UsePlan, type PlanChange } from '@/components/admin/lane-f/PlanActions';
import { AdControlDecide } from '@/components/admin/marketing/AdControlControls';
import { withLaneF } from '@/lib/admin-lane-f';
import { withLaneF6 } from '@/lib/admin-lane-f6';
import { growthOverview, type ProposalView } from '@/lib/marketing/growth-agent';
import { planExtras } from '@/lib/marketing/plan-extras';
import { t as tr, type Dict } from '@/lib/i18n';
import adBn from '../../../../../messages/admin-ad-platforms.bn.json';
import adEn from '../../../../../messages/admin-ad-platforms.en.json';
import f6Bn from '../../../../../messages/admin-lane-f6.bn.json';
import f6En from '../../../../../messages/admin-lane-f6.en.json';
import '../../../../components/admin/lane-f/lane-f6.css';
import { PERIOD_KEYS, periodKey } from '@/lib/lane-f/period';
import { moneyOf, numOf, perOf, symbolOf } from '@/lib/lane-f/format';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingPlan';
const HERE = '/admin/marketing/plan';
const GROWTH_API = '/api/admin/marketing/ad-platforms/growth';
const CONTROL_API = '/api/admin/marketing/ad-platforms/control';
const CALENDAR_API = '/api/admin/marketing/calendar';
/** A district needs this many finished orders (delivered or returned) before its return rate advises anything. */
const DISTRICT_MIN = 3; // hardcode-ok: the prototype's own floor
/** Return rates above these two lines turn the advice to "ask the delivery charge first" and "avoid COD-only ads" (prototype rule). */
const RETURN_WARN = 0.15; // hardcode-ok: prototype rule
const RETURN_BAD = 0.25; // hardcode-ok: prototype rule
const TONE = { SCALE: 'ok', KEEP: 'ok', FIX: 'warn', STOP: 'bad', NONE: '' } as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.plan.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MarketingPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID), searchParams]);
  const base = withLaneF6(withLaneF(withW5a(plain)));
  const view = { ...base, dict: { ...base.dict, ...((base.lang === 'bn' ? adBn : adEn) as unknown as Dict) } };
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="mkt-plan" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.plan.${k}`, v);
  const f = (k: string, v?: Record<string, string | number>) => t(d, `lf.${k}`, v);
  const period = periodKey(sp.period);
  const p = await marketingPlan(access.deps, period);
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const [ex, growth] = await Promise.all([
    planExtras(access.deps, p, period, { en: f6En as unknown as Dict, bn: f6Bn as unknown as Dict }),
    growthOverview({ db: access.deps.db, resolver: access.deps.resolver }, lang).catch(() => null),
  ]);
  const canApprove = access.guard.permissions?.has('marketing.ads.approve') ?? false;
  const canControl = access.guard.permissions?.has('marketing.ads.control') ?? false;
  const canCal = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const controlOn = await access.deps.resolver.value('ads.campaignControl', { storeId: MOTHER_STORE_ID }).then((v) => (v as { on?: boolean }).on === true);
  const pl = (k: string, v?: Record<string, string | number>) => t(d, `lf6.plan.${k}`, v);
  const gr = (k: string, v?: Record<string, string | number>) => t(d, `adp.growth.${k}`, v);
  const areas = await salesByArea(access.deps.db, MOTHER_STORE_ID, { from: p.from, to: p.to }, { timeZone: p.timeZone, level: 'district' }).catch(() => null);
  const cur = symbolOf(p.currency);
  const money = (minor: number | null) => moneyOf(minor, p.currency);
  const scale = 30 / p.days; // hardcode-ok: the plan is shown per 30-day month
  const plan = p.rows.map((r) => ({ ...r, now: Math.round(r.spendMinor * scale), next: Math.round((r.spendMinor + r.moveMinor) * scale) }));
  const nowTotal = plan.reduce((a, r) => a + r.now, 0);
  const nextTotal = plan.reduce((a, r) => a + r.next, 0);
  const moves = p.rows.some((r) => r.moveMinor !== 0);
  const districts = (areas?.rows ?? [])
    .map((r) => ({ id: r.areaId, name: r.nameEn, orders: r.delivered + r.returned, rate: r.returnRate ?? 0 }))
    .filter((r) => r.orders >= DISTRICT_MIN)
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10); // hardcode-ok: a short list
  const advice = (rate: number) => (rate > RETURN_BAD ? 'bad' : rate > RETURN_WARN ? 'warn' : 'good');

  const shopMoney = (v: number | null) => (v === null ? gr('unknown') : moneyOf(v, p.currency));
  const pctOf = (v: number | null) => (v === null ? gr('unknown') : `${numOf(v, 0)}%`);
  const propWhat = (x: ProposalView) => {
    const cc = growth?.campaignCurrency[x.refId] ?? x.currency;
    return gr(`type.${x.type}`, { name: x.name ?? gr('gone'), from: x.fromDailyMinor === null ? '' : moneyOf(x.fromDailyMinor, cc), to: x.toDailyMinor === null ? '' : moneyOf(x.toDailyMinor, cc) });
  };
  const propWhy = (x: ProposalView) => {
    const limit = growth ? pctOf(x.type === 'lowerBudget' ? growth.card.value.poorRoasPercent : growth.card.value.goodRoasPercent) : '';
    return gr(`why.${x.type}`, { spend: shopMoney(x.spendMinor), from: x.from, to: x.to, roas: pctOf(x.roasPercent), before: pctOf(x.beforeRoasPercent), limit, delivered: numOf(x.delivered), sales: shopMoney(x.deliveredSalesMinor) });
  };
  const decideErr = { ...Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, t(d, `adp.err.${k}`)])), ...Object.fromEntries(['CONTROL_OFF', 'CHANGED', 'WAITING', 'DECIDED', 'EXPIRED'].map((k) => [k, gr(`err.${k}`)])) };
  // "Use this plan": each running campaign of a channel whose budget moves gets the channel's own ratio of next to now
  const changes: PlanChange[] = [];
  for (const r of plan) {
    if (r.now <= 0 || r.next === r.now) continue;
    for (const c of ex.campaigns.filter((x) => `ads:${x.platform}` === r.key)) {
      const to = Math.max(1, Math.round((c.dailyBudgetMinor * r.next) / r.now));
      if (to !== c.dailyBudgetMinor) changes.push({ adCampaignId: c.id, toMinor: to });
    }
  }
  const calErr = Object.fromEntries(['SWITCHED_OFF', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, pl(`calErr.${k}`)]));

  return (
    <div className="a2-z" data-testid="mkt-plan" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={f('pl.title')} sub={f('pl.sub')} right={<Link className="a2-btn sm" href="/admin/marketing/overview">{c('back')}</Link>} />
      <SectionTabs view={view} current={KEY} />
      <PeriodBar current={period} note={f('per.vs')} items={PERIOD_KEYS.map((k) => ({ key: k, label: f(`per.${k}`), href: `${HERE}?period=${k}` }))} />
      <div className="a2-note a2-mt12">{c('advice')}</div>
      <section className="a2-card a2-mt12" data-testid="mkt-plan-proposals">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {pl('propH', { n: growth?.waiting.length ?? 0 })}
        </h2>
        {growth && (growth.waiting.length || growth.recent.length) ? (
          <div>
            {growth.waiting.map((x) => (
              <div className="lf6-prop" key={x.id} data-testid="mkt-proposal" data-type={x.type}>
                <div className="tx">
                  <b>{propWhat(x)}</b>
                  <div className="a2-xs a2-mute">{propWhy(x)}</div>
                </div>
                {canApprove ? (
                  <AdControlDecide url={GROWTH_API} id={x.id} what={propWhat(x)} texts={{ approve: gr('approve'), reject: pl('no'), confirmApprove: gr('confirmApprove'), confirmReject: gr('confirmReject'), yes: gr('yes'), cancel: gr('cancel'), said: Object.fromEntries(['APPROVED', 'REJECTED', 'PRACTICE', 'APPLIED', 'FAILED'].map((k) => [k, gr(`said.${k}`)])), err: decideErr }} />
                ) : (
                  <span className="a2-xs a2-mute">{pl('propOwner')}</span>
                )}
              </div>
            ))}
            {growth.recent.slice(0, 5).map((x) => (
              <div className="lf6-prop" key={x.id} data-testid="mkt-proposal-done">
                <div className="tx">
                  <b>{propWhat(x)}</b>
                  <div className="a2-xs a2-mute">{propWhy(x)}</div>
                </div>
                <span className={`a2-pill ${x.status === 'APPROVED' || x.outcome === 'APPLIED' || x.outcome === 'PRACTICE' ? 'ok' : ''}`}>{x.status === 'APPROVED' || x.outcome === 'APPLIED' || x.outcome === 'PRACTICE' ? pl('approved') : pl('declined')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="a2-sm a2-mute">{pl('propNone')}</p>
        )}
        <p className="a2-xs a2-mute a2-mt6">
          {pl('propNote')}{' '}
          <Link className="a2-lnk" href="/admin/marketing/ad-platforms/growth">
            {pl('propLink')}
          </Link>
        </p>
      </section>
      <div className="lf-grid lf-g2 a2-mt12">
        <section className="a2-card" data-testid="mkt-plan-channels">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {f('pl.budget')}
          </h2>
          {plan.length ? (
            <div className="a2-tblw">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{f('pl.colChannel')}</th>
                    <th className="r">{f('pl.colPer', { cur })}</th>
                    <th className="r">{f('pl.colNow')}</th>
                    <th className="r">{f('pl.colNext')}</th>
                    <th>{c('colVerdict')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((r) => (
                    <tr key={r.key} data-testid="mkt-plan-row">
                      <td>
                        <b>{r.key}</b>
                      </td>
                      <td className="r a2-num">{perOf(r.perTk, p.currency)}</td>
                      <td className="r a2-num">{money(r.now)}</td>
                      <td className="r a2-num">
                        <b>{money(r.next)}</b> <Delta pct={deltaPct(r.next, r.now)} />
                      </td>
                      <td>
                        <span className={`a2-pill ${TONE[r.verdict]}`}>{c(`v_${r.verdict}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute">{c('noChannels')}</p>
          )}
          {plan.length ? (
            <div className="lf-bar a2-mt12">
              <span className="a2-sm">{f('pl.total', { now: money(nowTotal), next: money(nextTotal) })}</span>
              <UsePlan url={CONTROL_API} changes={changes} from={money(nowTotal)} to={money(nextTotal)} disabled={!canControl || !controlOn} texts={{ go: pl('use'), confirm: pl('useConfirm'), yes: gr('yes'), cancel: gr('cancel'), done: pl('useDone'), none: pl('useNone'), err: pl('useErr') }} />
            </div>
          ) : null}
          {plan.length && (!canControl || !controlOn) ? <p className="a2-xs a2-mute a2-mt6">{pl('useOff')}</p> : null}
          <p className="a2-xs a2-mute a2-mt6">{moves ? c('moveNote', { pct: p.thresholds.shiftPct }) : c('noMove')}</p>
        </section>
        <section className="a2-card" data-testid="mkt-plan-districts">
          <h2 className="a2-h3">{f('pl.district')}</h2>
          <p className="a2-xs a2-mute" style={{ marginBottom: 10 }}>
            {f('pl.districtSub')}
          </p>
          {districts.length ? (
            <div className="a2-tblw">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{f('pl.colDistrict')}</th>
                    <th className="r">{f('pl.colOrders')}</th>
                    <th className="r">{f('pl.colReturn')}</th>
                    <th className="r">{pl('colProfit')}</th>
                    <th>{f('pl.colAdvice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map((r) => (
                    <tr key={r.id} data-testid="mkt-district-row">
                      <td>
                        <b>{r.name}</b>
                      </td>
                      <td className="r a2-num">{numOf(r.orders)}</td>
                      <td className="r a2-num">{numOf(r.rate * 100, 0)}%</td>
                      <td className="r a2-num">{money(ex.profitPerOrder.get(r.id) ?? null)}</td>
                      <td>
                        <span className={`a2-pill ${advice(r.rate)}`}>{f(`pl.adv.${advice(r.rate)}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute">{f('pl.districtNone')}</p>
          )}
        </section>
        <section className="a2-card" data-testid="mkt-plan-ideas">
          <h2 className="a2-h3">{f('pl.ideas')}</h2>
          {ex.ideas.length ? (
            <div className="a2-mt6">
              {ex.ideas.map((i) => (
                <div className="lf6-li" key={i.key} data-testid="mkt-idea">
                  <span className="a2-pill info">{pl(`tag.${i.tag}`)}</span>
                  <div className="grow">{view.lang === 'bn' ? i.bn : i.en}</div>
                  <IdeaButton url={CALENDAR_API} idea={{ title: i.en, titleBn: i.bn, starts: i.startsOn }} on={i.onCalendar} disabled={!canCal || !ex.calendarOn} texts={{ add: pl('addCal'), added: pl('onCal'), err: calErr }} />
                </div>
              ))}
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{pl('ideasNone')}</p>
          )}
          {!ex.calendarOn ? <p className="a2-xs a2-mute a2-mt6">{pl('calOff')}</p> : null}
          <Link className="a2-btn sm a2-mt12" href="/admin/marketing/ad-platforms/briefs" data-testid="mkt-ideas-more">
            ✦ {pl('moreIdeas')}
          </Link>
        </section>
        <section className="a2-card" data-testid="mkt-plan-comp">
          <h2 className="a2-h3">{f('pl.comp')}</h2>
          <p className="a2-xs a2-mute">{f('pl.compSub')}</p>
          {ex.competitors.length ? (
            <div className="a2-mt6">
              {ex.competitors.map((x) => (
                <div className="lf6-li" key={x.id} data-testid="mkt-comp">
                  <div className="grow">
                    <b>{x.name}</b>
                    <div className="a2-xs a2-mute">{x.lastRunAt ? pl(`compChange.${x.change ?? 'none'}`, { n: x.matched }) : pl('compNever')}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{f('pl.compBody')}</p>
          )}
          <Link className="a2-btn sm a2-mt12" href="/admin/marketing/intel">
            {f('pl.compGo')}
          </Link>
        </section>
      </div>
      <section className="a2-card a2-mt12" data-testid="mkt-plan-overlap">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('overlap')}
        </h2>
        {p.overlaps.length ? (
          <ul className="cr-rows" style={{ marginTop: 0 }}>
            {p.overlaps.map((x, i) => (
              <li key={i} data-testid="mkt-overlap-row">
                <div>{c('overlapRow', { a: x.a, b: x.b })}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{c('noOverlap')}</p>
        )}
        <Link className="cr-link" href="/admin/marketing/calendar">
          {c('toCalendar')}
        </Link>
      </section>
      <section className="a2-card a2-mt12" data-testid="mkt-plan-stock">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('stock')}
        </h2>
        {p.lowStockAt <= 0 ? (
          <p className="a2-sm a2-mute">{c('stockOff')}</p>
        ) : p.lowStock.length ? (
          <>
            {p.hasUpcoming ? <p className="a2-sm">{c('stockWarn', { n: p.lowStockAt })}</p> : <p className="a2-sm a2-mute">{c('stockQuiet', { n: p.lowStockAt })}</p>}
            <ul className="cr-rows" style={{ marginTop: 6 }}>
              {p.lowStock.map((x) => (
                <li key={x.id} data-testid="mkt-stock-row">
                  <div>
                    <b>{x.name}</b> · {c('left', { n: x.available })}
                  </div>
                  <Link className="cr-link" href={`/admin/products/${x.id}`}>
                    {c('open')}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="a2-sm a2-mute">{c('noStock')}</p>
        )}
      </section>
    </div>
  );
}
