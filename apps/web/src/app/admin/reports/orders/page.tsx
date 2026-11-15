// S05 · PR 155 follow-up 91, rebuilt in PR 796 (prototype v5 Reports › Sales) — Reports › Sales at /admin/reports/orders: how much is
// selling, when and through which channel, for any period with the span before beside it. Order value, orders, pieces, average order,
// delivered sales and cancelled; orders, delivered and returned over time (by day or by week); by channel; by payment method;
// discounts and coupons; by hour of the day; by weekday; and a day-by-day (or week-by-week) table. A channel filter narrows every
// figure to one order source. Read-only (lib/reports-v5/sales.ts reads the shop's own orders). Seeing needs `books.read`.
// Words: messages/admin-reports-v5.*.json (`reportsV5.orders.*`). Guide: docs/admin-guide/pages/reports/orders.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { LineChart } from '@/components/admin/look/kit';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { BarList } from '@/components/admin/reports/ReportCharts';
import { ReportAnswers, type AnswerLine } from '@/components/admin/reports/ReportAnswers';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { ReportTable } from '@/components/admin/reports/ReportParts';
import { Columns, Donut } from '@/components/admin/reports/ReportSalesCharts';
import '@/components/admin/reports/report-bar.css';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadBase, loadViews } from '@/lib/reports-v5/load';
import { change } from '@/lib/reports-v5/model';
import { discountGroups, hourWeekday, isDelivered, isLive, isSaleSource, loadSaleOrders, saleBuckets, saleFacts, SALE_SOURCES } from '@/lib/reports-v5/sales';
import { withReportsV5 } from '@/lib/reports-v5/words';
import '../../settings-cards.css';
import '../../money/money.css';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsOrders';
const HERE = '/admin/reports/orders';
/** Weekdays in the order the prototype draws them (Saturday first); 0 = Sunday. */
const WD_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;
const WD_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const PAY_KEYS = ['COD', 'BKASH', 'NAGAD', 'CARD', 'CASH', 'WALLET', 'BANK_TRANSFER', 'ROCKET', 'UPAY', 'ONLINE'] as const;
/** The first and last hour the hour chart draws (the shop's selling hours in the prototype). */
const HOUR_FROM = 9;
const HOUR_TO = 23;

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(await adminView());
  return { title: `${t(view.dict, 'reportsV5.orders.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SalesReportTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withReportsV5(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-testid="orders-report" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.orders.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.common.${k}`, v);
  const base = await loadBase(access.deps, sp);
  const views = await loadViews(access, 'orders');
  const f = makeFmt(view.locale, base.currency);
  const { q, notes } = base.period;
  const cmp = sp.cmp !== '0';
  const ch = isSaleSource(sp.ch) ? sp.ch : 'all';
  const grain = sp.grain === 'week' ? 'week' : 'day';
  const [rows, was] = await Promise.all([loadSaleOrders(access.deps.db, base.timeZone, q.from, q.to, ch === 'all' ? null : ch), loadSaleOrders(access.deps.db, base.timeZone, base.before.from, base.before.to, ch === 'all' ? null : ch)]);
  const k = saleFacts(rows);
  const kw = saleFacts(was);
  const dl = (x: number | null) => (cmp ? x : undefined);
  const maxRows = base.limits.maxDays;
  const prevText = c('prevSpan', { from: f.dayShort(base.before.from), to: f.dayShort(base.before.to) });
  const pctText = (x: number | null) => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`);

  const { hours, wds } = hourWeekday(k.live);
  const peakH = hours.indexOf(Math.max(...hours));
  const bestW = wds.indexOf(Math.max(...wds));
  const byPay = new Map<string, number>();
  for (const o of k.live) byPay.set(o.method ?? 'none', (byPay.get(o.method ?? 'none') ?? 0) + 1);
  const cod = byPay.get('COD') ?? 0;
  const codShare = k.orders ? Math.round((cod / k.orders) * 100) : 0;
  const withD = k.live.filter((o) => o.discountMinor > 0);
  const noD = k.live.filter((o) => !o.discountMinor);
  const avg = (os: typeof k.live) => (os.length ? Math.round(os.reduce((n, o) => n + o.totalMinor, 0) / os.length) : 0);
  const discWas = kw.discount;

  const lines: AnswerLine[] = [];
  if (k.orders)
    lines.push({
      text: c('ans.orders', { n: f.num(k.orders), v: f.amount(k.orderValue), chg: pctText(change(k.orderValue, kw.orderValue)), prev: prevText, pcs: f.num(k.pieces) }),
      tone: k.orderValue >= kw.orderValue ? 'good' : 'bad',
      act: { label: c('ans.products'), href: '/admin/reports/products' },
    });
  if (k.orders) {
    lines.push({ text: c('ans.busy', { h: peakH, h2: peakH + 1, day: c(`wd.${WD_KEYS[bestW]}`) }), act: { label: c('ans.post'), href: '/admin/marketing/calendar' } });
    lines.push({ text: c('ans.cod', { pct: `${codShare}%`, n: f.num(k.orders - cod) }), act: { label: c('ans.codRules'), href: '/admin/rules' } });
    lines.push({
      text: c('ans.disc', { v: f.amount(k.discount), chg: pctText(change(k.discount, discWas)), with: f.amount(avg(withD)), without: f.amount(avg(noD)) }),
      act: { label: c('ans.coupons'), href: '/admin/marketing/campaigns' },
    });
  }

  const tiles: SummaryTile[] = [
    { key: 'orderValue', label: c('kValue'), value: k.orderValue, shown: f.amount(k.orderValue), format: f.format, delta: dl(change(k.orderValue, kw.orderValue)) },
    { key: 'orders', label: c('kOrders'), value: k.orders, shown: f.num(k.orders), format: { kind: 'number', locale: view.locale }, delta: dl(change(k.orders, kw.orders)) },
    { key: 'pieces', label: c('kPieces'), value: k.pieces, shown: f.num(k.pieces), format: { kind: 'number', locale: view.locale }, delta: dl(change(k.pieces, kw.pieces)) },
    { key: 'aov', label: c('kAvg'), value: k.aov, shown: f.amount(k.aov), format: f.format, delta: dl(change(k.aov, kw.aov)) },
  ];

  const bk = saleBuckets(rows, q.from, q.to, grain);
  const bw = saleBuckets(was, base.before.from, base.before.to, grain);
  const bLabel = (b: { from: string; to: string }) => (bk.grain === 'week' ? `${f.dayShort(b.from)} – ${f.dayShort(b.to)}` : f.dayShort(b.from));
  const nLive = (b: { rows: typeof rows }) => b.rows.filter(isLive).length;
  const nDel = (b: { rows: typeof rows }) => b.rows.filter(isDelivered).length;
  const nRet = (b: { rows: typeof rows }) => b.rows.filter((o) => o.status === 'RETURNED').length;
  const series = [
    { v: bk.list.map(nLive), color: 'var(--a3-c1)', name: c('sOrders'), shown: bk.list.map((b) => f.num(nLive(b))) },
    { v: bk.list.map(nDel), color: 'var(--a3-s2)', name: c('sDelivered'), shown: bk.list.map((b) => f.num(nDel(b))) },
    { v: bk.list.map(nRet), color: 'var(--a3-s5)', name: c('sReturned'), shown: bk.list.map((b) => f.num(nRet(b))) },
    ...(cmp && bw.list.length === bk.list.length ? [{ v: bw.list.map(nLive), color: 'var(--a3-c1)', name: c('sBefore'), dash: true, w: 1.6, shown: bw.list.map((b) => f.num(nLive(b))) }] : []),
  ];
  const grainHref = (g: string) => `${HERE}?p=${typeof sp.p === 'string' ? sp.p : 'custom'}&from=${q.from}&to=${q.to}${cmp ? '' : '&cmp=0'}${ch === 'all' ? '' : `&ch=${ch}`}&grain=${g}`;

  const bySrc = new Map<string, number>();
  const nSrc = new Map<string, number>();
  for (const o of k.live) {
    bySrc.set(o.source, (bySrc.get(o.source) ?? 0) + o.totalMinor);
    nSrc.set(o.source, (nSrc.get(o.source) ?? 0) + 1);
  }
  const srcItems = [...bySrc].sort((a, b) => b[1] - a[1]).map(([s, v]) => ({ key: s, label: `${c(`src.${s}`)} · ${f.num(nSrc.get(s) ?? 0)}`, value: v, shown: f.amount(v) }));
  const payParts = [...PAY_KEYS, 'none'].filter((m) => byPay.has(m)).map((m) => ({ key: m, label: c(`pay.${m}`), value: byPay.get(m) ?? 0 }));
  const disc = discountGroups(k.live);
  const hrs = Array.from({ length: HOUR_TO - HOUR_FROM + 1 }, (_, i) => HOUR_FROM + i);

  return (
    <div className="a2-z lm-rp" data-testid="orders-report" data-lm-ready="" data-from={q.from} data-to={q.to}>
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={base.today} p={typeof sp.p === 'string' ? sp.p : undefined} cmp={cmp} before={base.before} reportKey="orders" views={views} day={f.dayShort} csv={`/api/admin/reports/export/orders?from=${q.from}&to=${q.to}${ch === 'all' ? '' : `&ch=${ch}`}`} notes={notes} limitDays={maxRows} />
      <form className="rpf" action={HERE} method="get" data-testid="rp-filters">
        <input type="hidden" name="p" value={typeof sp.p === 'string' ? sp.p : 'custom'} />
        <input type="hidden" name="from" value={q.from} />
        <input type="hidden" name="to" value={q.to} />
        {cmp ? null : <input type="hidden" name="cmp" value="0" />}
        <label className="a2-xs a2-mute" htmlFor="rp-f-ch">
          {c('fChannel')}
        </label>
        <select id="rp-f-ch" name="ch" className="a2-inp" defaultValue={ch} data-testid="rp-f-ch">
          <option value="all">{c('fAll')}</option>
          {SALE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {c(`src.${s}`)}
            </option>
          ))}
        </select>
        <button type="submit" className="a2-btn sm cr-tap" data-testid="rp-f-apply">
          {c('fApply')}
        </button>
        {ch === 'all' ? null : (
          <Link className="a2-btn sm ghost cr-tap" href={`${HERE}?p=${typeof sp.p === 'string' ? sp.p : 'custom'}&from=${q.from}&to=${q.to}${cmp ? '' : '&cmp=0'}`} data-testid="rp-f-clear">
            {c('fClear')}
          </Link>
        )}
      </form>
      <ReportAnswers kicker={cc('answers')} question={c('ans.q')} lines={lines} empty={cc('answersNone')} />
      <SummaryTiles className="a2-mt12" tiles={tiles} label={cc('tilesLabel')} testId="rp-tiles" />
      <div className="rp-ks" data-testid="rp-chips">
        <div>
          <span>{c('kSales')}</span>
          <b>{f.amount(k.deliveredValue)}</b>
          {cmp ? <span>{pctText(change(k.deliveredValue, kw.deliveredValue))}</span> : null}
        </div>
        <div>
          <span>{c('kCancelled')}</span>
          <b>{f.num(k.cancelled)}</b>
          <span>{k.all ? `${Math.round((k.cancelled / k.all) * 100)}%` : '—'}</span>
        </div>
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-s-over" data-testid="rp-overtime">
        <h2 className="a2-h3" id="rp-s-over">
          {c('overTitle')}
        </h2>
        <p className="a2-cs">{c('overSub')}</p>
        <nav className="rpseg" aria-label={c('grain')} data-testid="rp-grain">
          <Link href={grainHref('day')} className={bk.grain === 'day' ? 'on' : ''} aria-current={bk.grain === 'day' ? 'true' : undefined}>
            {c('byDay')}
          </Link>
          <Link href={grainHref('week')} className={bk.grain === 'week' ? 'on' : ''} aria-current={bk.grain === 'week' ? 'true' : undefined}>
            {c('byWeek')}
          </Link>
        </nav>
        <LineChart id="rp-sales-over" labels={bk.list.map(bLabel)} series={series} h={220} label={c('overTitle')} yfmt={(v) => f.num(Math.round(v))} foot={bk.list.map((b) => `${nLive(b)} / ${nDel(b)} / ${nRet(b)}`)} />
      </section>

      <div className="rp-grid3e a2-mt12">
        <section className="a2-card" aria-labelledby="rp-s-ch" data-testid="rp-bychannel">
          <h2 className="a2-h3" id="rp-s-ch">
            {c('chTitle')}
          </h2>
          {srcItems.length ? <BarList items={srcItems} testId="rp-bychannel-bars" /> : <p className="a2-sm a2-mute a2-mt6">{cc('none')}</p>}
        </section>
        <section className="a2-card" aria-labelledby="rp-s-pay" data-testid="rp-bypay">
          <h2 className="a2-h3" id="rp-s-pay">
            {c('payTitle')}
          </h2>
          <p className="a2-cs">{c('paySub')}</p>
          <Donut parts={payParts} center={f.num(k.orders)} aria={c('payTitle')} testId="rp-bypay-donut" />
        </section>
        <section className="a2-card" aria-labelledby="rp-s-dis" data-testid="rp-discounts">
          <h2 className="a2-h3" id="rp-s-dis">
            {c('discTitle')}
          </h2>
          <ReportTable
            testId="rp-discounts-table"
            rowId="rp-discount-row"
            empty={c('discNone')}
            cols={[{ h: c('colOffer') }, { h: c('colCost'), right: true }, { h: c('colAvg'), right: true }]}
            rows={disc.slice(0, 6).map((x) => [
              <span key="o">
                <b>{x.key === 'BUY3' ? c('offerBuy3') : x.key === 'BUY2' ? c('offerBuy2') : c('offerCoupon', { code: x.key })}</b>
                <span className="a2-xs a2-mute" style={{ display: 'block' }}>
                  {f.num(x.orders)} {c('orders')} · {x.pcs.toFixed(1)} {c('pcsPer')}
                </span>
              </span>,
              f.amount(x.off),
              f.amount(x.aov),
            ])}
          />
        </section>
      </div>

      <div className="rp-grid2 a2-mt12" style={{ display: 'grid', gap: 16 }}>
        <section className="a2-card" aria-labelledby="rp-s-hr" data-testid="rp-byhour">
          <h2 className="a2-h3" id="rp-s-hr">
            {c('hourTitle')}
          </h2>
          <p className="a2-cs">{c('hourSub')}</p>
          <Columns testId="rp-byhour-cols" items={hrs.map((h) => ({ key: String(h), label: String(h), value: hours[h] ?? 0, shown: f.amount(hours[h] ?? 0) }))} />
        </section>
        <section className="a2-card" aria-labelledby="rp-s-wd" data-testid="rp-byweekday">
          <h2 className="a2-h3" id="rp-s-wd">
            {c('wdTitle')}
          </h2>
          <p className="a2-cs">{c('wdSub')}</p>
          <Columns tone="c2" testId="rp-byweekday-cols" items={WD_ORDER.map((w) => ({ key: String(w), label: c(`wd.${WD_KEYS[w]}`), value: wds[w] ?? 0, shown: f.amount(wds[w] ?? 0) }))} />
        </section>
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-s-days" data-testid="rp-days">
        <h2 className="a2-h3" id="rp-s-days">
          {bk.grain === 'week' ? c('weekTitle') : c('dayTitle')}
        </h2>
        <ReportTable
          testId="rp-days-table"
          rowId="rp-day-row"
          empty={cc('none')}
          cols={[{ h: c('colPeriod') }, { h: c('sOrders'), right: true }, { h: c('colPieces'), right: true }, { h: c('colValue'), right: true }, { h: c('sDelivered'), right: true }, { h: c('sReturned'), right: true }, { h: c('kCancelled'), right: true }]}
          rows={[...bk.list].reverse().slice(0, maxRows).map((b) => {
            const live = b.rows.filter(isLive);
            const ret = nRet(b);
            return [
              <b key="p">{bLabel(b)}</b>,
              f.num(live.length),
              f.num(live.reduce((n, o) => n + o.pieces, 0)),
              f.amount(live.reduce((n, o) => n + o.totalMinor, 0)),
              f.num(nDel(b)),
              ret ? (
                <span key="r" style={{ color: 'var(--lm-bad)' }}>
                  {f.num(ret)}
                </span>
              ) : (
                '0'
              ),
              f.num(b.rows.length - live.length),
            ];
          })}
        />
      </section>
      <p className="a2-xs a2-mute a2-mt12">{c('note')}</p>
    </div>
  );
}
