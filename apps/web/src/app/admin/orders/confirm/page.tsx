// PR 141 — ORD-02 To confirm at /admin/orders/confirm (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3): the call queue
// (`?view=toConfirm|cancelRequests|awaitingAdvance`, `?order=<id>` the chosen order, `?do=` a command's dialog). It
// needs `orders.confirm` in the store (the demo's key for this page); the order service checks every command again.
// PR 533: the chosen order's customer history card (orders, true deliveries, refusals and charge-paid returns with
// their reasons, exchanges) while the owner's `customers.approvalHistory` is on.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CommandsProvider } from '@/components/admin/orders/OrderCommands';
import { OrderConfirmPage } from '@/components/admin/orders/OrderConfirmPage';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { approvalCard } from '@/lib/admin-orders/approval';
import { CALLS_API } from '@/lib/admin-orders/calls-view';
import { courierScoreCardView, type CourierScoreCardView } from '@/lib/admin-orders/courier-score';
import { PROCESSING_TAGS, processingTags, type ProcessingTag } from '@/lib/admin-orders/processing-tags';
import type { CommandSpec } from '@/lib/admin-orders/spec';
import { DO_PERM, commandTexts, loadOrderDetail } from '@/lib/admin-orders/detail';
import { ageText, loadOrderList, parseListQuery } from '@/lib/admin-orders/list';
import { listHref } from '@/lib/admin-orders/model';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import callsBn from '../../../../../messages/admin-calls.bn.json';
import callsEn from '../../../../../messages/admin-calls.en.json';
import '../../parity-d6.css';

export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** PR 1064: how many cards the Processing grid draws at once (each is the order's own read; "Show more" goes on). */
const CARDS_SHOWN = 12; // hardcode-ok: a page size, not a business number

/** PR 1120: the call desk's words (`cl.desk.*`, the Calls to make page's own). */
function deskWords(view: { lang: string; dict: Dict }): Dict {
  return { ...view.dict, ...((view.lang === 'bn' ? callsBn : callsEn) as unknown as Dict) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'orders.page.confirm')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ConfirmQueuePage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('orders.confirm', deps, MOTHER_STORE_ID)]);
  const query = parseListQuery('confirm', sp);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(listHref('confirm', query))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="ordersConfirm" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="orders-confirm" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="orders.confirm" />
      </div>
    );
  const perms = access.guard.permissions ?? new Set<string>();
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const now = (access.deps.now ?? (() => new Date()))();
  // The queue is the list's own page of the view (no search or filters here: it is worked from the top).
  const q = { view: query.view, ...(query.cursor ? { cursor: query.cursor } : {}) };
  const [list, oldest] = await Promise.all([loadOrderList(rd, who, view, 'confirm', q), od.viewOldest(rd, who, 'toConfirm')]);
  const want = one(sp.order);
  // PR 1064 (prototype v5): the Processing view is a grid of cards with the commands on each card (the first page of the queue)
  const grid = query.view === 'processing';
  const pick = grid ? undefined : (list.rows.find((r) => r.id === want) ?? list.rows[0]);
  const cards = grid ? (await Promise.all(list.rows.slice(0, CARDS_SHOWN).map((r) => loadOrderDetail(rd, who, view, r.id, perms).catch(() => null)))).flatMap((x) => (x ? [x] : [])) : null;
  // PR 533: the customer history at approval, beside the call card (null while the owner's switch is off)
  const [chosen, hist] = pick ? await Promise.all([loadOrderDetail(rd, who, view, pick.id, perms), perms.has('orders.read') ? od.approvalHistory(rd, who, pick.id) : null]) : [null, null];
  const history = hist ? approvalCard(view, hist, new Map((await od.reasonLists(rd, who.storeId)).refusal.map((r) => [r.key, view.lang === 'bn' ? r.bn || r.en : r.en]))) : null;
  // PR 952 (prototype v5): how many of the current batch the rules already confirmed, and the merge look-back line
  const batch = perms.has('orders.read') ? await od.batchOverview(rd, who, now).catch(() => null) : null;
  const merge = (await access.deps.resolver.value('orders.mergeOrders', { storeId: MOTHER_STORE_ID }).catch(() => null)) as { lookBackDays: number; autoMerge: boolean } | null;
  const mergeLine = merge ? t(view.dict, 'orders.confirm.mergeLine', { days: String(merge.lookBackDays), state: t(view.dict, merge.autoMerge ? 'orders.confirm.on' : 'orders.confirm.off') }) : null;
  // PR 1120 (prototype v5): the call desk on top of the Processing grid, and "No answer" on each card that has an open call
  const desk = grid && perms.has('orders.read') ? await od.callDesk(rd, who).catch(() => null) : null;
  const noAnswer: Record<string, CommandSpec> = {};
  if (cards?.length && perms.has('orders.confirm')) {
    const [calls, outcomes, hist] = await Promise.all([
      od.openCallsOf(rd, MOTHER_STORE_ID, cards.map((c) => c.id)),
      access.deps.resolver.value('orders.callOutcomes', { storeId: MOTHER_STORE_ID }).catch(() => []),
      access.deps.resolver.value('risk.history', { storeId: MOTHER_STORE_ID }).catch(() => null),
    ]);
    const key = (hist?.noAnswerOutcomes ?? []).find((k) => outcomes.some((o) => o.key === k && !o.done));
    if (key)
      for (const c of cards) {
        const task = calls.get(c.id);
        if (!task) continue;
        noAnswer[c.id] = {
          id: `noanswer-${task}`,
          label: t(view.dict, 'orders.proc.noAnswer'),
          url: `${CALLS_API}/${task}`,
          version: null,
          fixed: { outcome: key },
          title: t(view.dict, 'orders.proc.noAnswerTitle', { name: c.name }),
          effects: [t(view.dict, 'orders.proc.noAnswerEff')],
          fields: [{ name: 'note', kind: 'textarea', label: t(view.dict, 'orders.call.record.note'), placeholder: t(view.dict, 'orders.call.record.notePh'), maxLength: 500 }],
          ok: t(view.dict, 'orders.proc.noAnswerOk'),
          okTone: 'pri',
          done: t(view.dict, 'orders.proc.noAnswerDone', { n: c.number }),
        };
      }
  }
  // PR 1127 (prototype v5): each card's reasons as the prototype's chips (?tag=), and its courier score on the card
  const histSetting = cards?.length ? await access.deps.resolver.value('risk.history', { storeId: MOTHER_STORE_ID }).catch(() => null) : null;
  const cardIds = (cards ?? []).map((c) => c.id);
  const tags: Map<string, ProcessingTag[]> = cardIds.length ? await processingTags(access.deps.db, MOTHER_STORE_ID, cardIds, histSetting?.noAnswerOutcomes ?? []) : new Map();
  const tagAsked = one(sp.tag);
  const tag = (PROCESSING_TAGS as readonly string[]).includes(tagAsked ?? '') ? (tagAsked as ProcessingTag) : null;
  const scores: Record<string, CourierScoreCardView> = {};
  if (cards?.length && perms.has('orders.risk.read'))
    await Promise.all(
      cards.map(async (c) => {
        const r = await od.orderCourierScore(rd, who, c.id).catch(() => null);
        if (r?.enabled && r.result) scores[c.id] = courierScoreCardView(view, r.result);
      }),
    );
  const wantDo = one(sp.do) ?? null;
  const open = wantDo && DO_PERM[wantDo] && perms.has(DO_PERM[wantDo]) ? wantDo : null;
  return (
    <CommandsProvider texts={commandTexts(view)}>
      <OrderConfirmPage view={view} query={q} list={list} chosen={chosen} oldest={oldest ? ageText(view, oldest, now) : null} open={open} history={history} rulesConfirmed={batch ? batch.moved.length : null} mergeLine={mergeLine} cards={cards} desk={desk} deskWords={desk ? deskWords(view) : null} noAnswer={noAnswer} tags={Object.fromEntries(tags)} tag={tag} scores={scores} />
    </CommandsProvider>
  );
}
