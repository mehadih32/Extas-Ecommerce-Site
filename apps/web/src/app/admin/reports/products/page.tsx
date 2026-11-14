// S28 · PR 715 (CN-048; prototype v5 Reports › Products) — Reports › Products at /admin/reports/products: what sells, what sits and
// what to reorder, for any period with the span before beside it: delivered sales, pieces, styles sold, styles losing money, the
// styles by profit, and (with the `reports.read` key) the Report library's own "restock now" and "sitting unsold" lists. Read-only:
// nothing is bought, stopped or repriced here. Every figure is Money › Profit by group (style) and the Report library; the restock
// verdict uses the thresholds that already sit in `reports.library`. Seeing needs `books.read`.
// Words: messages/admin-reports-v5.*.json (`reportsV5.products.*`). Guide: docs/admin-guide/pages/reports/products.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { HeroChart } from '@/components/admin/lumen/HeroChart';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { HowFigures, ReportTable } from '@/components/admin/reports/ReportParts';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { marginPct } from '@/lib/group-profit-view';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadBase, loadProducts } from '@/lib/reports-v5/load';
import { change, daysBetween, heroRange, leaves, seriesOf } from '@/lib/reports-v5/model';
import { withReportsV5 } from '@/lib/reports-v5/words';
import '../../settings-cards.css';
import '../../money/money.css';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsProducts';
const HERE = '/admin/reports/products';

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(await adminView());
  return { title: `${t(view.dict, 'reportsV5.products.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ProductsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withReportsV5(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-testid="rp-products" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.products.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.common.${k}`, v);
  const b = await loadBase(access.deps, sp);
  const r = await loadProducts(access, b);
  const f = makeFmt(view.locale, b.currency);
  const { q, notes } = b.period;
  const current = QUICK_PERIODS.find((p) => p === sp.period) ?? QUICK_PERIODS.find((p) => {
    const x = quickPeriod(p, b.today);
    return x.from === q.from && x.to === q.to;
  });
  const rows = b.limits.maxDayRows;

  const styleLeaves = leaves(r.styles.rows).filter((x) => x.id !== null);
  const sold = styleLeaves.filter((x) => x.pieces > 0).length;
  const losing = styleLeaves.filter((x) => Math.sign(x.profitMinor) === -1).length;
  const restock = r.restock?.restock ?? [];
  const unsold = r.restock?.unsold ?? [];
  const num = (id: string, label: string, n: number, extra: Partial<SummaryTile> = {}): SummaryTile => ({ key: id, label, value: n, shown: f.num(n), format: { kind: 'number', locale: view.locale }, ...extra });
  const tiles: SummaryTile[] = [
    { key: 'sales', label: c('kSales'), value: r.sales.salesMinor, shown: f.amount(r.sales.salesMinor), format: f.format, delta: change(r.sales.salesMinor, r.salesWas.salesMinor), vs: cc('vs', { from: f.day(b.before.from), to: f.day(b.before.to) }) },
    num('pieces', c('kPieces'), r.styles.total.pieces, { delta: change(r.styles.total.pieces, r.stylesWas.total.pieces) }),
    num('styles', c('kStyles'), sold),
    num('losing', c('kLosing'), losing, { tone: losing > 0 ? 'bad' : undefined }),
    ...(r.restock ? [num('restock', c('kRestock'), restock.length, { vs: c('kRestockSub'), tone: restock.length > 0 ? 'warn' : undefined }), num('unsold', c('kUnsold'), unsold.length, { vs: c('kUnsoldSub') })] : []),
  ];

  const days = daysBetween(q.from, q.to, rows);
  const prevDays = daysBetween(b.before.from, b.before.to, rows);
  const hero = heroRange({
    key: 'p',
    label: `${f.dayShort(q.from)} – ${f.dayShort(q.to)}`,
    days,
    values: seriesOf(days, r.sales.byDay, (x) => x.salesMinor),
    before: seriesOf(prevDays, r.salesWas.byDay, (x) => x.salesMinor),
    total: r.sales.salesMinor,
    delta: change(r.sales.salesMinor, r.salesWas.salesMinor),
    vs: cc('vs', { from: f.day(b.before.from), to: f.day(b.before.to) }),
    amount: f.amount,
    dayLabel: f.dayShort,
    mini: [{ label: cc('orders'), shown: f.num(r.sales.orders) }],
  });

  const ranked = [...r.styles.rows].sort((a, z) => z.profitMinor - a.profitMinor);
  const moreStyles = ranked.length > rows;
  const listCols = [{ h: c('colProduct') }, { h: c('colSizes'), right: true }, { h: c('colDays'), right: true }, { h: c('colSold30'), right: true }];
  const listRows = (xs: typeof restock) =>
    xs.map((x) => [
      <Link key="n" className="a2-lnk cr-link" href={`/admin/products/${x.productId}`}>
        {x.name}
      </Link>,
      c('sizesOf', { n: x.sizesInStock, total: x.sizesTotal }),
      x.stockDays === null ? '—' : f.num(x.stockDays),
      f.num(x.sold30),
    ]);

  return (
    <div className="a2-z lm-rp" data-testid="rp-products" data-lm-ready="" data-from={q.from} data-to={q.to}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={b.today} current={current} csv={`/api/admin/reports/export/products?from=${q.from}&to=${q.to}`} notes={notes} limitDays={b.limits.maxDays} />
      <p className="a2-xs a2-mute a2-mt12">
        {cc('period', { from: f.day(q.from), to: f.day(q.to) })} · {cc('vs', { from: f.day(b.before.from), to: f.day(b.before.to) })}
      </p>
      <SummaryTiles className="a2-mt12" tiles={tiles} label={cc('tilesLabel')} testId="rp-tiles" />
      <div className="a2-mt12 mo-hero">
        <HeroChart title={c('heroTitle')} ranges={[hero]} format={f.format} seriesName={c('heroSeries')} prevName={cc('heroPrev')} testId="rp-hero" />
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-st" data-testid="rp-styles">
        <h2 className="a2-h3" id="rp-st">
          {c('styles')}
        </h2>
        <p className="a2-cs">{c('stylesSub')}</p>
        <ReportTable
          testId="rp-styles-table"
          rowId="rp-style-row"
          empty={cc('none')}
          cols={[{ h: c('colStyle') }, { h: c('colPieces'), right: true }, { h: c('colSales'), right: true }, { h: c('colProfit'), right: true }, { h: c('colMargin'), right: true }]}
          rows={ranked.slice(0, rows).map((x) => [
            <span key="n" style={{ paddingLeft: x.depth * 14 }}>
              <b>{x.name ?? t(d, 'reportsV5.channel.noStyle')}</b>
            </span>,
            f.num(x.pieces),
            f.amount(x.salesMinor),
            <b key="p" style={x.profitMinor < 0 ? { color: 'var(--bad)' } : undefined}>
              {f.amount(x.profitMinor)}
            </b>,
            f.pctOf(marginPct(x)),
          ])}
        />
        {moreStyles ? <p className="a2-xs a2-mute a2-mt6">{cc('cut', { n: rows })}</p> : null}
      </section>

      {r.restock ? (
        <>
          <section className="a2-card a2-mt12" aria-labelledby="rp-rs" data-testid="rp-restock">
            <h2 className="a2-h3" id="rp-rs">
              {c('restock')}
            </h2>
            <p className="a2-cs">{c('restockSub')}</p>
            <ReportTable testId="rp-restock-table" rowId="rp-restock-row" empty={c('noneRestock')} cols={listCols} rows={listRows(restock)} />
            <div className="ct-actions a2-mt12">
              <Link className="a2-btn cr-tap" href="/admin/stock">
                {c('toStock')}
              </Link>
            </div>
          </section>
          <section className="a2-card a2-mt12" aria-labelledby="rp-un" data-testid="rp-unsold">
            <h2 className="a2-h3" id="rp-un">
              {c('unsold')}
            </h2>
            <p className="a2-cs">{c('unsoldSub')}</p>
            <ReportTable testId="rp-unsold-table" rowId="rp-unsold-row" empty={c('noneUnsold')} cols={listCols} rows={listRows(unsold)} />
            <div className="ct-actions a2-mt12">
              <Link className="a2-btn cr-tap" href="/admin/combos">
                {c('toCombos')}
              </Link>
            </div>
          </section>
        </>
      ) : (
        <p className="a2-xs a2-mute a2-mt12" data-testid="rp-no-reports-key">
          {cc('noKey')}
        </p>
      )}

      <HowFigures
        dict={d}
        testId="rp-how"
        items={[
          { label: c('kSales'), how: c('how.sales'), href: `/admin/money/profit/groups?by=style&from=${q.from}&to=${q.to}`, linkText: c('styles') },
          { label: c('kPieces'), how: c('how.pieces') },
          { label: c('kRestock'), how: c('how.restock'), href: '/admin/reports', linkText: c('restock') },
          { label: c('kUnsold'), how: c('how.unsold'), href: '/admin/reports', linkText: c('unsold') },
        ]}
      />
    </div>
  );
}
