// PR 657 (CN-025, CN-044 ERP lane, follow-up 381) — Orders design C, "Command view": a flow strip of the order
// service's own queues (to confirm, awaiting advance, cancel pending, open, finished — the same counts the view chips
// already show, `@/lib/admin-orders/model` LIST_PAGES), a denser table (CSS only: tighter rows, same columns, same
// bulk bar) and the same filters and footer as design A. Nothing here reads a figure design A does not already read.
import Link from 'next/link';
import { EmptyList, Kpis, ordersDict, readDeps, filterSelects } from '@/components/admin/orders/OrderListPage';
import { OrderFilters } from '@/components/admin/orders/OrderFilters';
import { OrderTable } from '@/components/admin/orders/OrderTable';
import { PageHead, SectionTabs } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { BULK_COMMANDS, BULK_PERM } from '@/lib/admin-orders/bulk';
import { bulkFilesFor } from '@/lib/admin-orders/bulk-files';
import { loadOrderList } from '@/lib/admin-orders/list';
import { LIST_PAGES, listHref, type ListPageId } from '@/lib/admin-orders/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { LookMenu } from '../LookMenu';
import { LookThumb } from '../thumbs';
import type { LookDesign } from '../types';
import { FLOW_VIEWS, type OrdersDesignProps } from './common';

function FlowStrip({ p, counts }: { p: OrdersDesignProps; counts: Record<string, number> }) {
  const { view, query } = p;
  const d = view.dict;
  return (
    <nav className="a3-oflow" aria-label={t(d, 'orders.list.viewsAria')} data-testid="orders-flow">
      {FLOW_VIEWS.map((v) => {
        const on = query.view === v;
        return (
          <Link key={v} className={`a3-ofstep${on ? ' on' : ''}`} href={listHref('all', { view: query.view }, { view: v })} aria-current={on ? 'page' : undefined} scroll={false} data-testid={`orders-flow-${v}`}>
            <span>{t(d, `orders.view.${v}`)}</span>
            <b className="a3-num">{formatNumber(counts[v] ?? 0, view.locale)}</b>
          </Link>
        );
      })}
    </nav>
  );
}

async function OrdersC(p: OrdersDesignProps) {
  const { view, a, query, now, menu } = p;
  const d = view.dict;
  const page: ListPageId = 'all';
  const data = await loadOrderList(readDeps(a.deps), a.who, view, page, query);
  const filtered = !!(query.q || query.status || query.payment || query.source || query.risk || query.section);
  const canBulk = BULK_COMMANDS.filter((c) => a.perms.has(BULK_PERM[c]));
  const files = bulkFilesFor(a.perms);
  const shown = formatNumber(data.rows.length, view.locale);
  return (
    <div className="a2-z a3-ordc" data-testid="orders-list" data-design="C" data-lm-ready="">
      <PageHead view={view} place={locateKey('orders')} title={t(d, 'orders.page.all')} sub={t(d, 'orders.list.sub')} right={<LookMenu {...menu} />} />
      <SectionTabs view={view} current="orders" />
      <Kpis view={view} a={a} counts={data.counts} now={now} />
      <FlowStrip p={p} counts={data.counts} />
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
          <div className="a3-odense">
            <OrderTable dict={ordersDict(view)} rows={data.rows} bulk={canBulk.length || files.length ? { commands: canBulk, holdOptions: data.holdOptions, files } : null} />
          </div>
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

function ThumbC() {
  return <LookThumb page="orders" id="C" />;
}

export const ordersC: LookDesign<OrdersDesignProps, 'list'> = {
  key: 'C',
  name: { en: 'Command view', bn: 'কমান্ড ভিউ' },
  desc: {
    en: 'A flow strip of the queues that matter (to confirm, awaiting advance, cancel pending, open, finished) above a denser table. The same filters, bulk actions and figures as the classic list.',
    bn: 'জরুরি কিউগুলোর ফ্লো স্ট্রিপ (কনফার্ম বাকি, অগ্রিম বাকি, বাতিল বাকি, খোলা, শেষ) আর নিচে ঘন টেবিল। ফিল্টার, বাল্ক কাজ আর সংখ্যা ক্লাসিক তালিকার মতোই।',
  },
  parts: ['list'],
  Render: OrdersC,
  Thumb: ThumbC,
};
