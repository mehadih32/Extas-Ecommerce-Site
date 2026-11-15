// Parity round 3, lane F6 · PR 865 (prototype v5 Marketing › Ad campaigns › one campaign) — /admin/marketing/campaigns/ad/<id>: the
// campaign's verdict, who counts its orders (the platform, we, delivered), the ads inside it (a fallen click rate = tired), the days,
// the funnel, where and what it sold, and Pause / Resume, Duplicate and Change budget. Seeing needs `marketing.campaigns.read`;
// the buttons need `marketing.ads.control` and go through the campaign controls (a pause or a lower budget after a confirm; Resume and a
// higher budget wait for the owner's approval; Duplicate makes a draft that has its own launch approval). Guide:
// docs/admin-guide/pages/marketing/ad-campaign.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AdCampaignActions, type ActionTexts } from '@/components/admin/lane-f/AdCampaignActions';
import { AiLine, Delta, GuideNote, PeriodBar, TwoLines, deltaPct } from '@/components/admin/lane-f/Parts';
import { BarList } from '@/components/admin/reports/ReportCharts';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { withLaneF } from '@/lib/admin-lane-f';
import { withLaneF6 } from '@/lib/admin-lane-f6';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { PERIOD_KEYS, periodKey } from '@/lib/lane-f/period';
import { moneyOf, numOf, perOf, symbolOf } from '@/lib/lane-f/format';
import { adCampaignPage } from '@/lib/marketing/ad-campaign-one';
import bn from '../../../../../../../messages/admin-ad-platforms.bn.json';
import en from '../../../../../../../messages/admin-ad-platforms.en.json';
import '../../../../settings-cards.css';
import '../../../ad-platforms/ad-platforms.css';
import '../../../../../../components/admin/lane-f/lane-f6.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/marketing/campaigns';
const KEY = 'marketingAdCampaignOne';
const CONTROL_API = '/api/admin/marketing/ad-platforms/control';
const BUILDER_API = '/api/admin/marketing/ad-platforms/campaigns';
const RUNNING = /^(ACTIVE|ENABLED|RUNNING|LIVE|ON)$/i;
const TONE = { SCALE: 'ok', KEEP: 'info', FIX: 'warn', STOP: 'bad', NONE: '' } as const;

function withScreen(view: AdminView): AdminView {
  const v = withLaneF6(withLaneF(view));
  return { ...v, dict: { ...v.dict, ...((v.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'lf6.one.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdCampaignOnePage(props: Props) {
  const deps = adminDeps();
  const [{ id }, sp, plain] = await Promise.all([props.params, props.searchParams, adminView(deps)]);
  const here = `${LIST}/ad/${encodeURIComponent(id)}`;
  const access = await pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="ac1-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = (k: string, v?: Record<string, string | number>) => t(d, `lf6.one.${k}`, v);
  const f = (k: string, v?: Record<string, string | number>) => t(d, `lf.${k}`, v);
  const period = periodKey(sp.period);
  const p = await adCampaignPage(access.deps, id, period);
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="ac1-back">
      {o('back')}
    </Link>
  );
  if (!p.found)
    return (
      <div className="a2-z" data-testid="ac1-page" data-lm-ready="">
        <PageHead view={view} place={locateKey(KEY)} title={o('notFound')} crumb={crumb} />
        <SectionTabs view={view} current={KEY} />
        <p className="a2-sm a2-mute a2-mt12" data-testid="ac1-missing">
          {o('notFoundSub')}
        </p>
      </div>
    );
  const cur = p.storeCurrency;
  const sym = symbolOf(cur);
  const money = (m: number | null) => moneyOf(m, cur);
  const campMoney = (m: number | null) => moneyOf(m, p.currency);
  const paused = !RUNNING.test(p.status);
  const canControl = access.guard.permissions?.has('marketing.ads.control') ?? false;
  const [controlOn, builderOn] = await Promise.all([
    access.deps.resolver.value('ads.campaignControl', { storeId: MOTHER_STORE_ID }).then((v) => (v as { on?: boolean }).on === true),
    access.deps.resolver.value('ads.campaignBuilder', { storeId: MOTHER_STORE_ID }).then((v) => (v as { enabled?: boolean }).enabled === true),
  ]);
  const n = p.now;
  const pv = p.prev;
  const platName = f(`ac.chip.${p.platform}`) === `lf.ac.chip.${p.platform}` ? p.platform : f(`ac.chip.${p.platform}`);
  const cp = (k: string) => t(d, `adp.control.${k}`);
  const errs = Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, t(d, `adp.err.${k}`)]));
  const texts: ActionTexts = {
    pause: o('pause'),
    resume: o('resume'),
    duplicate: o('duplicate'),
    budget: o('changeBudget'),
    budgetH: o('budgetH'),
    budgetNow: o('budgetNow'),
    budgetLabel: o('budgetLabel'),
    budgetMin: o('budgetMin'),
    budgetSame: o('budgetSame'),
    next: o('next'),
    yes: cp('yes'),
    cancel: cp('cancel'),
    confirm: { pause: cp('confirm.pause'), resume: cp('confirm.resume'), down: cp('confirm.down'), up: cp('confirm.up'), duplicate: o('confirmDuplicate') },
    said: Object.fromEntries(['WAITING', 'PRACTICE', 'APPLIED', 'FAILED', 'REJECTED'].map((k) => [k, cp(`said.${k}`)])),
    err: { ...errs, OFF: cp('err.OFF'), WAITING: cp('err.WAITING'), BUILDER_OFF: cp('err.BUILDER_OFF') },
    duplicated: o('duplicated'),
    openDrafts: o('openDrafts'),
    needsControl: o('needsControl'),
  };
  const scale = 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2); // hardcode-ok: ISO default fraction digits
  const tone = TONE[n.verdict];
  const verdictName = o(`v_${n.verdict}`);
  const sub = `${platName}${p.dailyBudgetMinor ? ` · ${campMoney(p.dailyBudgetMinor)}${f('ac.day')}` : ''} · ${paused ? f('ac.paused') : f('ac.running')}`;
  const tired = p.ads.find((a) => a.tired);
  const dTot = p.districts.reduce((a, x) => a + x.delivered, 0) || 1;
  const funnel = [
    { key: 'clicks', label: o('fClicks'), value: n.clicks },
    { key: 'orders', label: o('fOrders'), value: n.orders },
    { key: 'delivered', label: o('fDelivered'), value: n.delivered },
  ];
  const profitCls = n.profitMinor === null ? '' : n.profitMinor < 0 ? 'lf6-neg' : 'lf6-pos';
  const href = (k: string) => `${here}?period=${k}`;
  return (
    <div className="a2-z" data-testid="ac1-page" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={p.name}
        sub={sub}
        crumb={crumb}
        right={
          <AdCampaignActions
            adCampaignId={p.id}
            name={p.name}
            paused={paused}
            dailyBudgetMinor={p.dailyBudgetMinor}
            scale={scale}
            currency={p.currency}
            locale={view.locale}
            controlUrl={CONTROL_API}
            builderUrl={BUILDER_API}
            draftsHref="/admin/marketing/ad-platforms/campaigns"
            canControl={canControl}
            controlOn={controlOn}
            builderOn={builderOn}
            texts={texts}
          />
        }
      />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note" data-testid="ac1-learn">
        <span>
          <b>{o('learnH')}</b> — {o('learnB', { platform: platName })}
        </span>
      </div>
      <PeriodBar current={period} note={f('per.vs')} items={PERIOD_KEYS.map((k) => ({ key: k, label: f(`per.${k}`), href: href(k) }))} />
      <p className="a2-xs a2-mute a2-mt6" data-testid="ac1-okpin">
        {o('okNote')}
      </p>

      <div className="lf-grid lf6-g3 lf-g3 a2-mt12">
        <section className="a2-card lf6-span2" data-testid="ac1-trio">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {o('whoH')}
          </h2>
          <div className="lf6-trio">
            <div>
              <span>{o('says', { platform: platName })}</span>
              <b>{numOf(n.claimed)}</b>
            </div>
            <div>
              <span>{o('ours')}</span>
              <b>{numOf(n.orders)}</b>
            </div>
            <div>
              <span>{o('delivered')}</span>
              <b className="lf6-pos">{numOf(n.delivered)}</b>
            </div>
          </div>
          <p className="a2-xs a2-mute a2-mt6">{o('whoNote')}</p>
        </section>
        <section className="a2-card" data-testid="ac1-verdict">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {o('verdictH')}
          </h2>
          <span className={`a2-pill ${tone}`}>{verdictName}</span>
          <p className="a2-sm a2-mt6">{o(`why_${n.verdict}`, { per: perOf(n.perTk, cur), cur: sym })}</p>
          <div className="lf6-rows a2-mt6">
            <div>
              <span>{o('spend')}</span>
              <b>{money(n.spendMinor)}</b> <Delta pct={deltaPct(n.spendMinor, pv.spendMinor)} inverse />
            </div>
            <div>
              <span>{o('sales')}</span>
              <b>{money(n.salesMinor)}</b>
            </div>
            <div>
              <span>{o('per', { cur: sym })}</span>
              <b>{perOf(n.perTk, cur)}</b> <Delta pct={deltaPct(n.perTk, pv.perTk)} />
            </div>
            <div>
              <span>{o('returned')}</span>
              <b>{numOf(n.returned)}</b>
            </div>
            <div>
              <span>{o('profit')}</span>
              <b className={profitCls}>{money(n.profitMinor)}</b>
            </div>
          </div>
        </section>
      </div>

      <section className="a2-card a2-mt12" data-testid="ac1-ads">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {o('adsH')}
        </h2>
        {p.ads.length ? (
          p.ads.map((a) => (
            <div className="lf6-ad" key={a.id} data-testid="ac1-ad" data-tired={a.tired ? 'yes' : 'no'}>
              <div className="tx">
                <b>{a.name}</b>
                <span>{o('adLine', { spend: money(a.spendMinor), clicks: numOf(a.clicks), buys: numOf(a.purchases), rate: a.ctrNow === null ? '–' : `${numOf(a.ctrNow, 1)}%` })}</span>
              </div>
              <span className={`a2-pill ${a.tired ? 'warn' : 'ok'}`}>{a.tired ? o('tired') : o('fine')}</span>
            </div>
          ))
        ) : (
          <p className="a2-sm a2-mute">{o('adsNone')}</p>
        )}
        {tired ? <AiLine testId="ac1-tired">{o('tiredAi', { name: tired.name, drop: numOf(tired.dropPct, 0) })}</AiLine> : null}
      </section>

      <div className="lf-grid lf6-g3 lf-g3 a2-mt12">
        <section className="a2-card lf6-span2" data-testid="ac1-daily">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {o('dailyH')}
          </h2>
          <TwoLines
            testId="ac1-daily-chart"
            labels={p.days.map((x) => x.day.slice(5))}
            series={[
              { name: o('dailySales'), tone: 'ok', values: p.days.map((x) => x.salesMinor) },
              { name: o('spend'), tone: 'ac', values: p.days.map((x) => x.spendMinor) },
            ]}
          />
        </section>
        <section className="a2-card" data-testid="ac1-funnel">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {o('funnelH')}
          </h2>
          <BarList testId="ac1-funnel-bars" items={funnel.map((x) => ({ key: x.key, label: x.label, value: x.value, shown: numOf(x.value) }))} />
          <p className="a2-xs a2-mute a2-mt6">{o('funnelNote')}</p>
        </section>
      </div>

      <div className="lf-grid lf6-g2 a2-mt12">
        <section className="a2-card" data-testid="ac1-where">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {o('whereH')}
          </h2>
          {p.districts.length ? <BarList testId="ac1-where-bars" items={p.districts.map((x) => ({ key: x.name, label: x.name, value: x.delivered, shown: `${numOf((x.delivered / dTot) * 100, 0)}%` }))} /> : <p className="a2-sm a2-mute">{o('noDelivered')}</p>}
        </section>
        <section className="a2-card" data-testid="ac1-what">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {o('whatH')}
          </h2>
          {p.products.length ? <BarList testId="ac1-what-bars" items={p.products.map((x) => ({ key: x.name, label: x.name, value: x.pieces, shown: numOf(x.pieces) }))} /> : <p className="a2-sm a2-mute">{o('noDelivered')}</p>}
        </section>
      </div>
      <GuideNote>{o('note')}</GuideNote>
    </div>
  );
}
