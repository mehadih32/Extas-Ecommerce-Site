// PR 141 — ORD-02 To confirm (demo V12.3 #/admin/orders/confirm, 97r): the call queue. The chips are the order
// service's own views (new orders to confirm, the customers' cancel requests, waiting for an advance) with their counts;
// the queue on the left, and the chosen order's call card on the right: who to phone, what they ordered and owe, their
// history, the cancel request to answer, and the commands open now (Confirm, Hold, Cancel …) through the same dialogs
// as the order page. A phone shows the queue, then the card. Self-confirm by WhatsApp, voice orders and the call log
// come with their PRs (148 and the call-task screens); nothing here is a sample.
import Link from 'next/link';
import type { AdminView } from '@/lib/admin-page';
import type { OrderDetailView } from '@/lib/admin-orders/detail';
import type { OrderListData } from '@/lib/admin-orders/list';
import { listHref, type ListQuery } from '@/lib/admin-orders/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs } from '../shell/ShellParts';
import { ShellIcon } from '../shell/ShellIcon';
import { CommandButton } from './OrderCommands';
import { EmptyList, ViewChips } from './OrderListPage';
import { Chips } from './OrderTable';

export const pickHref = (query: ListQuery, id: string) => {
  const base = listHref('confirm', query, { cursor: query.cursor });
  return `${base}${base.includes('?') ? '&' : '?'}order=${id}`;
};

export function OrderConfirmPage({ view, query, list, chosen, oldest, open }: { view: AdminView; query: ListQuery; list: OrderListData; chosen: OrderDetailView | null; oldest: string | null; open: string | null }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const toConfirm = list.counts.toConfirm ?? 0;
  const sub = toConfirm ? t(d, 'orders.confirm.sub', { n: n(toConfirm), age: oldest ?? '' }) : t(d, 'orders.confirm.subNone');
  const card = chosen ? (
    <>
      <section className="a2-card" data-testid="call-card" data-order={chosen.number}>
        <div className="a2-ch">
          <div>
            <div className="a2-xs a2-mute">{`${chosen.placed} · ${chosen.source}`}</div>
            <h2 className="a2-h3">{`${chosen.number} · ${chosen.name}`}</h2>
            <div className="a2-mt6">
              <Chips chips={chosen.chips.filter((c) => c.icon !== 'truck')} />
            </div>
          </div>
          <Link className="a2-lnk" href={`/admin/orders/${chosen.id}`}>
            {t(d, 'orders.confirm.full')}
            <ShellIcon name="cr" size={14} />
          </Link>
        </div>
        <div className="a2-kv2">
          {chosen.customer
            .filter((r) => r.label !== t(d, 'orders.cust.email'))
            .flatMap((r) => [<span key={`${r.label}-k`}>{r.label}</span>, <span key={`${r.label}-v`}>{r.strong ? <b>{r.value}</b> : r.value}</span>])}
          {chosen.totals
            .filter((r) => r.strong || r === chosen.totals[chosen.totals.length - 1])
            .flatMap((r) => [<span key={`${r.label}-k`}>{r.label}</span>, <span key={`${r.label}-v`}>{r.value}</span>])}
        </div>
        {chosen.flags.length ? (
          <div className="a2-mt12">
            <Chips chips={chosen.flags} />
          </div>
        ) : null}
      </section>
      {chosen.bands
        .filter((b) => b.specs.length)
        .map((b) => (
          <section key={b.id} className={`a2-card tight a2-callband ${b.kind}`} data-testid={`call-${b.id}`}>
            <div className="a2-sm">{b.text}</div>
            <div className="a2-cmds a2-mt12">
              {b.specs.map((s) => (
                <CommandButton key={s.id} spec={s} size="sm" open={open === s.id} />
              ))}
            </div>
          </section>
        ))}
      {chosen.primary.length || chosen.more.length ? (
        <section className="a2-card tight">
          <div className="a2-cmds">
            {chosen.primary.map((s) => (
              <CommandButton key={s.id} spec={s} size="lg" open={open === s.id} />
            ))}
            {chosen.more.map((s) => (
              <CommandButton key={s.id} spec={s} open={open === s.id} />
            ))}
          </div>
          <div className="a2-xs a2-mute a2-mt12">{t(d, 'orders.confirm.never')}</div>
        </section>
      ) : null}
    </>
  ) : null;
  return (
    <div className="a2-z" data-testid="orders-confirm">
      <PageHead view={view} place={locateKey('ordersConfirm')} title={t(d, 'orders.page.confirm')} sub={sub} />
      <SectionTabs view={view} current="ordersConfirm" />
      <ViewChips view={view} page="confirm" query={query} counts={list.counts} />
      {list.rows.length ? (
        <div className="a2-row a2-r12 a2-start">
          <div className="a2-q" data-testid="call-queue">
            {list.rows.map((r) => (
              <Link key={r.id} className={`a2-qi${chosen?.id === r.id ? ' on' : ''}`} href={pickHref(query, r.id)} aria-current={chosen?.id === r.id ? 'true' : undefined} scroll={false}>
                <div>
                  <b>{`${r.number} · ${r.name || t(d, 'orders.list.none')}`}</b>
                  <span>{`${r.total} · ${r.age}`}</span>
                  <span className="a2-blk">{r.phone}</span>
                </div>
              </Link>
            ))}
            {list.next ? (
              <Link className="a2-btn sm" href={listHref('confirm', query, { cursor: list.next })}>
                {t(d, 'orders.list.next')}
              </Link>
            ) : null}
          </div>
          <div className="a2-stack">{card}</div>
        </div>
      ) : (
        <EmptyList view={view} filtered={!!query.cursor} clear={listHref('confirm', { view: query.view })} all={false} />
      )}
    </div>
  );
}
