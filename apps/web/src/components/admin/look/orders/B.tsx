// PR 656 (CN-025, CN-044 ERP lane, follow-up 381) — Orders design B, "Focus view": the "To confirm" queue as one big
// hero (the number that most needs a person, with its own button), the same four KPI tiles and view chips as design
// A, the filters folded away until asked for, and the same table, bulk bar and footer design A already has. Every
// figure comes from the one loader (`loadOrderList`, `@/lib/admin-orders/list`); this design reads nothing design A
// does not already read and writes nothing (a read-only re-arrangement, CN-044).
import Link from 'next/link';
import * as od from '@extas/orders';
import { EmptyList, Kpis, ordersDict, readDeps, ViewChips, filterSelects } from '@/components/admin/orders/OrderListPage';
import { OrderFilters } from '@/components/admin/orders/OrderFilters';
import { OrderTable } from '@/components/admin/orders/OrderTable';
import { PageHead, SectionTabs } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { BULK_COMMANDS, BULK_PERM } from '@/lib/admin-orders/bulk';
import { bulkFilesFor } from '@/lib/admin-orders/bulk-files';
import { ageText, loadOrderList } from '@/lib/admin-orders/list';
import { incompleteOpenCount } from '@/lib/admin-orders/incomplete';
import { LIST_PAGES, listHref, type ListPageId } from '@/lib/admin-orders/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { formatNumber } from '@/components/admin/products/model';
import { t } from '@/lib/i18n';
import { LookMenu } from '../LookMenu';
import { LookThumb } from '../thumbs';
import type { LookDesign } from '../types';
import type { OrdersDesignProps } from './common';

function Hero({ p, toConfirm, oldest }: { p: OrdersDesignProps; toConfirm: number; oldest: Date | null }) {
  const { view, now } = p;
  const d = view.dict;
  return (
    <section className="a3-card a3-ohero" data-testid="orders-hero">
      <div>
        <p className="a3-sub">{t(d, 'orders.kpi.toConfirm')}</p>
        <b className="a3-num a3-ohn">{formatNumber(toConfirm, view.locale)}</b>
        <p className="a3-sub">{oldest ? t(d, 'orders.kpi.toConfirmOld', { age: ageText(view, oldest, now) }) : t(d, 'orders.kpi.toConfirmNone')}</p>
      </div>
      {toConfirm ? (
        <Link className="a3-btn pri" href={listHref('all', { view: 'toConfirm' })} data-testid="orders-hero-go">
          <ShellIcon name="phone" size={16} />
          <span>{t(d, 'orders.view.toConfirm')}</span>
        </Link>
      ) : (
        <span className="a3-pill ok">
          <ShellIcon name="check" size={13} />
          {t(d, 'orders.kpi.toConfirmNone')}
        </span>
      )}
    </section>
  );
}

async function OrdersB(p: OrdersDesignProps) {
  const { view, a, query, now, menu } = p;
  const d = view.dict;
  const page: ListPageId = 'all';
  const [data, incomplete] = await Promise.all([loadOrderList(readDeps(a.deps), a.who, view, page, query), incompleteOpenCount({ db: a.deps.db, resolver: a.deps.resolver })]);
  const filtered = !!(query.q || query.status || query.payment || query.source || query.risk || query.section);
  const canBulk = BULK_COMMANDS.filter((c) => a.perms.has(BULK_PERM[c]));
  const files = bulkFilesFor(a.perms);
  const shown = formatNumber(data.rows.length, view.locale);
  const toConfirm = data.counts.toConfirm ?? 0;
  // Same one call Kpis makes for its own "to confirm" age line (`od.viewOldest`) — the hero's count and age always agree.
  const oldest = toConfirm ? await od.viewOldest(readDeps(a.deps), a.who, 'toConfirm') : null;
  return (
    <div className="a2-z a3-ordb" data-testid="orders-list" data-design="B" data-lm-ready="">
      <PageHead view={view} place={locateKey('orders')} title={t(d, 'orders.page.all')} sub={t(d, 'orders.list.sub')} right={<LookMenu {...menu} />} />
      <SectionTabs view={view} current="orders" />
      <Hero p={p} toConfirm={toConfirm} oldest={oldest} />
      <Kpis view={view} a={a} counts={data.counts} now={now} />
      <ViewChips view={view} page={page} query={query} counts={data.counts} incomplete={incomplete} />
      <details className="a3-ofold" data-testid="orders-filters-fold">
        <summary>
          <ShellIcon name="sliders" size={15} />
          <span>{t(d, 'orders.list.filtersAria')}</span>
        </summary>
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
      </details>
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

function ThumbB() {
  return <LookThumb page="orders" id="B" />;
}

export const ordersB: LookDesign<OrdersDesignProps, 'list'> = {
  key: 'B',
  name: { en: 'Focus view', bn: 'ফোকাস ভিউ' },
  desc: {
    en: 'The "To confirm" queue as one big number with its own button, the filters folded away until needed. The same table, bulk actions and views as the classic list.',
    bn: '"কনফার্ম বাকি" এক বড় সংখ্যা, নিজের বোতামসহ; ফিল্টার লাগলে তবেই খোলে। টেবিল, বাল্ক কাজ আর ভিউ ক্লাসিক তালিকার মতোই।',
  },
  parts: ['list'],
  Render: OrdersB,
  Thumb: ThumbB,
};
