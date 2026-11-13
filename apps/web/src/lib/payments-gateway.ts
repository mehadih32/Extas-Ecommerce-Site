// S07 · PR 170 — the web app's side of the payment gateways: one connection layer per process for the payment adapters
// (each the practice gateway until the owner's keys pass the Test button in Keys & connections; the keys are read from
// the vault once per cache period), the payments service's dependencies for the shop (the gateways and the order hook
// that moves an order whose advance is now paid), and our callback address for a provider on the host the customer
// uses. The admin API (payments-api.ts) and the checkout's payment route use these.
import { createConnections, paymentAdapters, type Connections } from '@extas/adapters';
import { recordStatementCost } from '@extas/inventory';
import { autoConfirmQuietly, keptDeliveryCharge, recordAdvance, selfConfirmPrepaid } from '@extas/orders';
import { courierApi, noteStatementCharges } from '@extas/shipping';
import { connectionGateways, type GatewayResolver, type PaymentsDeps } from '@extas/payments';
import { adminDeps, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { shippingDeps } from './shipping-api';
import { gateRunSettings } from './shop/gate-run';

const holder = globalThis as unknown as { __paymentConnections?: { connections: Connections; at: number; ttlMs: number } };

async function connectionsFor(deps: AdminDeps): Promise<Connections> {
  const now = Date.now();
  const hit = holder.__paymentConnections;
  if (hit && now - hit.at < hit.ttlMs) return hit.connections;
  const [testSeconds, cacheSeconds] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: paymentAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
  holder.__paymentConnections = { connections, at: now, ttlMs: cacheSeconds * 1000 };
  return connections;
}

/** The gateway a provider runs on now for a store (its MOCK while no connection is switched on). */
export function gatewayResolver(deps: AdminDeps): GatewayResolver {
  return async (storeId, provider) => connectionGateways(await connectionsFor(deps))(storeId, provider);
}

/**
 * Follow-up 50 — the mode a provider's gateway runs in now for a store, for the shop's payment page and its go-live guard
 * (the test page answers only on the practice gateway; MOCK without a database).
 */
export async function paymentModeOf(storeId: number, provider: string): Promise<'MOCK' | 'SANDBOX' | 'LIVE'> {
  const d = adminDeps();
  return d ? (await gatewayResolver(d)(storeId, provider)).mode : 'MOCK';
}

/** The payments service's dependencies: the gateways, and the order service for an advance paid in full. */
export async function paymentsServiceDeps(deps: AdminDeps): Promise<PaymentsDeps> {
  return {
    db: deps.db,
    settings: deps.resolver,
    now: deps.now,
    gateways: gatewayResolver(deps),
    // S28 · PR 671: the couriers' own payment requests (each courier its practice world until its keys pass the Test)
    couriers: async (storeId, provider) => courierApi(await shippingDeps(deps), storeId, provider),
    orders: {
      async advancePaid(storeId, orderId, by) {
        const od = { db: deps.db, settings: deps.resolver, now: deps.now, inventory: await inventoryDeps(deps) };
        await recordAdvance(od, { storeId, orderId }, { actorType: by.actorId ? 'STAFF' : 'SYSTEM', actorId: by.actorId, source: by.source });
        // S28 · PR 663: the advance is in, the auto-confirm rules may now decide (off as shipped; never fails the payment)
        await autoConfirmQuietly({ db: deps.db, settings: deps.resolver, now: deps.now }, { storeId, orderId });
      },
      // follow-up 320: a prepaid order nothing flagged confirms by itself once paid (the owner's switch, off; confirm only)
      async paid(storeId, orderId) {
        await selfConfirmPrepaid({ db: deps.db, settings: deps.resolver, now: deps.now }, { storeId, orderId });
        await autoConfirmQuietly({ db: deps.db, settings: deps.resolver, now: deps.now }, { storeId, orderId });
      },
    },
    // PR 564: a statement's charges go to the charge mismatch log (record only, off until the owner's switch)
    courier: { statementCharges: (storeId, lines) => noteStatementCharges({ db: deps.db, settings: deps.resolver, now: deps.now }, storeId, lines) },
    // follow-up 565: an imported statement's courier charges or gateway fees as the day's cost line (only while the books' switch is on)
    books: {
      statementCost: async (who, cost) => recordStatementCost(await inventoryDeps(deps), who, cost),
      // S28 · PR 675: "Accept the courier figure" books the charge above ours on the delivery line (once per statement line)
      courierDifference: async (who, c) => recordStatementCost(await inventoryDeps(deps), who, { kind: 'COURIER_DIFFERENCE', statementId: c.lineId, reference: c.reference, amountMinor: c.amountMinor }),
    },
    // CN-018 (4): a split flexible set's kept part under the free-delivery limit owes the band charge (only while the owner's switch is on)
    door: { keptChargeMinor: (storeId, orderId, kept) => keptDeliveryCharge({ db: deps.db, settings: deps.resolver, now: deps.now }, storeId, orderId, kept) },
  };
}

/**
 * The shop's payments dependencies for this process, or null without a database. PR 170 follow-up: the go-live gate's
 * own browser reads the practice gateway as open while its run's grant is open (lib/shop/gate-run.ts); the admin's
 * payments dependencies (paymentsServiceDeps) are never wrapped.
 */
export async function shopPaymentsDeps(): Promise<PaymentsDeps | null> {
  const d = adminDeps();
  return d ? { ...(await paymentsServiceDeps(d)), settings: gateRunSettings(d.resolver) } : null;
}

/** The route a gateway calls back (`/api/payments/callback/<provider>`), on the host of this request, with the page's language. */
export function callbackBaseUrl(request: Request, provider: string, lang: string): string {
  const u = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? u.host;
  const proto = request.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const base = new URL(`${proto}://${host}/api/payments/callback/${encodeURIComponent(provider)}`);
  base.searchParams.set('lang', lang);
  return base.toString();
}
