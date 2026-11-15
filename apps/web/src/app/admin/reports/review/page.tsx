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
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { PrintButton } from '@/components/admin/reports/PrintButton';
import { TelegramButton } from '@/components/admin/reports/TelegramButton';
import { ReportTable } from '@/components/admin/reports/ReportParts';
import '@/components/admin/reports/report-bar.css';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { quickPeriod } from '@/lib/cost-report';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadReview, loadReviewBase } from '@/lib/reports-v5/load';
import { change, changePerDay, reviewLines, spanDays, type ReviewLine } from '@/lib/reports-v5/model';
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
  const monthOf = (ymd: string, long = true) => {
    try {
      return new Intl.DateTimeFormat(view.locale, { month: long ? 'long' : 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T12:00:00Z`));
    } catch {
      return ymd.slice(0, 7);
    }
  };
  const lastSpan = quickPeriod('lastMonth', b.today);
  const thisSpan = quickPeriod('month', b.today);
  const monthYear = (ymd: string) => {
    try {
      return new Intl.DateTimeFormat(view.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T12:00:00Z`));
    } catch {
      return ymd.slice(0, 7);
    }
  };
  const beforeName = monthOf(b.before.to);
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
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <section className="rpbar a2-card a2-mt12" data-testid="rp-bar" aria-label={c('switch')}>
        <div className="rpbar-top">
          <nav className="rpseg" aria-label={c('switch')} data-testid="rp-month-switch">
            {(['last', 'this'] as const).map((m) => (
              <Link key={m} className={b.which === m ? 'on' : ''} href={`${HERE}?m=${m}`} aria-current={b.which === m ? 'true' : undefined} data-testid={`rp-month-${m}`}>
                {m === 'last' ? monthOf(lastSpan.from) : c('thisSoFar', { month: monthOf(thisSpan.from) })}
              </Link>
            ))}
          </nav>
          <span className="rpbar-per" data-testid="rp-period">
            {c('comparedWith', { month: beforeName })}
          </span>
          <span className="rpbar-grow" />
          <span className="rpbar-btns">
            <PrintButton label={`⎙ ${c('pdfShort')}`} testId="rp-pdf" cls="a2-btn sm cr-tap" />
            <Link className="a2-btn sm cr-tap" href="/admin/reports/packs" data-testid="rp-to-packs">
              {c('everyMonth')}
            </Link>
            <TelegramButton
              testId="rp-tg"
              disabledReason={access.guard.permissions?.has('reports.analytics.write') ? null : c('tgNoKey')}
              texts={{ label: c('tg'), sending: c('tgSending'), sent: c('tgSent'), skipped: c('tgSkipped'), failed: c('tgFailed') }}
            />
          </span>
        </div>
      </section>
      <SummaryTiles className="a2-mt12" tiles={tiles} label={cc('tilesLabel')} testId="rp-tiles" />

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
        <div className="rp-numh">
          <h2 className="a2-h3" id="rp-num">
            {c('numbers')}
          </h2>
          <Link className="a2-lnk cr-link" href="/admin/reports" data-testid="rp-all-reports">
            {c('allReports')} →
          </Link>
        </div>
        <ReportTable
          testId="rp-numbers-table"
          rowId="rp-number-row"
          empty={cc('none')}
          rowCls={(i) => (numbers[i]?.strong ? 'strong' : numbers[i]?.sub ? 'sub' : undefined)}
          cols={[{ h: c('colLine') }, { h: monthYear(q.from), right: true }, { h: beforeName, right: true }]}
          rows={numbers.map((x) => {
            const label = c(`line.${x.key}`);
            return [label, f.maybe(x.a, cc('unknown')), quiet(f.maybe(x.z, cc('unknown')))];
          })}
        />
        <p className="rp-note">
          {c('numbersSub')}{' '}
          <Link className="a2-lnk cr-link" href={`/admin/money/profit?from=${q.from}&to=${q.to}`} data-testid="rp-open-pnl">
            {c('open')}
          </Link>
        </p>
      </section>

    </div>
  );
}
