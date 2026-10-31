// S08 · PR 186 — the exchange part of My account, read on the server for the signed-in customer whose order it is: what
// his order may take now (each piece, the window, why not), and his exchanges on it (`orders.exchange.account`, off by
// default: then nothing at all). A guest's order has no exchange here — an exchange is asked for from the account.
// Without a database, or when a read is slow or fails, the part is simply not drawn; the page never guesses.
import { customerExchangeState, isOrdersError, type CustomerExchangeState } from '@extas/orders';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { accountDeps, signedIn } from './account';
import { cardsTrialSettings, tryCardsOn } from './try-cards';
import type { ShopContext } from './context';

export type ExchangeLoad = { kind: 'off' } | { kind: 'signedOut' } | { kind: 'notHis' } | { kind: 'state'; state: CustomerExchangeState };

/** His order's exchange state: off, signed out, not his, or the state (null-safe: a failure reads as off). */
export async function exchangeLoad(c: Pick<ShopContext, 'storeId'>, number: string): Promise<ExchangeLoad> {
  const deps = accountDeps();
  if (!deps) return { kind: 'off' };
  try {
    // a test server's browser that asked for the cards reads the switch as on (never on the live shop)
    const settings = (await tryCardsOn()) ? cardsTrialSettings(deps.settings) : deps.settings;
    const on = await withTimeout(settings.value('orders.exchange.account', { storeId: c.storeId }), settingsTimeoutMs());
    if (!on.enabled) return { kind: 'off' };
    const me = await signedIn();
    if (!me) return { kind: 'signedOut' };
    const od = { db: deps.db, settings, ...(deps.now ? { now: deps.now } : {}) };
    const state = await withTimeout(customerExchangeState(od, { storeId: c.storeId, customerId: me.customer.id, visitorId: null }, number), settingsTimeoutMs() * 6);
    return { kind: 'state', state };
  } catch (e) {
    if (isOrdersError(e) && e.code === 'NOT_FOUND') return { kind: 'notHis' };
    console.warn(`shop: the exchange part is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return { kind: 'off' };
  }
}
