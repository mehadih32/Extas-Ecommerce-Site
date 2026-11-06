// S12 · PR 253 (register "Article-to-product attribution: what an article actually sold") — Website › Blog & journal ›
// What articles sold at /admin/website/blog/sold, drawn in Lumen (CN-036: the shared patterns, --lm-* tokens only,
// data-lm-ready): for the last 7/30/90 shop days (or the Performance card's days), each article and the products in
// the orders that read it (lib/journal/sold.ts over @extas/metrics `linesByArticle`): pieces ordered beside pieces
// delivered and their Sales (delivered orders only), and whether each product was in the article's own product block
// or bought besides. The counts on top; the list by article with chips and a search; a row opens its products in the
// drawer. Read-only. Seeing needs `blog.read`; the amounts `reports.read` (without it, pieces only).
// Guide: docs/admin-guide/pages/website/blog-sold.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ListView, type ListRow } from '@/components/admin/lumen/ListView';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { PERIOD_CHOICES } from '@/lib/journal/performance-model';
import { soldReport, soldWithoutMoney, type SoldArticle } from '@/lib/journal/sold';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import './sold.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/sold';
const KEY = 'blogSold';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.sd.meta'), robots: { index: false, follow: false } };
}

export default async function SoldPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `jr.${k}`, vars);
  const l = (k: string, vars?: Record<string, string | number>) => s(`sd.${k}`, vars);
  const canMoney = access.guard.permissions?.has('reports.read') ?? false;
  const asked = typeof sp.days === 'string' ? Number(sp.days) : null;
  const [full, currency] = await Promise.all([soldReport(access.deps.db, access.deps.resolver, new Date(), { days: asked }), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const r = canMoney ? full : soldWithoutMoney(full);
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const dayText = (ymd: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const periods = [...new Set([...PERIOD_CHOICES, full.days])].sort((a, b) => a - b);
  const pieces = r.articles.reduce((n, a) => n + a.piecesOrdered, 0);
  const fromBlock = r.articles.reduce((n, a) => n + a.fromBlock, 0);
  const share = pieces > 0 ? Math.round((fromBlock * 100) / pieces) : 0;
  const fmt = { kind: 'number', locale: view.locale } as const;
  const tiles: SummaryTile[] = [
    { key: 'articles', label: l('tArticles'), value: r.articles.length, shown: num(r.articles.length), format: fmt, icon: 'file' },
    { key: 'products', label: l('tProducts'), value: r.products, shown: num(r.products), format: fmt, icon: 'box' },
    { key: 'block', label: l('tBlock'), value: share, shown: `${num(share)}%`, format: { kind: 'percent', locale: view.locale }, icon: 'check' },
  ];
  const sums = (a: SoldArticle) => (
    <span className="sd-meta">
      <span>{l('ordered', { n: num(a.piecesOrdered) })}</span>
      <span>{l('delivered', { n: num(a.piecesDelivered) })}</span>
      {canMoney ? <span>{l('sales', { v: m(a.salesMinor) })}</span> : null}
    </span>
  );
  const name = (p: SoldArticle['products'][number]) => (p.name ? (view.lang === 'bn' && p.name.bn ? p.name.bn : p.name.en) : l('noProduct'));
  const rows: ListRow[] = r.articles.map((a) => ({
    id: a.id,
    chips: [...(a.fromBlock > 0 ? ['block'] : []), ...(a.products.some((p) => !p.inBlock) ? ['besides'] : [])],
    text: `${a.title} ${a.products.map((p) => `${p.name?.en ?? ''} ${p.name?.bn ?? ''}`).join(' ')}`,
    cells: (
      <div className="sd-row">
        <span className="sd-t" lang={a.locale}>
          {a.title}
        </span>
        <span className="sd-meta">
          <span className="sd-pill">{s(`lang.${a.locale}`)}</span>
          {a.live ? null : <span className="sd-pill warn">{l('notLive')}</span>}
          <span>{l('nProducts', { n: num(a.products.length) })}</span>
        </span>
        {sums(a)}
      </div>
    ),
    detailTitle: a.title,
    detailSub: l('detailSub', { from: dayText(r.from), to: dayText(r.to) }),
    detail: (
      <div className="sd-row">
        <div className="sd-tw">
          <table className="sd-tbl" data-testid="sd-products">
            <thead>
              <tr>
                <th>{l('col.product')}</th>
                <th className="r">{l('col.ordered')}</th>
                <th className="r">{l('col.delivered')}</th>
                {canMoney ? <th className="r">{l('col.sales')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {a.products.map((p) => (
                <tr key={p.productId ?? 'none'}>
                  <td>
                    {p.productId ? <Link href={`/admin/products/${p.productId}`}>{name(p)}</Link> : name(p)}{' '}
                    <span className={`sd-pill${p.inBlock ? ' ok' : ''}`}>{p.inBlock ? l('inBlock') : l('besides')}</span>
                  </td>
                  <td className="r">{num(p.ordered.pieces)}</td>
                  <td className="r">{num(p.sales.pieces)}</td>
                  {canMoney ? <td className="r">{m(p.sales.valueMinor)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link className="lm-btn" href={`/admin/website/blog/${a.id}`}>
          {l('openArticle')}
        </Link>
      </div>
    ),
  }));

  return (
    <div className="a2-z sd-page" data-testid="blog-sold" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={
          <Link className="bd-crumb" href="/admin/website/blog">
            {s('e.back')}
          </Link>
        }
        title={l('title')}
        sub={l('sub')}
      />
      <SectionTabs view={view} current={KEY} />
      <nav className="sd-nav" aria-label={l('periodLabel')} data-testid="sd-periods">
        {periods.map((n) => (
          <Link key={n} className={`lm-btn${n === r.days ? ' pri' : ''}`} href={`${HERE}?days=${n}`} aria-current={n === r.days ? 'page' : undefined}>
            {l('days', { n: num(n) })}
          </Link>
        ))}
      </nav>
      <p className="sd-span" data-testid="sd-span">
        {l('span', { from: dayText(r.from), to: dayText(r.to), days: num(r.days), tz: r.timeZone })}
      </p>
      {r.counting ? null : (
        <p className="lm-card sd-off" role="note" data-testid="sd-off">
          {l('off')} <Link href="/admin/website/blog/performance">{l('openPerf')}</Link>
        </p>
      )}
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="sd-tiles" />
      <section className="lm-card" aria-labelledby="sd-list-h" data-testid="sd-list-card">
        <h2 className="lm-h2" id="sd-list-h">
          {l('list')}
        </h2>
        <ListView
          rows={rows}
          chips={[
            { key: 'block', label: l('chipBlock') },
            { key: 'besides', label: l('chipBesides') },
          ]}
          allLabel={l('all')}
          searchLabel={l('search')}
          empty={{ title: l('empty'), text: l('emptyText') }}
          testId="sd-list"
        />
      </section>
      <p className="lm-card sd-note">{l(r.credit === 'every' ? 'noteEvery' : 'noteLast')}</p>
      {canMoney ? null : <p className="sd-note">{l('noMoney')}</p>}
    </div>
  );
}
