// S13 · PR 283 — Marketing › Report at /admin/marketing/report (register "Marketing report: spend, revenue, by channel, by
// campaign"; Blueprint C6.1 item 5 "per-campaign spend vs delivered revenue"; demo 93-admin-ads.js; ADMIN-ARCHITECTURE
// 4.8 More options): for any period (the money reports' one-press periods or two dates), what marketing cost (ad spend
// imported per day, message sends' cost) against Ordered value and Sales (delivered only), for the whole shop, by
// channel, by campaign and per message send, with delivered ROAS. Every figure is @extas/metrics `marketingReport`
// (lib/marketing/report.ts). Writes only `marketing.report` (registry v218, off as shipped). Seeing needs
// `marketing.campaigns.read`, changing `marketing.campaigns.write`. Guide: docs/admin-guide/pages/marketing/report.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { roasOf, type MarketingFigure } from '@extas/metrics';
import { REPORT_MAX_DAYS_MAX, REPORT_MAX_DAYS_MIN, REPORT_RESULT_DAYS_MAX, REPORT_RESULT_DAYS_MIN } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import { reportOverview } from '@/lib/marketing/report';
import bn from '../../../../../messages/admin-marketing-report.bn.json';
import en from '../../../../../messages/admin-marketing-report.en.json';
import '../../settings-cards.css';
import '../../money/money.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/report';
const API = '/api/admin/marketing/report';
const KEY = 'marketingReport';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'mr.metaTitle'), robots: { index: false, follow: false } };
}

export default async function MarketingReportPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await reportOverview({ db: access.deps.db, resolver: access.deps.resolver }, sp);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `mr.${k}`, vars);
  const money = moneyOf(o.currency, view.locale);
  const m = (minor: number | null) => (minor === null ? '—' : formatMoney(minor, money));
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const atText = (at: Date | string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: o.timeZone, numberingSystem: 'latn' }).format(new Date(at));
  const roas = (pct: number | null) => (pct === null ? g('noRoas') : g('roas', { x: `${(pct / 100).toFixed(2)}×` }));
  const named = (base: string, k: string) => {
    const w = t(d, `${base}.${k}`);
    return w === `${base}.${k}` ? k.replace(/^source:/, '') : w;
  };
  const line = (x: MarketingFigure) => g('line', { orders: x.orders, ordered: m(x.orderedMinor), delivered: x.delivered, sales: m(x.salesMinor) });
  const { q, notes } = o.period;
  const current =
    QUICK_PERIODS.find((p) => p === sp.period) ??
    QUICK_PERIODS.find((p) => {
      const x = quickPeriod(p, o.today);
      return x.from === q.from && x.to === q.to;
    });
  const err = Object.fromEntries(['INVALID_INPUT', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const c = (k: string) => g(`card.${k}`);
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: c('pairHelp'), err };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: c('on'), help: c('onHelp') },
    { kind: 'number', path: 'maxDays', label: c('maxDays'), help: c('maxDaysHelp'), min: REPORT_MAX_DAYS_MIN, max: REPORT_MAX_DAYS_MAX },
    { kind: 'number', path: 'resultDays', label: c('resultDays'), help: c('resultDaysHelp'), min: REPORT_RESULT_DAYS_MIN, max: REPORT_RESULT_DAYS_MAX },
  ];
  const r = o.report;

  return (
    <div className="a2-z" data-testid="mr-page" data-from={q.from} data-to={q.to}>
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      {!r ? (
        <section className="a2-card a2-mt12" data-testid="mr-off">
          <h2 className="a2-h3">{g('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{g(canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : (
        <>
          <nav className="ct-actions a2-mt12" aria-label={g('quick.label')} data-testid="mr-quick">
            {QUICK_PERIODS.map((p) => (
              <Link key={p} className={`a2-btn${current === p ? ' pri' : ''}`} href={`${HERE}?period=${p}`} aria-current={current === p ? 'true' : undefined} data-testid={`mr-quick-${p}`}>
                {g(`quick.${p}`)}
              </Link>
            ))}
          </nav>
          <form className="a2-card a2-mt12" action={HERE} method="get" aria-label={g('form.label')} data-testid="mr-form">
            <div className="ct-grid">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor="mr-from">
                  {g('form.from')}
                </label>
                <input id="mr-from" name="from" type="date" className="a2-inp" max={o.today} defaultValue={q.from} />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor="mr-to">
                  {g('form.to')}
                </label>
                <input id="mr-to" name="to" type="date" className="a2-inp" max={o.today} defaultValue={q.to} />
              </div>
            </div>
            <button type="submit" className="a2-btn pri a2-mt12">
              {g('form.show')}
            </button>
          </form>
          <p className="a2-xs a2-mute a2-mt12" data-testid="mr-period">
            {g('period', { from: dayText(q.from), to: dayText(q.to) })}
          </p>
          {notes
            .filter((n) => n !== 'byMonth')
            .map((n) => (
              <p key={n} className="a2-xs bk-warn" data-testid={`mr-note-${n}`}>
                {g(`notes.${n}`, { days: o.settings.maxDays })}
              </p>
            ))}

          <div className="a2-kpis a2-mt12" data-testid="mr-kpis">
            <div className="a2-kpi" data-testid="mr-kpi-spend">
              <span className="a2-xs a2-mute">{g('kpi.spend')}</span>
              <b className="a2-kv">{m(r.spendMinor)}</b>
              <span className="a2-xs a2-mute">{r.spendMinor === null ? g('kpi.spendUnknown') : r.adsImported ? g('kpi.spendSub', { ads: m(r.adSpendMinor), msg: m(r.messageSpendMinor) }) : g('kpi.spendNone')}</span>
            </div>
            <div className="a2-kpi" data-testid="mr-kpi-ordered">
              <span className="a2-xs a2-mute">{g('kpi.ordered')}</span>
              <b className="a2-kv">{m(r.shop.orderedMinor)}</b>
              <span className="a2-xs a2-mute">{g('kpi.orderedSub', { n: r.shop.orders })}</span>
            </div>
            <div className="a2-kpi" data-testid="mr-kpi-sales">
              <span className="a2-xs a2-mute">{g('kpi.sales')}</span>
              <b className="a2-kv">{m(r.shop.salesMinor)}</b>
              <span className="a2-xs a2-mute">{g('kpi.salesSub', { n: r.shop.delivered })}</span>
            </div>
            <div className="a2-kpi" data-testid="mr-kpi-roas">
              <span className="a2-xs a2-mute">{g('kpi.roas')}</span>
              <b className="a2-kv">{r.roasPercent === null ? '—' : `${(r.roasPercent / 100).toFixed(2)}×`}</b>
              <span className="a2-xs a2-mute">{g('kpi.roasSub')}</span>
            </div>
          </div>

          <section className="a2-card a2-mt12" aria-labelledby="mr-ch-h" data-testid="mr-channels">
            <h2 className="a2-h3" id="mr-ch-h">
              {g('ch.h')}
            </h2>
            <p className="a2-cs">{g('ch.sub')}</p>
            {r.channels.length ? null : <p className="a2-xs a2-mute">{g('ch.empty')}</p>}
            {r.channels.map((x) => (
              <div key={x.key} className="a2-rule" data-testid="mr-ch-row" data-key={x.key}>
                <span>
                  <b>{named('mr.channel', x.key)}</b>
                  <span className="a2-xs a2-mute cl-sub">{line(x)}</span>
                  {x.kind === 'ads' ? <span className={`a2-xs cl-sub${x.spendMinor === null ? ' bk-warn' : ' a2-mute'}`}>{x.spendMinor === null ? g('spendUnknown') : g('spend', { spend: m(x.spendMinor) })}</span> : null}
                </span>
                <b className="a2-sm">{x.kind === 'ads' ? roas(x.roasPercent) : m(x.salesMinor)}</b>
              </div>
            ))}
          </section>

          <section className="a2-card a2-mt12" aria-labelledby="mr-camp-h" data-testid="mr-campaigns">
            <h2 className="a2-h3" id="mr-camp-h">
              {g('camp.h')}
            </h2>
            <p className="a2-cs">{g('camp.sub')}</p>
            {r.campaigns.length ? null : <p className="a2-xs a2-mute">{g('camp.empty')}</p>}
            {r.campaigns.map((x) => {
              const cn = o.campaigns[x.id];
              return (
                <div key={x.id} className="a2-rule" data-testid="mr-camp-row" data-id={x.id}>
                  <span>
                    <Link className="a2-lnk" href={`/admin/marketing/campaigns/${x.id}`}>
                      <b>{cn?.name ?? g('camp.unnamed')}</b>
                    </Link>
                    {cn?.archived ? <span className="a2-pill line">{g('camp.archived')}</span> : null}
                    <span className="a2-xs a2-mute cl-sub">{line(x)}</span>
                    <span className={`a2-xs cl-sub${x.spendMinor === null ? ' bk-warn' : ' a2-mute'}`}>{x.spendMinor === null ? g('spendUnknown') : g('spend', { spend: m(x.spendMinor) })}</span>
                  </span>
                  <b className="a2-sm">{roas(x.roasPercent)}</b>
                </div>
              );
            })}
            {r.untiedSpendMinor !== 0 ? (
              <p className="a2-xs a2-mute a2-mt12" data-testid="mr-untied">
                {g('camp.untied', { amount: m(r.untiedSpendMinor) })}
              </p>
            ) : null}
          </section>

          <section className="a2-card a2-mt12" aria-labelledby="mr-send-h" data-testid="mr-sends">
            <h2 className="a2-h3" id="mr-send-h">
              {g('send.h')}
            </h2>
            <p className="a2-cs">{g('send.sub', { days: o.settings.resultDays })}</p>
            {r.sends.length ? null : <p className="a2-xs a2-mute">{g('send.empty')}</p>}
            {r.sends.map((x) => (
              <div key={x.id} className="a2-rule" data-testid="mr-send-row">
                <span>
                  <b>{x.name}</b>
                  <span className="a2-xs a2-mute cl-sub">{g('send.line', { channel: named('mr.sendChannel', x.channel), day: atText(x.startedAt), sent: x.sent, cost: m(x.costMinor) })}</span>
                  <span className="a2-xs a2-mute cl-sub">{g('send.result', { orders: x.orders, delivered: x.delivered, sales: m(x.salesMinor) })}</span>
                </span>
                <b className="a2-sm">{roas(roasOf(x.salesMinor, x.costMinor))}</b>
              </div>
            ))}
            {r.sends.length ? (
              <Link className="a2-lnk a2-mt12" href="/admin/messages/campaigns">
                {g('send.open')}
              </Link>
            ) : null}
          </section>
        </>
      )}

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canWrite} testId="mr-card" />
      </div>
    </div>
  );
}
