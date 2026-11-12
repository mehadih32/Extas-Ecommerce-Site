// PR 140 — ORD-01 All orders (demo V12.3 #/admin/orders, 97r): the header, the section's tabs, four numbers (orders
// today, to confirm with the oldest's age, waiting for an advance, cancel pending courier), the saved views of the
// order service with their counts, the search and filters, the table (cards on a phone), and the next page. Everything
// is read through @extas/orders with the person's own keys (the same checks as the admin API); nothing is a sample.
// PR 632 (CN-036): in the Lumen look (data-lm-ready, light and dark): the four figures are Lumen summary tiles, the
// views, filters, table and bulk bar take the Lumen skin (app/admin/lumen-sections.css). Routes, filters and keys unchanged.
import Link from 'next/link';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { kpi, lastDays } from '@extas/metrics';
import * as od from '@extas/orders';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import type { AdminDeps } from '@/lib/admin-auth';
import type { AdminView } from '@/lib/admin-page';
import { BULK_COMMANDS, BULK_PERM } from '@/lib/admin-orders/bulk';
import { bulkFilesFor } from '@/lib/admin-orders/bulk-files';
import { FILTER_STATES, ageText, loadOrderList } from '@/lib/admin-orders/list';
import { incompleteOpenCount } from '@/lib/admin-orders/incomplete';
import { LIST_PAGES, listHref, type ListPageId, type ListQuery } from '@/lib/admin-orders/model';
import { locateKey } from '@/lib/admin-shell/sections';
import type { FieldOption } from '@/lib/admin-orders/spec';
import { RISK_SECTIONS } from '@extas/settings';
import { t, type Dict } from '@/lib/i18n';
import { PageHead, SectionTabs } from '../shell/ShellParts';
import { ShellIcon } from '../shell/ShellIcon';
import { SummaryTiles, type SummaryTile } from '../lumen/SummaryTiles';
import type { CountFormat } from '@/lib/admin-lumen/model';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import type { LookMenuProps } from '../look/LookMenu';
import { LookMenu } from '../look/LookMenu';
import { OrderFilters, type FilterSelect } from './OrderFilters';
import { OrderTable } from './OrderTable';

export interface ListAccess {
  deps: AdminDeps;
  who: od.Who;
  perms: ReadonlySet<string>;
}

/** The order words a browser part needs (only `orders.*`, not the whole admin). */
export const ordersDict = (view: AdminView): Dict => ({ orders: view.dict.orders as Dict });

/** The read side of the order service for a page (no inventory: pages only read). */
export const readDeps = (deps: AdminDeps): od.OrdersDeps => ({ db: deps.db, settings: deps.resolver, now: deps.now });

// PR 656 (CN-025, follow-up 381): exported so the Orders designs B and C (components/admin/look/orders/) can draw
// the same four figures, read through the one loader below, without a second query.
export async function Kpis({ view, a, counts, now }: { view: AdminView; a: ListAccess; counts: Record<string, number>; now: Date }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const canMoney = a.perms.has('metrics.read');
  const deps = readDeps(a.deps);
  const [today, currency, oldest] = await Promise.all([
    canMoney ? kpi(a.deps.db, MOTHER_STORE_ID, lastDays(1, now, view.timeZone).period) : Promise.resolve(null),
    a.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
    counts.toConfirm ? od.viewOldest(deps, a.who, 'toConfirm') : Promise.resolve(null),
  ]);
  // PR 632 (CN-036): the Lumen summary tiles (components/admin/lumen/SummaryTiles.tsx) with the same four figures.
  const num: CountFormat = { kind: 'number', locale: view.locale };
  const tile = (key: string, label: string, value: number, vs: string, href?: string, icon?: ShellIconName): SummaryTile => ({ key, label, value, shown: n(value), format: num, vs, href, icon });
  const tiles: SummaryTile[] = [
    ...(today ? [tile('today', t(d, 'orders.kpi.today'), today.ordered.orders, t(d, 'orders.kpi.todayNote', { v: formatMoney(today.ordered.valueMinor, moneyOf(currency, view.locale)) }), undefined, 'bag')] : []),
    tile('toConfirm', t(d, 'orders.kpi.toConfirm'), counts.toConfirm ?? 0, oldest ? t(d, 'orders.kpi.toConfirmOld', { age: ageText(view, oldest, now) }) : t(d, 'orders.kpi.toConfirmNone'), listHref('all', { view: 'toConfirm' }), 'phone'),
    tile('advance', t(d, 'orders.kpi.advance'), counts.awaitingAdvance ?? 0, t(d, 'orders.kpi.advanceNote'), listHref('all', { view: 'awaitingAdvance' }), 'wallet'),
    tile('cancelPending', t(d, 'orders.kpi.cancelPending'), counts.cancelPending ?? 0, t(d, 'orders.kpi.cancelPendingNote'), listHref('all', { view: 'cancelPending' }), 'uturn'),
  ];
  return <SummaryTiles tiles={tiles} label={t(d, 'orders.page.all')} testId="orders-kpi" />;
}

/**
 * The saved views: only the order service's own, each with its count. PR 274: All orders ends with "Incomplete" (typed
 * at checkout, not placed), its own page, with the open count.
 */
export function ViewChips({ view, page, query, counts, incomplete }: { view: AdminView; page: ListPageId; query: ListQuery; counts: Record<string, number>; incomplete?: number | null }) {
  return (
    <nav className="a2-views" aria-label={t(view.dict, 'orders.list.viewsAria')} data-testid="orders-views">
      {LIST_PAGES[page].views.map((v) => {
        const on = v === query.view;
        return (
          <Link key={v} className={`a2-view${on ? ' on' : ''}`} href={listHref(page, { view: query.view }, { view: v })} aria-current={on ? 'page' : undefined} scroll={false} data-view={v}>
            {t(view.dict, `orders.view.${v}`)}
            <span className="a2-cnt">{formatNumber(counts[v] ?? 0, view.locale)}</span>
          </Link>
        );
      })}
      {incomplete !== undefined && incomplete !== null ? (
        <Link className="a2-view" href="/admin/orders/incomplete" data-view="incomplete">
          {t(view.dict, 'orders.view.incomplete')}
          <span className="a2-cnt">{formatNumber(incomplete, view.locale)}</span>
        </Link>
      ) : null}
    </nav>
  );
}

/** Nothing to show: a filter that matches nothing (with the way back), an empty view, or a shop with no orders yet. */
export function EmptyList({ view, filtered, clear, all }: { view: AdminView; filtered: boolean; clear: string; all: boolean }) {
  const d = view.dict;
  const k = filtered ? 'title' : all ? 'none' : 'view';
  const b = filtered ? 'body' : all ? 'noneBody' : 'viewBody';
  return (
    <div className="a2-state" data-testid="orders-empty">
      <div className="a2-sti">
        <ShellIcon name={filtered ? 'search' : 'bag'} size={26} />
      </div>
      <h3>{t(d, `orders.list.empty.${k}`)}</h3>
      <p>{t(d, `orders.list.empty.${b}`)}</p>
      {filtered ? (
        <div className="a2-gap8">
          <Link className="a2-btn" href={clear}>
            {t(d, 'orders.list.clear')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The search and the filters, with words and the person's language. PR 541 (follow-up 295): the risk band (the owner's
 * bands), the section, and the order of the list (newest first, or the highest risk first).
 */
export function filterSelects(view: AdminView, q: ListQuery, bands: readonly FieldOption[] = []): FilterSelect[] {
  const d = view.dict;
  const sel = (name: 'status' | 'payment' | 'source' | 'section', values: readonly string[], key: string): FilterSelect => {
    const label = t(d, `orders.list.${name}`);
    return { name, label, any: t(d, 'orders.list.any', { name: label }), value: q[name] ?? '', options: values.map((v) => ({ value: v, label: t(d, `orders.${key}.${v}`) })) };
  };
  const risk = t(d, 'orders.list.risk');
  return [
    sel('status', FILTER_STATES, 'st'),
    sel('payment', od.PAYMENT_METHODS, 'method'),
    sel('source', od.LIST_SOURCES, 'source'),
    { name: 'risk', label: risk, any: t(d, 'orders.list.any', { name: risk }), value: q.risk ?? '', options: bands.map((b) => ({ value: b.value, label: b.label })) },
    sel('section', RISK_SECTIONS, 'section'),
    { name: 'sort', label: t(d, 'orders.list.sort'), any: t(d, 'orders.list.sortNew'), value: q.sort ?? '', options: [{ value: 'risk', label: t(d, 'orders.list.sortRisk') }] },
  ];
}

export async function OrderListPage({ view, a, query, now, menu }: { view: AdminView; a: ListAccess; query: ListQuery; now: Date; /** PR 656 (follow-up 381): the "…" menu that lets a person switch to design B or C; `null` keeps this page exactly as it drew before. */ menu?: LookMenuProps | null }) {
  const d = view.dict;
  const page: ListPageId = 'all';
  const [data, incomplete] = await Promise.all([loadOrderList(readDeps(a.deps), a.who, view, page, query), incompleteOpenCount({ db: a.deps.db, resolver: a.deps.resolver })]);
  const filtered = !!(query.q || query.status || query.payment || query.source || query.risk || query.section);
  const canBulk = BULK_COMMANDS.filter((c) => a.perms.has(BULK_PERM[c]));
  // follow-up 222: the ticked orders' files (Export, Print invoices), each with its own key
  const files = bulkFilesFor(a.perms);
  const shown = formatNumber(data.rows.length, view.locale);
  return (
    <div className="a2-z" data-testid="orders-list" data-lm-ready="">
      <PageHead view={view} place={locateKey('orders')} title={t(d, 'orders.page.all')} sub={t(d, 'orders.list.sub')} right={menu ? <LookMenu {...menu} /> : null} />
      <SectionTabs view={view} current="orders" />
      <Kpis view={view} a={a} counts={data.counts} now={now} />
      <ViewChips view={view} page={page} query={query} counts={data.counts} incomplete={incomplete} />
      <OrderFilters
        key={listHref(page, query)}
        action={LIST_PAGES[page].base}
        view={query.view}
        defaultView={LIST_PAGES[page].views[0]}
        q={query.q ?? ''}
        search={t(d, 'orders.list.search')}
        go={t(d, 'orders.list.searchGo')}
        aria={t(d, 'orders.list.filtersAria')}
        selects={filterSelects(view, query, data.bands)}
        clear={filtered || query.sort ? { href: listHref(page, { view: query.view }), label: t(d, 'orders.list.clear') } : null}
      />
      {data.rows.length ? (
        <>
          <OrderTable dict={ordersDict(view)} rows={data.rows} bulk={canBulk.length || files.length ? { commands: canBulk, holdOptions: data.holdOptions, files } : null} />
          <div className="a2-tblf a2-tblf-o" data-testid="orders-foot">
            <span>{t(d, 'orders.list.shown', { n: shown })}</span>
            {data.docsLine ? <span data-testid="orders-docs-line">{data.docsLine}</span> : null}
            <span className="a2-gap8">
              {query.cursor ? (
                <Link className="a2-btn sm" href={listHref(page, query, { cursor: undefined })}>
                  {t(d, 'orders.list.first')}
                </Link>
              ) : null}
              {data.next ? (
                <Link className="a2-btn sm" href={listHref(page, query, { cursor: data.next })} data-testid="orders-next">
                  {t(d, 'orders.list.next')}
                </Link>
              ) : null}
            </span>
          </div>
        </>
      ) : (
        <EmptyList view={view} filtered={filtered || !!query.cursor} clear={listHref(page, { view: query.view })} all={query.view === 'all'} />
      )}
    </div>
  );
}
