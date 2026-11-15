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
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { ReportAnswers, type AnswerLine } from '@/components/admin/reports/ReportAnswers';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { StyleTree, type TreeRow, type TreeTexts } from '@/components/admin/reports/StyleTree';
import { ReportTable } from '@/components/admin/reports/ReportParts';
import '@/components/admin/reports/report-bar.css';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { marginPct } from '@/lib/group-profit-view';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadBase, loadProducts, loadViews } from '@/lib/reports-v5/load';
import { change, leaves } from '@/lib/reports-v5/model';
import { withReportsV5 } from '@/lib/reports-v5/words';
import '../../settings-cards.css';
import '../../money/money.css';
import '../delivery/report.css';
import '@/components/admin/reports/report-tree.css';

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
  const cmp = sp.cmp !== '0';
  const views = await loadViews(access, 'products');
  const rows = b.limits.maxDayRows;

  const styleLeaves = leaves(r.styles.rows).filter((x) => x.id !== null);
  const sold = styleLeaves.filter((x) => x.pieces > 0).length;
  const losing = styleLeaves.filter((x) => Math.sign(x.profitMinor) === -1).length;
  const restock = r.restock?.restock ?? [];
  const unsold = r.restock?.unsold ?? [];
  const num = (id: string, label: string, n: number, extra: Partial<SummaryTile> = {}): SummaryTile => ({ key: id, label, value: n, shown: f.num(n), format: { kind: 'number', locale: view.locale }, ...extra });
  const bestStyle = [...styleLeaves].sort((x, y) => y.pieces - x.pieces)[0];
  const lines: AnswerLine[] = [];
  if (bestStyle && bestStyle.pieces > 0) lines.push({ text: c('ans.best', { name: bestStyle.name ?? '', pieces: f.num(bestStyle.pieces), sales: f.amount(bestStyle.salesMinor) }), tone: 'good', act: { label: c('ans.combo'), href: '/admin/combos' } });
  if (restock.length) lines.push({ text: c('ans.restock', { n: restock.length }), tone: 'bad', act: { label: c('ans.reorder'), href: '/admin/stock' } });
  if (unsold.length) lines.push({ text: c('ans.unsold', { n: unsold.length }), act: { label: c('ans.combo'), href: '/admin/combos' } });

  // PR 732: the style tree (a verdict from the owner's rules), best sellers, slow sellers and the categories table
  const rules = r.rules;
  const verdictOf = (x: (typeof r.styles.rows)[number]): TreeRow['verdict'] => {
    const m = marginPct(x);
    if (x.pieces >= rules.bulkPieces && m !== null && m >= rules.bulkMarginPct) return 'bulk';
    if (x.pieces > 0 && (x.pieces <= rules.stopPieces || (m !== null && m < rules.stopMarginPct))) return 'stop';
    return 'keep';
  };
  const treeRows: TreeRow[] = r.styles.rows
    .filter((x) => x.id !== null)
    .map((x) => ({ id: x.id as string, parentId: x.parentId, depth: x.depth, name: x.name ?? t(d, 'reportsV5.channel.noStyle'), pieces: f.num(x.pieces), sales: f.amount(x.salesMinor), profit: f.amount(x.profitMinor), margin: f.pctOf(marginPct(x)), loss: x.profitMinor < 0, verdict: verdictOf(x) }));
  const leafVerdicts = styleLeaves.map(verdictOf);
  const bulkN = leafVerdicts.filter((v) => v === 'bulk').length;
  const stopN = leafVerdicts.filter((v) => v === 'stop').length;
  const tiles: SummaryTile[] = [
    num('restock', c('kRestock'), restock.length, { vs: c('kRestockSub'), tone: restock.length > 0 ? 'warn' : undefined }),
    num('bulk', c('kBulk'), bulkN, { vs: c('kBulkSub') }),
    num('stop', c('kStop'), stopN, { vs: c('kStopSub') }),
    num('pieces', c('kPieces'), r.styles.total.pieces, { delta: change(r.styles.total.pieces, r.stylesWas.total.pieces) }),
    num('styles', c('kStyles'), sold),
    { key: 'sales', label: c('kSales'), value: r.sales.salesMinor, shown: f.amount(r.sales.salesMinor), format: f.format },
    num('losing', c('kLosing'), losing, { tone: losing > 0 ? 'bad' : undefined }),
    ...(r.restock ? [num('unsold', c('kUnsold'), unsold.length)] : []),
  ];
  const treeTexts: TreeTexts = { label: c('treeLabel'), name: c('treeName'), pieces: c('treePieces'), sales: c('treeSales'), profit: c('treeProfit'), margin: c('treeMargin'), verdict: c('treeVerdict'), bulk: c('vBulk'), stop: c('vStop'), keep: c('vKeep'), openAll: c('openAll'), closeAll: c('closeAll') };
  const bestSellers = [...styleLeaves].filter((x) => x.pieces > 0).sort((x, y) => y.pieces - x.pieces).slice(0, 8);
  const bestMax = Math.max(1, ...bestSellers.map((x) => x.pieces));
  const catWas = new Map(r.categoriesWas.rows.map((x) => [x.id, x]));
  const catRows = [...r.categories.rows].filter((x) => x.depth === 0 && (x.pieces > 0 || x.salesMinor > 0)).sort((x, y) => y.salesMinor - x.salesMinor);
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
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={b.today} p={typeof sp.p === 'string' ? sp.p : undefined} cmp={cmp} before={b.before} reportKey="products" views={views} day={f.dayShort} csv={`/api/admin/reports/export/products?from=${q.from}&to=${q.to}`} notes={notes} limitDays={b.limits.maxDays} />
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

      <section className="a2-card a2-mt12" aria-labelledby="rp-tr" data-testid="rp-style-tree">
        <h2 className="a2-h3" id="rp-tr">
          {c('tree')}
        </h2>
        <p className="a2-cs">{c('treeSub')}</p>
        <div className="rt-rules" data-testid="rp-rules">
          <span>
            <span className="a2-pill ok">{c('vBulk')}</span>
            {c('rBulk', { pieces: f.num(rules.bulkPieces), margin: f.num(rules.bulkMarginPct) })}
          </span>
          <span>
            <span className="a2-pill bad">{c('vStop')}</span>
            {c('rStop', { pieces: f.num(rules.stopPieces), margin: f.num(rules.stopMarginPct) })}
          </span>
          <span>
            <span className="a2-pill line">{c('vKeep')}</span>
            {c('rKeep')}
          </span>
        </div>
        {treeRows.length ? <StyleTree rows={treeRows} texts={treeTexts} /> : <p className="a2-sm a2-mute">{cc('none')}</p>}
      </section>

      <div className="rp-grid2 a2-mt12">
        <section className="a2-card" aria-labelledby="rp-bs" data-testid="rp-best">
          <h2 className="a2-h3" id="rp-bs">
            {c('best')}
          </h2>
          <p className="a2-cs">{c('bestSub')}</p>
          {bestSellers.length ? (
            <ul className="rt-bars">
              {bestSellers.map((x) => (
                <li key={x.id} className="rt-bar" data-testid="rp-best-row">
                  <b>{x.name ?? t(d, 'reportsV5.channel.noStyle')}</b>
                  <span>{c('pcs', { n: f.num(x.pieces), sales: f.amount(x.salesMinor) })}</span>
                  <span className="rt-track" aria-hidden="true">
                    <i style={{ width: `${Math.max(2, (x.pieces / bestMax) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute">{c('bestNone')}</p>
          )}
        </section>
        {r.restock ? (
          <section className="a2-card" aria-labelledby="rp-sl" data-testid="rp-slow">
            <h2 className="a2-h3" id="rp-sl">
              {c('slow')}
            </h2>
            <p className="a2-cs">{c('slowSub')}</p>
            {unsold.length ? (
              <ul className="rt-list">
                {unsold.slice(0, 6).map((x) => (
                  <li key={x.productId} data-testid="rp-slow-row">
                    <div>
                      <Link className="a2-lnk" href={`/admin/products/${x.productId}`}>
                        {x.name}
                      </Link>
                      <span className="a2-xs a2-mute cl-sub">{c('slowItem', { n: f.num(x.sold30) })}</span>
                    </div>
                    <span className="a2-pill warn">{c('inStock', { n: x.sizesInStock, total: x.sizesTotal })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('noneUnsold')}</p>
            )}
          </section>
        ) : null}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-ct" data-testid="rp-cats">
        <h2 className="a2-h3" id="rp-ct">
          {c('cats')}
        </h2>
        <p className="a2-cs">{c('catsSub')}</p>
        <ReportTable
          testId="rp-cats-table"
          rowId="rp-cat-row"
          empty={cc('none')}
          cols={[{ h: c('colCategory') }, { h: c('colPieces'), right: true }, { h: c('colSales'), right: true }, { h: c('colVs'), right: true }, { h: c('colMargin'), right: true }]}
          rows={catRows.slice(0, rows).map((x) => {
            const was = catWas.get(x.id);
            const ch = was ? change(x.salesMinor, was.salesMinor) : null;
            return [<b key="n">{x.name ?? c('catNone')}</b>, f.num(x.pieces), f.amount(x.salesMinor), ch === null ? '—' : f.pct(ch), f.pctOf(marginPct(x))];
          })}
        />
      </section>

      {r.restock ? (
        <div className="rp-grid2 a2-mt12">
          <section className="a2-card" aria-labelledby="rp-rs" data-testid="rp-restock">
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
          <section className="a2-card" aria-labelledby="rp-un" data-testid="rp-unsold">
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
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt12" data-testid="rp-no-reports-key">
          {cc('noKey')}
        </p>
      )}

    </div>
  );
}
