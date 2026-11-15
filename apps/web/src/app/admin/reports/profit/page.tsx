// S28 · PR 714 (CN-048; prototype v5 Reports › Profit) — Reports › Profit at /admin/reports/profit: where the profit comes from,
// for any period (one-press periods or two dates, made safe by `costs.report`) with the span before beside it: net profit,
// profit before ads, margin, profit per order, ad spend, return losses, styles losing money, a hero chart of profit before ads
// day by day, and the profit by channel, category and style. Read-only. Every figure is the one Money › Profit & loss, Profit by
// channel and Profit by group already show (lib/reports-v5/load.ts): nothing is counted again and no money rule is new.
// Seeing needs `books.read`. Words: messages/admin-reports-v5.*.json (`reportsV5.profit.*`). Guide: docs/admin-guide/pages/reports/profit.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { ReportAnswers, type AnswerLine } from '@/components/admin/reports/ReportAnswers';
import { BarList, MarginLine } from '@/components/admin/reports/ReportCharts';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { ReportTable } from '@/components/admin/reports/ReportParts';
import '@/components/admin/reports/report-bar.css';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { channelMarginPct } from '@/lib/channel-profit-view';
import { marginPct } from '@/lib/group-profit-view';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadBase, loadProfit, loadViews } from '@/lib/reports-v5/load';
import { change, leaves } from '@/lib/reports-v5/model';
import { withReportsV5 } from '@/lib/reports-v5/words';
import '../../settings-cards.css';
import '../../money/money.css';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsProfit';
const HERE = '/admin/reports/profit';

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(await adminView());
  return { title: `${t(view.dict, 'reportsV5.profit.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ProfitReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withReportsV5(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-testid="rp-profit" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.profit.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.common.${k}`, v);
  const b = await loadBase(access.deps, sp);
  const r = await loadProfit(access.deps, b);
  const f = makeFmt(view.locale, b.currency);
  const { q, notes } = b.period;
  const { now, was } = r;
  const cmp = sp.cmp !== '0';
  const views = await loadViews(access, 'profit');
  const rows = b.limits.maxDayRows;
  const channelName = (k: string) => {
    const w = t(d, `reportsV5.channel.${k}`);
    return w === `reportsV5.channel.${k}` ? k.replace(/^source:/, '') : w;
  };

  const perOrder = now.orders > 0 ? Math.round(now.contributionMinor / now.orders) : null;
  const perOrderWas = was.orders > 0 ? Math.round(was.contributionMinor / was.orders) : null;
  const marginNow = now.netProfitMinor === null || now.parts.sales <= 0 ? null : now.netProfitMinor / now.parts.sales;
  const losing = leaves(r.styles.rows).filter((x) => x.id !== null && Math.sign(x.profitMinor) === -1).length;
  const money = (id: string, label: string, minor: number | null, before: number | null, good?: 'down', vs?: string): SummaryTile => ({
    key: id,
    label,
    value: minor ?? 0,
    shown: f.maybe(minor, cc('unknown')),
    format: f.format,
    ...(minor === null ? { word: true } : {}),
    delta: change(minor, before),
    ...(good ? { good } : {}),
    ...(vs ? { vs } : {}),
  });
  const tiles: SummaryTile[] = [
    money('net', c('kNet'), now.netProfitMinor, was.netProfitMinor, undefined, c('kOrders', { n: now.orders })),
    money('before', c('kBefore'), now.contributionMinor, was.contributionMinor),
    marginNow === null
      ? { key: 'margin', label: c('kMargin'), value: 0, shown: '—', format: { kind: 'percent', locale: view.locale, digits: 1 }, word: true }
      : { key: 'margin', label: c('kMargin'), value: marginNow, shown: f.pct(marginNow), format: { kind: 'percent', locale: view.locale, digits: 1 } },
    money('perOrder', c('kPerOrder'), perOrder, perOrderWas, undefined, c('beforeAds')),
    money('ads', c('kAds'), now.adsMinor, was.adsMinor, 'down'),
    money('returns', c('kReturns'), now.parts.returnLoss, was.parts.returnLoss, 'down'),
    { key: 'losing', label: c('kLosing'), value: losing, shown: f.num(losing), format: { kind: 'number', locale: view.locale }, tone: losing > 0 ? 'bad' : undefined },
  ];

  // "Margin, week by week": the period's days in blocks of seven, margin before ads = contribution ÷ delivered sales.
  const dayAsc = [...now.byDay].sort((x, y) => x.day.localeCompare(y.day));
  const weeks: { label: string; sales: number; contribution: number }[] = [];
  for (let i = 0; i < dayAsc.length; i += 7) {
    const chunk = dayAsc.slice(i, i + 7);
    weeks.push({ label: f.dayShort(chunk[0]!.day), sales: chunk.reduce((a2, x) => a2 + x.salesMinor, 0), contribution: chunk.reduce((a2, x) => a2 + x.contributionMinor, 0) });
  }
  const weekPoints = weeks.slice(-8).map((w) => ({ label: w.label, value: w.sales > 0 ? Math.round((w.contribution / w.sales) * 1000) / 10 : null }));
  const chRows = r.channels.rows.filter((x) => x.kind !== 'total');
  const chValue = (x: (typeof chRows)[number]) => x.profitMinor ?? x.contributionMinor;
  const chSorted = [...chRows].sort((x, y) => chValue(y) - chValue(x));
  const topCh = chSorted[0];
  const topChWas = topCh ? r.channelsWas.rows.find((x) => x.key === topCh.key) : undefined;
  const catTop = r.categories.rows.filter((x) => x.depth === 0 && x.id !== null && x.salesMinor > 0 && marginPct(x) !== null);
  const catSorted = [...catTop].sort((x, y) => (marginPct(y) ?? 0) - (marginPct(x) ?? 0));
  const lowCat = catSorted[catSorted.length - 1];
  const bestCat = catSorted[0];
  const lines: AnswerLine[] = [];
  if (lowCat && bestCat && lowCat.id !== bestCat.id)
    lines.push({
      text: c('ans.lowCat', { name: lowCat.name ?? '', pct: f.pctOf(marginPct(lowCat)), bestName: bestCat.name ?? '', bestPct: f.pctOf(marginPct(bestCat)) }),
      tone: (marginPct(lowCat) ?? 100) < 25 ? 'bad' : undefined,
      act: { label: c('ans.checkPrices'), href: '/admin/products' },
    });
  if (topCh && chValue(topCh) > 0) {
    const was = topChWas ? (topChWas.profitMinor ?? topChWas.contributionMinor) : null;
    const ch = change(chValue(topCh), was);
    lines.push({
      text: c('ans.bestCh', { name: channelName(topCh.key), amount: f.amount(chValue(topCh)), change: ch === null ? '—' : f.pct(ch) }),
      tone: 'good',
      act: { label: c('ans.raiseBudget'), href: '/admin/marketing' },
    });
  }
  if (losing > 0) lines.push({ text: c('ans.losing', { n: losing }), tone: 'bad', act: { label: c('byStyle'), href: `/admin/money/profit/groups?by=style&from=${q.from}&to=${q.to}` } });

  const moreCategories = r.categories.rows.length > rows;
  const moreStyles = r.styles.rows.length > rows;
  const csv = `/api/admin/reports/export/profit?from=${q.from}&to=${q.to}`;
  const sales = (m: number) => f.amount(m);
  const groupRows = (g: typeof r.categories, none: string) =>
    g.rows.slice(0, rows).map((x) => [
      <span key="n" style={{ paddingLeft: x.depth * 14 }}>
        <b>{x.name ?? none}</b>
      </span>,
      f.num(x.orders),
      sales(x.salesMinor),
      <b key="p" style={x.profitMinor < 0 ? { color: 'var(--bad)' } : undefined}>
        {f.amount(x.profitMinor)}
      </b>,
      f.pctOf(marginPct(x)),
    ]);
  const groupCols = (h: string) => [{ h }, { h: c('colOrders'), right: true }, { h: c('colSales'), right: true }, { h: c('colProfit'), right: true }, { h: c('colMargin'), right: true }];

  return (
    <div className="a2-z lm-rp" data-testid="rp-profit" data-lm-ready="" data-from={q.from} data-to={q.to}>
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={b.today} p={typeof sp.p === 'string' ? sp.p : undefined} cmp={cmp} before={b.before} reportKey="profit" views={views} day={f.dayShort} csv={csv} notes={notes} limitDays={b.limits.maxDays} />
      <ReportAnswers kicker={cc('answers')} question={c('ans.q')} lines={lines} empty={cc('answersNone')} />
      <SummaryTiles className="a2-mt12" tiles={tiles.slice(0, 4).map((x) => (cmp ? x : { ...x, delta: undefined }))} label={cc('tilesLabel')} testId="rp-tiles" />
      {tiles.length > 4 ? (
        <div className="rp-kchips" data-testid="rp-chips">
          {tiles.slice(4).map((x) => (
            <div key={x.key}>
              <span>{x.label}</span>
              <b>{x.shown}</b>
            </div>
          ))}
        </div>
      ) : null}
      {now.netProfitMinor === null ? <p className="a2-xs bk-warn a2-mt12" data-testid="rp-ads-unknown">{c('adsUnknown')}</p> : null}
      {now.uncosted.orders ? <p className="a2-xs bk-warn a2-mt6" data-testid="rp-uncosted">{c('uncosted', { n: now.uncosted.orders })}</p> : null}


      <div className="rp-grid3 a2-mt12">
        <section className="a2-card" aria-labelledby="rp-wk" data-testid="rp-weeks">
          <h2 className="a2-h3" id="rp-wk">
            {c('weeksTitle')}
          </h2>
          <p className="a2-cs">{c('weeksSub')}</p>
          {weekPoints.length ? <MarginLine points={weekPoints} name={c('weeksSeries')} testId="rp-weeks-chart" /> : <p className="a2-sm a2-mute a2-mt6">{cc('none')}</p>}
        </section>
        <section className="a2-card" aria-labelledby="rp-ch" data-testid="rp-channels">
          <h2 className="a2-h3" id="rp-ch">
            {c('byChannel')}
          </h2>
          <p className="a2-cs">{c('byChannelSub')}</p>
          {chSorted.length ? (
            <BarList testId="rp-channels-table" items={chSorted.map((x) => ({ key: x.key, label: `${channelName(x.key)} · ${f.pctOf(channelMarginPct(x))}`, value: chValue(x), shown: f.amount(chValue(x)) }))} />
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{cc('none')}</p>
          )}
        </section>
      </div>

      <div className="a2-note a2-mt12" role="note">
        <span>
          {c('callout')}{' '}
          <Link className="a2-lnk cr-link" href={`/admin/money/profit?from=${q.from}&to=${q.to}`} data-testid="rp-open-pnl">
            {c('open')}
          </Link>
        </span>
      </div>

      <div className="rp-grid2 a2-mt12">
      <section className="a2-card" aria-labelledby="rp-cat" data-testid="rp-categories">
        <h2 className="a2-h3" id="rp-cat">
          {c('byCategory')}
        </h2>
        <p className="a2-cs">{c('byCategorySub')}</p>
        <ReportTable testId="rp-categories-table" rowId="rp-category-row" empty={cc('none')} cols={groupCols(c('colCategory'))} rows={groupRows(r.categories, t(d, 'reportsV5.channel.noCategory'))} />
        {moreCategories ? <p className="a2-xs a2-mute a2-mt6">{cc('cut', { n: rows })}</p> : null}
      </section>

      <section className="a2-card" aria-labelledby="rp-style" data-testid="rp-styles">
        <h2 className="a2-h3" id="rp-style">
          {c('byStyle')}
        </h2>
        <p className="a2-cs">{c('byStyleSub')}</p>
        <ReportTable testId="rp-styles-table" rowId="rp-style-row" empty={cc('none')} cols={groupCols(c('colStyle'))} rows={groupRows(r.styles, t(d, 'reportsV5.channel.noStyle'))} />
        {moreStyles ? <p className="a2-xs a2-mute a2-mt6">{cc('cut', { n: rows })}</p> : null}
      </section>
      </div>

    </div>
  );
}
