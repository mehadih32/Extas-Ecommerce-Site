// S08 · PR 185 — ORD-05 Returns & exchanges at /admin/orders/returns (demo V12.2 #/admin/orders/returns; Blueprint
// B1.8): the board of exchange cases, one case's card (`?case=<id>`) and "Start an exchange" for a delivered order
// (`?order=<number>&line=<orderItemId>&reason=&size=`). Seeing needs `returns.view`; approving, refusing and opening an
// exchange need `returns.decide`, which the order service checks again on every call. The page's own words are in
// messages/admin-returns.*.json (under `returns.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { ReturnsBoard, type ReturnsData, type StartStep } from '@/components/admin/orders/ReturnsBoard';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { returnsHref } from '@/lib/admin-returns/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-returns.bn.json';
import en from '../../../../../messages/admin-returns.en.json';

export const dynamic = 'force-dynamic';

const KEY = 'ordersReturns';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

/** The admin dictionary with this screen's own messages under `returns.*`. */
function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, returns: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'returns.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

/** A read the page can live without (a case or an order that is not there any more): null instead of an error. */
async function maybe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof od.OrdersError && (e.code === 'NOT_FOUND' || e.code === 'INVALID_INPUT')) return null;
    throw e;
  }
}

export default async function ReturnsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('returns.view', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const q = { case: one(sp.case), order: one(sp.order), line: one(sp.line), reason: one(sp.reason), size: one(sp.size) };
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(returnsHref(q))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="returns.view" />
      </div>
    );
  const perms = access.guard.permissions ?? new Set<string>();
  const who: od.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const [rows, currency, causes, found, chargeRules, paths] = await Promise.all([
    od.listExchanges(rd, who, {}),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }),
    access.deps.resolver.value('orders.exchange.rootCauses', { storeId: MOTHER_STORE_ID }),
    q.order ? od.exchangeOrderLines(rd, who, q.order) : Promise.resolve(null),
    access.deps.resolver.value('orders.exchange.charge', { storeId: MOTHER_STORE_ID }),
    // CN-028 · PR 612: on ERP contract v6 the hand-back desk takes the place of Receive & QC
    od.legacyPaths(rd, MOTHER_STORE_ID),
  ]);
  const chosen = q.case ? (rows.find((r) => r.id === q.case) ?? (await maybe(od.exchangeDetail(rd, who, q.case)))) : null;
  // PR 188: the size switcher, while the piece going out may still change (before the courier has it).
  const sizes = chosen && perms.has('returns.decide') && od.EXCHANGE_SWITCHABLE.includes(chosen.status as (typeof od.EXCHANGE_SWITCHABLE)[number]) ? await maybe(od.exchangeSizes(rd, who, chosen.id)) : null;
  const line = found && q.line && found.lines.some((l) => l.id === q.line) ? q.line : null;
  const choices = found && line ? await maybe(od.exchangeChoices(rd, who, found.orderId, { orderItemId: line, reason: q.reason ?? od.EXCHANGE_REASON_CODES[0], ...(q.size ? { sizeKey: q.size } : {}) })) : null;
  // PR 189: a return after receipt for the same line (the policy says whether there is one)
  const ret = found && line ? await maybe(od.returnChoices(rd, who, found.orderId)) : null;
  const start: StartStep = { number: q.order ?? '', found, line, reason: choices && q.reason && choices.reasons.includes(q.reason as od.ExchangeReason) ? q.reason : null, size: q.size, choices, ret };
  const data: ReturnsData = {
    rows,
    chosen,
    start,
    money: moneyOf(currency, view.locale),
    canDecide: perms.has('returns.decide'),
    canQc: perms.has('returns.qc'),
    causes: causes.map((c) => ({ key: c.key, label: view.lang === 'bn' ? c.bn : c.en })),
    sizes,
    canWaive: perms.has('returns.waive'),
    canClaims: perms.has('returns.claims.decide'),
    claimPhoto: chargeRules.claimPhoto,
  };
  // CN-028 · PR 614: on ERP contract v6 the chosen case shows its exchange as the ERP has it
  if (paths.model === 'v6')
    data.erp = {
      model: 'v6',
      canApprove: perms.has('exchange.approve'),
      canLate: perms.has('exchange.approve') || perms.has('returns.handback'),
      state: chosen ? await maybe(od.exchangeErpState(rd, who, chosen.id)) : null,
      today: new Intl.DateTimeFormat('en-CA', { timeZone: view.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    };
  const d = view.dict;
  // PR 191: the refused parcels and the refused-parcel list beside Receive & QC
  const right = (
    <div className="a2-gap8">
      <Link className="a2-btn" href={`${returnsHref()}/refused`} data-testid="returns-refused-link">
        <ShellIcon name="info" size={15} />
        {t(d, 'returns.refused.open')}
      </Link>
      {paths.model === 'v6' ? (
        <Link className="a2-btn" href={`${returnsHref()}/erp`} data-testid="returns-erp-link">
          <ShellIcon name="info" size={15} />
          {t(d, 'returns.erp.title')}
        </Link>
      ) : null}
      {paths.model === 'v6' && perms.has('returns.handback') ? (
        <Link className="a2-btn pri" href={`${returnsHref()}/handback`} data-testid="returns-handback-link">
          <ShellIcon name="check" size={15} />
          {t(d, 'returns.handback.title')}
        </Link>
      ) : null}
      {data.canQc && paths.model === 'v5' ? (
        <Link className="a2-btn pri" href={`${returnsHref()}/qc`} data-testid="returns-qc-link">
          <ShellIcon name="check" size={15} />
          {t(d, 'returns.qc.open')}
        </Link>
      ) : null}
    </div>
  );
  return <ReturnsBoard view={view} data={data} head={<PageHead view={view} place={locateKey(KEY)} title={t(d, 'returns.title')} sub={t(d, 'returns.sub')} right={right} />} tabs={<SectionTabs view={view} current={KEY} />} />;
}
