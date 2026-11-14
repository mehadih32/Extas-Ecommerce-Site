// S28 · PR 717 (CN-048; prototype v5 Reports › Monthly review) — Reports › Monthly review at /admin/reports/review: the month on one
// page (last month, or this month so far): delivered sales, net profit, orders and the return rate against the span before (per
// day, so a month so far can be compared), a hero chart of delivered sales day by day, what went well, what went badly and up to
// three next steps with a button each, and the month in numbers. The went-well and went-badly lines are written by fixed rules from
// the figures (lib/reports-v5/model.ts `reviewLines`); no AI is called and nothing is sent. Read-only. The figures are Money ›
// Profit & loss, Profit by channel and Profit by group, and the Report library's restock lists (with `reports.read`).
// Seeing needs `books.read`. Words: messages/admin-reports-v5.*.json (`reportsV5.review.*`). Guide: docs/admin-guide/pages/reports/review.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { HeroChart } from '@/components/admin/lumen/HeroChart';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { HowFigures, ReportTable } from '@/components/admin/reports/ReportParts';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadReview, loadReviewBase } from '@/lib/reports-v5/load';
import { change, changePerDay, daysBetween, heroRange, reviewLines, seriesOf, spanDays, type ReviewLine } from '@/lib/reports-v5/model';
import { withReportsV5 } from '@/lib/reports-v5/words';
import '../../settings-cards.css';
import '../../money/money.css';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsReview';
const HERE = '/admin/reports/review';

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(await adminView());
  return { title: `${t(view.dict, 'reportsV5.review.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MonthlyReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withReportsV5(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-testid="rp-review" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.review.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.common.${k}`, v);
  const b = await loadReviewBase(access.deps, sp);
  const r = await loadReview(access, b);
  const f = makeFmt(view.locale, b.currency);
  const { q } = b.period;
  const { now, was } = r;
  const nowDays = spanDays(q.from, q.to);
  const wasDays = spanDays(b.before.from, b.before.to);
  const month = (() => {
    try {
      return new Intl.DateTimeFormat(view.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${q.from}T12:00:00Z`));
    } catch {
      return q.from.slice(0, 7);
    }
  })();
  const rate = r.channels.total.returnRatePct;
  const rateWas = r.channelsWas.total.returnRatePct;
  const perDay = (a: number | null, z: number | null) => changePerDay(a, nowDays, z, wasDays);

  const salesChange = perDay(now.salesMinor, was.salesMinor);
  const profitChange = perDay(now.netProfitMinor, was.netProfitMinor);
  const top = r.categories.rows.filter((x) => x.depth === 0 && x.id !== null);
  const lines = reviewLines(
    {
      salesChange,
      profitChange,
      netProfitMinor: now.netProfitMinor,
      adsUnknown: now.adsMinor === null,
      uncostedOrders: now.uncosted.orders,
      returnRate: rate,
      returnRateBefore: rateWas,
      groups: top.map((x) => ({ name: x.name ?? '', salesMinor: x.salesMinor, costedSalesMinor: x.costedSalesMinor, profitMinor: x.profitMinor })),
      restockStyles: r.restock ? r.restock.restock.length : null,
      unsoldStyles: r.restock ? r.restock.unsold.length : null,
    },
    { money: f.amount, pct: f.pct },
  );
  const say = (l: ReviewLine) => c(`line.${l.key}`, l.vars);

  const vs = c('compared', { from: f.day(b.before.from), to: f.day(b.before.to) });
  const tiles: SummaryTile[] = [
    { key: 'sales', label: c('kSales'), value: now.salesMinor, shown: f.amount(now.salesMinor), format: f.format, delta: salesChange, vs: c('perDay') },
    now.netProfitMinor === null
      ? { key: 'profit', label: c('kProfit'), value: 0, shown: cc('unknown'), format: f.format, word: true }
      : { key: 'profit', label: c('kProfit'), value: now.netProfitMinor, shown: f.amount(now.netProfitMinor), format: f.format, delta: profitChange, vs: c('perDay') },
    { key: 'orders', label: c('kOrders'), value: now.orders, shown: f.num(now.orders), format: { kind: 'number', locale: view.locale }, delta: perDay(now.orders, was.orders), vs: c('perDay') },
    rate === null
      ? { key: 'returns', label: c('kReturns'), value: 0, shown: '—', format: { kind: 'number', locale: view.locale }, word: true }
      : { key: 'returns', label: c('kReturns'), value: rate, shown: f.pctOf(rate), format: { kind: 'number', locale: view.locale }, delta: change(rate, rateWas), good: 'down' },
  ];

  const days = daysBetween(q.from, q.to, b.limits.maxDayRows);
  const prevDays = daysBetween(b.before.from, b.before.to, b.limits.maxDayRows);
  const hero = heroRange({
    key: 'p',
    label: month,
    days,
    values: seriesOf(days, now.byDay, (x) => x.salesMinor),
    before: seriesOf(prevDays, was.byDay, (x) => x.salesMinor),
    total: now.salesMinor,
    delta: salesChange,
    vs,
    amount: f.amount,
    dayLabel: f.dayShort,
    mini: [{ label: cc('orders'), shown: f.num(now.orders) }],
  });

  const net = (p: typeof now) => p.netProfitMinor;
  const numbers: { key: string; a: number | null; z: number | null; sub?: boolean; strong?: boolean }[] = [
    { key: 'sales', a: now.parts.sales, z: was.parts.sales },
    { key: 'returns', a: -now.parts.returns, z: -was.parts.returns, sub: true },
    { key: 'productCost', a: -now.parts.productCost, z: -was.parts.productCost, sub: true },
    { key: 'deliveryCharge', a: now.parts.deliveryCharge, z: was.parts.deliveryCharge, sub: true },
    { key: 'courier', a: -(now.parts.courier + now.parts.codFee + now.parts.paymentFees), z: -(was.parts.courier + was.parts.codFee + was.parts.paymentFees), sub: true },
    { key: 'packaging', a: -(now.parts.packaging + now.parts.messages), z: -(was.parts.packaging + was.parts.messages), sub: true },
    { key: 'returnLoss', a: -now.parts.returnLoss, z: -was.parts.returnLoss, sub: true },
    { key: 'ads', a: now.adsMinor === null ? null : -now.adsMinor, z: was.adsMinor === null ? null : -was.adsMinor, sub: true },
    { key: 'office', a: -(now.otherCostsMinor + (now.fixedMinor ?? 0)), z: -(was.otherCostsMinor + (was.fixedMinor ?? 0)), sub: true },
    { key: 'net', a: net(now), z: net(was), strong: true },
  ];
  const quiet = (x: string) => <span className="a2-xs a2-mute">{x}</span>;
  const list = (xs: ReviewLine[], empty: string, tone: 'ok' | 'bad' | 'acc', testId: string) => (
    <ul className="a2-stack" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', gap: 10 }} data-testid={testId}>
      {xs.length ? (
        xs.map((l) => (
          <li key={l.key} data-line={l.key}>
            <span style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'ok' ? 'var(--ok)' : 'var(--ink2)' }} aria-hidden="true">
              ●
            </span>{' '}
            {say(l)}
            {l.href ? (
              <>
                {' '}
                <Link className="a2-btn sm cr-tap" href={l.href}>
                  {c('go')}
                </Link>
              </>
            ) : null}
          </li>
        ))
      ) : (
        <li>{quiet(empty)}</li>
      )}
    </ul>
  );

  return (
    <div className="a2-z lm-rp" data-testid="rp-review" data-lm-ready="" data-from={q.from} data-to={q.to} data-month={b.which}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title', { month })} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <nav className="ct-actions a2-mt12" aria-label={c('switch')} data-testid="rp-month-switch">
        {(['last', 'this'] as const).map((m) => (
          <Link key={m} className={`a2-btn cr-tap${b.which === m ? ' pri' : ''}`} href={`${HERE}?m=${m}`} aria-current={b.which === m ? 'true' : undefined} data-testid={`rp-month-${m}`}>
            {c(m)}
          </Link>
        ))}
        <a className="a2-btn cr-tap" href={`/api/admin/reports/export/review?m=${b.which}`} download data-testid="rp-csv">
          {cc('csv')}
        </a>
        <Link className="a2-btn cr-tap" href="/admin/reports/packs" data-testid="rp-to-packs">
          {c('toPacksBtn')}
        </Link>
      </nav>
      <p className="a2-xs a2-mute a2-mt6">
        {cc('period', { from: f.day(q.from), to: f.day(q.to) })} · {vs}
      </p>
      <SummaryTiles className="a2-mt12" tiles={tiles} label={cc('tilesLabel')} testId="rp-tiles" />
      <div className="a2-mt12 mo-hero">
        <HeroChart title={c('heroTitle')} ranges={[hero]} format={f.format} seriesName={c('heroSeries')} prevName={cc('heroPrev')} testId="rp-hero" />
      </div>

      <div className="a2-kpis k3 a2-mt12">
        <section className="a2-card" data-testid="rp-good">
          <h2 className="a2-h3">
            <span className="a2-pill ok">{c('good')}</span>
          </h2>
          {list(lines.good, c('nothingGood'), 'ok', 'rp-good-list')}
        </section>
        <section className="a2-card" data-testid="rp-bad">
          <h2 className="a2-h3">
            <span className="a2-pill bad">{c('bad')}</span>
          </h2>
          {list(lines.bad, c('nothingBad'), 'bad', 'rp-bad-list')}
        </section>
        <section className="a2-card" data-testid="rp-next">
          <h2 className="a2-h3">
            <span className="a2-pill">{c('next')}</span>
          </h2>
          {list(lines.next, c('nothingNext'), 'acc', 'rp-next-list')}
        </section>
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-num" data-testid="rp-numbers">
        <h2 className="a2-h3" id="rp-num">
          {c('numbers')}
        </h2>
        <p className="a2-cs">{c('numbersSub')}</p>
        <ReportTable
          testId="rp-numbers-table"
          rowId="rp-number-row"
          empty={cc('none')}
          cols={[{ h: c('colLine') }, { h: c('colThis'), right: true }, { h: c('colBefore'), right: true }]}
          rows={numbers.map((x) => {
            const label = c(`line.${x.key}`);
            return [x.strong ? <b key="l">{label}</b> : <span key="l" style={x.sub ? { paddingLeft: 14 } : undefined}>{label}</span>, x.strong ? <b key="a">{f.maybe(x.a, cc('unknown'))}</b> : f.maybe(x.a, cc('unknown')), quiet(f.maybe(x.z, cc('unknown')))];
          })}
        />
        <div className="ct-actions a2-mt12">
          <Link className="a2-btn cr-tap" href={`/admin/money/profit?from=${q.from}&to=${q.to}`} data-testid="rp-open-pnl">
            {c('open')}
          </Link>
        </div>
      </section>

      <HowFigures
        dict={d}
        testId="rp-how"
        items={[
          { label: c('kSales'), how: c('how.sales') },
          { label: c('kProfit'), how: c('how.profit'), href: `/admin/money/profit?from=${q.from}&to=${q.to}`, linkText: c('open') },
          { label: c('kOrders'), how: c('how.orders') },
          { label: c('kReturns'), how: c('how.returns'), href: `/admin/money/profit/channels?from=${q.from}&to=${q.to}`, linkText: t(d, 'reportsV5.profit.byChannel') },
          { label: `${c('good')} / ${c('bad')}`, how: c('how.lines') },
        ]}
      />
      <p className="a2-xs a2-mute a2-mt12">{c('toPacks')}</p>
    </div>
  );
}
