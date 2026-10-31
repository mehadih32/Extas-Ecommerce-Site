// What the order page in My account adds under the order itself, read on the server for the customer whose order it is
// (his account, or the browser that placed it — the same customer the account API answers):
// - follow-up 260 (PR 143): the customer's own edit — what he may change now, or why not (`orders.edit.customer`, off
//   by default: no card at all while it is off, and none on a cancelled or returned order);
// - follow-up 261 (PR 146): the two-size question still open on it (`orders.twoSize`, off by default);
// - S05 · PR 150: "What happened" — the order's life as he may see it (`account.history.timeline`).
// - Gate F-041 (PR 172 follow-up): the refunds on it and where each stands (always, when there is one: it is his money).
// A test server's browser that asked for the cards (POST /api/account/try-cards) reads the two switches as on. Without
// a database, or when a read is slow or fails, that part is simply not drawn — the page never guesses.
import { orderLifecycle, orderRefunds, type CustomerRefund, type LifeStep } from '@extas/accounts';
import { customerEditState, customerTwoSizeState, type CustomerEditState, type CustomerRef, type CustomerTwoSizeState, type OrdersDeps } from '@extas/orders';
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

export interface OrderExtras {
  edit: OrderEditView | null;
  twoSize: CustomerTwoSizeState | null;
  life: LifeStep[] | null;
  /** Gate F-041: his refunds on this order (null: none, or not readable now). */
  refunds: CustomerRefund[] | null;
}

const NONE: OrderExtras = { edit: null, twoSize: null, life: null, refunds: null };

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
  const [edit, twoSize, life, refunds] = await Promise.all([
    ENDED.has(status)
      ? null
      : part('edit card', async () => {
          const [state, cfg] = await Promise.all([customerEditState(od, who, number), settings.value('orders.edit.customer', { storeId: c.storeId })]);
          return state.closed === 'OFF' ? null : { state, until: cfg.until };
        }),
    ENDED.has(status) ? null : part('two-size question', async () => customerTwoSizeState(od, who, number)),
    opts.timeline ? part('timeline', () => orderLifecycle(deps, { storeId: c.storeId, number, customerId: who.customerId, visitorId: who.visitorId })) : null,
    part('refunds', () => orderRefunds(deps, { storeId: c.storeId, number, customerId: who.customerId, visitorId: who.visitorId })),
  ]);
  return { edit, twoSize: twoSize?.open ? twoSize : null, life, refunds: refunds?.length ? refunds : null };
}
