// PR 140 — ORD-01 All orders (demo V12.3 #/admin/orders, 97r): the header, the section's tabs, four numbers (orders
// today, to confirm with the oldest's age, waiting for an advance, cancel pending courier), the saved views of the
// order service with their counts, the search and filters, the table (cards on a phone), and the next page. Everything
// is read through @extas/orders with the person's own keys (the same checks as the admin API); nothing is a sample.
import Link from 'next/link';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { kpi, lastDays } from '@extas/metrics';
import * as od from '@extas/orders';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import type { AdminDeps } from '@/lib/admin-auth';
import type { AdminView } from '@/lib/admin-page';
import { BULK_COMMANDS, BULK_PERM } from '@/lib/admin-orders/bulk';
import { FILTER_STATES, ageText, loadOrderList } from '@/lib/admin-orders/list';
import { LIST_PAGES, listHref, type ListPageId, type ListQuery } from '@/lib/admin-orders/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { PageHead, SectionTabs } from '../shell/ShellParts';
import { ShellIcon } from '../shell/ShellIcon';
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

async function Kpis({ view, a, counts, now }: { view: AdminView; a: ListAccess; counts: Record<string, number>; now: Date }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const canMoney = a.perms.has('metrics.read');
  const deps = readDeps(a.deps);
  const [today, currency, oldest] = await Promise.all([
    canMoney ? kpi(a.deps.db, MOTHER_STORE_ID, lastDays(1, now, view.timeZone).period) : Promise.resolve(null),
    a.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
    counts.toConfirm ? od.viewOldest(deps, a.who, 'toConfirm') : Promise.resolve(null),
  ]);
  const tile = (id: string, label: string, value: string, note: string, href?: string) => {
    const body = (
      <>
        <div className="a2-kl">{label}</div>
        <div className="a2-kv">{value}</div>
        <div className="a2-kf">
          <span className="a2-kn">{note}</span>
        </div>
      </>
    );
    return href ? (
      <Link key={id} className="a2-card a2-kpi" href={href} data-testid={`orders-kpi-${id}`}>
        {body}
      </Link>
    ) : (
      <div key={id} className="a2-card a2-kpi" data-testid={`orders-kpi-${id}`}>
        {body}
      </div>
    );
  };
  const tiles = [
    today ? tile('today', t(d, 'orders.kpi.today'), n(today.ordered.orders), t(d, 'orders.kpi.todayNote', { v: formatMoney(today.ordered.valueMinor, moneyOf(currency, view.locale)) })) : null,
    tile('toConfirm', t(d, 'orders.kpi.toConfirm'), n(counts.toConfirm ?? 0), oldest ? t(d, 'orders.kpi.toConfirmOld', { age: ageText(view, oldest, now) }) : t(d, 'orders.kpi.toConfirmNone'), listHref('all', { view: 'toConfirm' })),
    tile('advance', t(d, 'orders.kpi.advance'), n(counts.awaitingAdvance ?? 0), t(d, 'orders.kpi.advanceNote'), listHref('all', { view: 'awaitingAdvance' })),
    tile('cancelPending', t(d, 'orders.kpi.cancelPending'), n(counts.cancelPending ?? 0), t(d, 'orders.kpi.cancelPendingNote'), listHref('all', { view: 'cancelPending' })),
  ].filter(Boolean);
  return <div className="a2-kpis">{tiles}</div>;
}

/** The saved views: only the order service's own, each with its count. */
export function ViewChips({ view, page, query, counts }: { view: AdminView; page: ListPageId; query: ListQuery; counts: Record<string, number> }) {
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

/** The search and the three filters, with words and the person's language. */
export function filterSelects(view: AdminView, q: ListQuery): FilterSelect[] {
  const d = view.dict;
  const sel = (name: 'status' | 'payment' | 'source', values: readonly string[], key: string): FilterSelect => {
    const label = t(d, `orders.list.${name}`);
    return { name, label, any: t(d, 'orders.list.any', { name: label }), value: q[name] ?? '', options: values.map((v) => ({ value: v, label: t(d, `orders.${key}.${v}`) })) };
  };
  return [sel('status', FILTER_STATES, 'st'), sel('payment', od.PAYMENT_METHODS, 'method'), sel('source', od.ORDER_SOURCES, 'source')];
}

export async function OrderListPage({ view, a, query, now }: { view: AdminView; a: ListAccess; query: ListQuery; now: Date }) {
  const d = view.dict;
  const page: ListPageId = 'all';
  const data = await loadOrderList(readDeps(a.deps), a.who, view, page, query);
  const filtered = !!(query.q || query.status || query.payment || query.source);
  const canBulk = BULK_COMMANDS.filter((c) => a.perms.has(BULK_PERM[c]));
  const shown = formatNumber(data.rows.length, view.locale);
  return (
    <div className="a2-z" data-testid="orders-list">
      <PageHead view={view} place={locateKey('orders')} title={t(d, 'orders.page.all')} sub={t(d, 'orders.list.sub')} />
      <SectionTabs view={view} current="orders" />
      <Kpis view={view} a={a} counts={data.counts} now={now} />
      <ViewChips view={view} page={page} query={query} counts={data.counts} />
      <OrderFilters
        key={listHref(page, query)}
        action={LIST_PAGES[page].base}
        view={query.view}
        defaultView={LIST_PAGES[page].views[0]}
        q={query.q ?? ''}
        search={t(d, 'orders.list.search')}
        go={t(d, 'orders.list.searchGo')}
        aria={t(d, 'orders.list.filtersAria')}
        selects={filterSelects(view, query)}
        clear={filtered ? { href: listHref(page, { view: query.view }), label: t(d, 'orders.list.clear') } : null}
      />
      {data.rows.length ? (
        <>
          <OrderTable dict={ordersDict(view)} rows={data.rows} bulk={canBulk.length ? { commands: canBulk, holdOptions: data.holdOptions } : null} />
          <div className="a2-tblf a2-tblf-o" data-testid="orders-foot">
            <span>{t(d, 'orders.list.shown', { n: shown })}</span>
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
