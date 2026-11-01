// What the order page in My account adds under the order itself, read on the server for the customer whose order it is
// (his account, or the browser that placed it — the same customer the account API answers):
// - follow-up 260 (PR 143): the customer's own edit — what he may change now, or why not (`orders.edit.customer`, off
//   by default: no card at all while it is off, and none on a cancelled or returned order);
// - follow-up 261 (PR 146): the two-size question still open on it (`orders.twoSize`, off by default);
// - S05 · PR 150: "What happened" — the order's life as he may see it (`account.history.timeline`);
// - Gate F-041 (PR 172 follow-up): the refunds on it and where each stands (always, when there is one: it is his money);
// - S08 · PR 186: the exchange part — which pieces he may still exchange (the buttons under each line) and his exchanges
//   on this order (`orders.exchange.account`, off by default; his account only, never a guest's browser).
// - PR 144 follow-up (go-live gate customer 360°): his own cancel — one tap, a request, or "you asked" — as the owner's
//   rule allows it now (`orders.cancel.customer`; nothing drawn when it allows none, e.g. once the courier is booked).
// A test server's browser that asked for the cards (POST /api/account/try-cards) reads the two switches as on. Without
// a database, or when a read is slow or fails, that part is simply not drawn — the page never guesses.
import { orderLifecycle, orderRefunds, type CustomerRefund, type LifeStep } from '@extas/accounts';
import { customerCancelState, customerEditState, customerExchangeState, customerTwoSizeState, type CustomerEditState, type CustomerExchangeState, type CustomerRef, type CustomerTwoSizeState, type OrdersDeps } from '@extas/orders';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { accountDeps, signedIn } from './account';
import { visitorId } from './bag';
import type { ShopContext } from './context';
import { cardsTrialSettings, tryCardsOn } from './try-cards';

export interface OrderEditView {
  state: CustomerEditState;
  /** Until when he may edit: while the order is new, or until the team starts picking it. */
  until: 'placed' | 'confirmed';
}

/** PR 144 follow-up: what his cancel card shows (null: no cancel open to him on this order). */
export interface OrderCancelView {
  mode: 'tap' | 'request' | 'requested';
  reasons: { key: string; en: string; bn: string }[];
}

export interface OrderExtras {
  edit: OrderEditView | null;
  cancel: OrderCancelView | null;
  twoSize: CustomerTwoSizeState | null;
  life: LifeStep[] | null;
  /** Gate F-041: his refunds on this order (null: none, or not readable now). */
  refunds: CustomerRefund[] | null;
  /** PR 186: the pieces he may still exchange and his exchanges on this order (null: off, a guest, or none of it). */
  exchange: CustomerExchangeState | null;
}

const NONE: OrderExtras = { edit: null, cancel: null, twoSize: null, life: null, refunds: null, exchange: null };

/** States after which there is nothing to change or answer (the edit card is not drawn at all). */
const ENDED = new Set(['CANCELLED', 'RETURNED']);

/** One part, or null when it fails (it never stops the page). */
async function part<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await withTimeout(run(), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the order page's ${what} is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

export async function orderExtras(c: Pick<ShopContext, 'storeId'>, number: string, status: string, opts: { timeline: boolean }): Promise<OrderExtras> {
  const deps = accountDeps();
  if (!deps) return NONE;
  const [me, visitor, trial] = await Promise.all([signedIn(), visitorId(), tryCardsOn()]);
  const who: CustomerRef = { storeId: c.storeId, customerId: me?.customer.id ?? null, visitorId: visitor };
  if (!who.customerId && !who.visitorId) return NONE;
  const settings = trial ? cardsTrialSettings(deps.settings) : deps.settings;
  const od: OrdersDeps = { db: deps.db, settings, ...(deps.now ? { now: deps.now } : {}) };
  const [edit, cancel, twoSize, life, refunds, exchange] = await Promise.all([
    ENDED.has(status)
      ? null
      : part('edit card', async () => {
          const [state, cfg] = await Promise.all([customerEditState(od, who, number), settings.value('orders.edit.customer', { storeId: c.storeId })]);
          return state.closed === 'OFF' ? null : { state, until: cfg.until };
        }),
    ENDED.has(status)
      ? null
      : part('cancel card', async (): Promise<OrderCancelView | null> => {
          const st = await customerCancelState(od, who, number);
          return st.mode === 'none' ? null : { mode: st.mode, reasons: st.reasons };
        }),
    ENDED.has(status) ? null : part('two-size question', async () => customerTwoSizeState(od, who, number)),
    opts.timeline ? part('timeline', () => orderLifecycle(deps, { storeId: c.storeId, number, customerId: who.customerId, visitorId: who.visitorId })) : null,
    part('refunds', () => orderRefunds(deps, { storeId: c.storeId, number, customerId: who.customerId, visitorId: who.visitorId })),
    who.customerId ? part('exchange part', () => customerExchangeState(od, { ...who, visitorId: null }, number)) : null,
  ]);
  const hasExchange = !!exchange && exchange.closed !== 'OFF' && (exchange.open || exchange.exchanges.length > 0);
  return { edit, cancel, twoSize: twoSize?.open ? twoSize : null, life, refunds: refunds?.length ? refunds : null, exchange: hasExchange ? exchange : null };
}
