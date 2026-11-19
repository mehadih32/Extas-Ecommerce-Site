// PR 141 — ORD-02 To confirm (demo V12.3 #/admin/orders/confirm, 97r): the call queue. The chips are the order
// service's own views (new orders to confirm, the customers' cancel requests, waiting for an advance) with their counts;
// the queue on the left, and the chosen order's call card on the right: who to phone, what they ordered and owe, their
// history, the cancel request to answer, and the commands open now (Confirm, Hold, Cancel …) through the same dialogs
// as the order page. A phone shows the queue, then the card. Self-confirm by WhatsApp, voice orders and the call log
// come with their PRs (148 and the call-task screens); nothing here is a sample.
import Link from 'next/link';
import type * as od from '@extas/orders';
import type { AdminView } from '@/lib/admin-page';
import type { ApprovalCard } from '@/lib/admin-orders/approval';
import type { OrderDetailView } from '@/lib/admin-orders/detail';
import type { OrderListData } from '@/lib/admin-orders/list';
import { listHref, type ListQuery } from '@/lib/admin-orders/model';
import { locateKey } from '@/lib/admin-shell/sections';
import type { CommandSpec } from '@/lib/admin-orders/spec';
import type { CourierScoreCardView } from '@/lib/admin-orders/courier-score';
import { PROCESSING_TAGS, type ProcessingTag } from '@/lib/admin-orders/processing-tags';
import { t, type Dict } from '@/lib/i18n';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs } from '../shell/ShellParts';
import { ShellIcon } from '../shell/ShellIcon';
import { CallDeskCards } from './CallDeskCards';
import { CommandButton } from './OrderCommands';
import { EmptyList, ViewChips } from './OrderListPage';
import { Chips } from './OrderTable';
import { ProcessingCards } from './ProcessingCards';

export const pickHref = (query: ListQuery, id: string) => {
  const base = listHref('confirm', query, { cursor: query.cursor });
  return `${base}${base.includes('?') ? '&' : '?'}order=${id}`;
};

/** PR 533 — the customer history at approval (only while the owner's `customers.approvalHistory` is on). */
function HistoryCard({ h }: { h: ApprovalCard }) {
  return (
    <section className="a2-card" data-testid="approval-history">
      <h2 className="a2-h3">
        {h.title}
        {h.grade ? (
          <span className="a2-pill info" style={{ marginLeft: 6 }} data-testid="approval-grade">
            {h.grade}
          </span>
        ) : null}
        {h.verified ? (
          <span className="a2-pill ok" style={{ marginLeft: 6 }}>
            ✓ {h.verified}
          </span>
        ) : null}
      </h2>
      <div className="a2-xs a2-mute">{h.sub}</div>
      {h.tiles ? (
        <>
          <div className="a2-hist a2-mt12">
            {h.tiles.map((x) => (
              <div key={x.key} data-k={x.key} data-tone={x.tone}>
                <b>{x.value}</b>
                <span>{x.label}</span>
              </div>
            ))}
          </div>
          {h.reasons.length || h.noReason ? (
            <>
              <h3 className="a2-sm a2-mt12">{h.reasonsTitle}</h3>
              {h.reasons.map((r, i) => (
                <div key={i} className="a2-rule">
                  <span>{r.label}</span>
                  <b className="a2-num">{r.value}</b>
                </div>
              ))}
              {h.noReason ? <div className="a2-xs a2-mute">{h.noReason}</div> : null}
            </>
          ) : null}
          <h3 className="a2-sm a2-mt12">{h.recentTitle}</h3>
          {h.recent.map((r) => (
            <div key={r.number} className="a2-rule">
              <span>
                <Link className="a2-lnk" href={r.href}>
                  {r.number}
                </Link>
                <span className="a2-xs a2-mute">{` · ${r.placed}${r.extra ? ` · ${r.extra}` : ''}`}</span>
              </span>
              <b className={`a2-pill ${r.tone}`}>{r.outcome}</b>
            </div>
          ))}
        </>
      ) : (
        <div className="a2-sm a2-mt12">{h.first}</div>
      )}
      <div className="a2-xs a2-mute a2-mt12">{h.note}</div>
    </section>
  );
}

export function OrderConfirmPage({ view, query, list, chosen, oldest, open, history = null, rulesConfirmed = null, mergeLine = null, cards = null, desk = null, deskWords = null, noAnswer = {}, tags = {}, tag = null, scores = {} }: { view: AdminView; query: ListQuery; list: OrderListData; chosen: OrderDetailView | null; oldest: string | null; open: string | null; history?: ApprovalCard | null; rulesConfirmed?: number | null; mergeLine?: string | null; /** PR 1064: the Processing view's card grid (the orders' own detail reads); null: the queue and call card. */ cards?: OrderDetailView[] | null; /** PR 1120: the call desk over the grid (prototype v5) and its words. */ desk?: od.CallDesk | null; deskWords?: Dict | null; noAnswer?: Record<string, CommandSpec>; /** PR 1127: each card's reasons (prototype chips), the chosen chip (?tag=) and each card's courier score. */ tags?: Record<string, ProcessingTag[]>; tag?: ProcessingTag | null; scores?: Record<string, CourierScoreCardView> }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const toConfirm = list.counts.toConfirm ?? 0;
  // PR 952 (prototype v5): "N need a person · rules already confirmed M of the current batch"
  const needs = list.counts.processing ?? 0;
  const sub =
    query.view === 'processing' && rulesConfirmed !== null
      ? t(d, 'orders.confirm.subProto', { n: n(needs), m: n(rulesConfirmed) })
      : toConfirm
        ? t(d, 'orders.confirm.sub', { n: n(toConfirm), age: oldest ?? '' })
        : t(d, 'orders.confirm.subNone');
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
      {history ? <HistoryCard h={history} /> : null}
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
    <div className="a2-z" data-testid="orders-confirm" data-lm-ready="">
      <PageHead view={view} place={locateKey('ordersConfirm')} title={t(d, 'orders.page.confirm')} sub={sub} right={
        <span className="a2-gap8">
          <Link className="a2-btn" href="/admin/rules" data-testid="orders-auto-rules">
            {t(d, 'orders.confirm.autoRules')}
          </Link>
          {desk ? null : (
            <Link className="a2-btn" href="/admin/orders/confirm/calls" data-testid="orders-call-desk">
              {t(d, 'orders.confirm.callDesk')}
            </Link>
          )}
        </span>
      } />
      <SectionTabs view={view} current="ordersConfirm" />
      {desk && deskWords ? <CallDeskCards d={deskWords} desk={desk} w={(k, v) => t(deskWords, `cl.${k}`, v)} n={n} /> : null}
      {cards ? (
        <>
          {/* PR 1127 (prototype v5): the reasons as chips (All, No stock, No answer, Suspicious, Merge needed, Advance asked) beside the merge line; the other lists stay one press away */}
          <div className="a2-between o6-tagbar a2-mt12">
            <nav className="a2-views" aria-label={t(d, 'orders.proc.tagAll')} data-testid="processing-tags">
              <Link className={`a2-view${tag ? '' : ' on'}`} href={listHref('confirm', query)} aria-current={tag ? undefined : 'page'} scroll={false}>
                {t(d, 'orders.proc.tagAll')}
                <span className="a2-cnt">{n(cards.length)}</span>
              </Link>
              {PROCESSING_TAGS.map((k) => (
                <Link key={k} className={`a2-view${tag === k ? ' on' : ''}`} href={`${listHref('confirm', query)}${listHref('confirm', query).includes('?') ? '&' : '?'}tag=${k}`} aria-current={tag === k ? 'page' : undefined} scroll={false} data-tag={k}>
                  {t(d, `orders.proc.tag.${k}`)}
                  <span className="a2-cnt">{n(cards.filter((c) => (tags[c.id] ?? []).includes(k)).length)}</span>
                </Link>
              ))}
            </nav>
            {mergeLine ? (
              <span className="a2-xs a2-mute" data-testid="orders-merge-line">
                {mergeLine}
              </span>
            ) : null}
          </div>
          <details className="a2-more-opts a2-mt6" data-testid="processing-views">
            <summary className="a2-sm">{t(d, 'orders.proc.views')}</summary>
            <ViewChips view={view} page="confirm" query={query} counts={list.counts} />
          </details>
        </>
      ) : (
        <ViewChips view={view} page="confirm" query={query} counts={list.counts} />
      )}
      {mergeLine && !cards ? (
        <p className="a2-sm a2-mute a2-mt12" data-testid="orders-merge-line">
          {mergeLine}
        </p>
      ) : null}
      {list.rows.length && cards ? (
        <>
          {tag && !cards.some((c) => (tags[c.id] ?? []).includes(tag)) ? <p className="a2-sm a2-mute a2-mt12">{t(d, 'orders.proc.tagNone')}</p> : null}
          <ProcessingCards view={view} cards={tag ? cards.filter((c) => (tags[c.id] ?? []).includes(tag)) : cards} noAnswer={noAnswer} tags={tags} scores={scores} />
          {list.next ? (
            <Link className="a2-btn sm a2-mt12" href={listHref('confirm', query, { cursor: list.next })}>
              {t(d, 'orders.list.next')}
            </Link>
          ) : null}
        </>
      ) : list.rows.length ? (
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
        <EmptyList view={view} filtered={!!query.cursor} clear={listHref('confirm', { view: query.view })} all={false} none={query.view === 'processing'} />
      )}
    </div>
  );
}
