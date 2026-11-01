// PR 414 follow-up (CN-013 go-live gate phase 2) — the dependencies of the gate-orders oracle (oracle.ts), built the way
// the admin builds them (apps/web/src/lib/orders-api.ts, shipping-api.ts, inventory-api.ts) with ONE difference: every
// connection is its mock. The connection layer gets a database view with no connection rows and a vault with no key,
// so `use()` falls through to each kind's practice adapter (A1.3) whatever the owner has switched on. The oracle can
// never reach a real courier, gateway, SMS or ERP, even by mistake; what the live shop does with its own connections is
// read separately (`liveProviders`) and turns the checks that would reach one into a SKIP.
import { allAdapters, createConnections, courierAdapters, type SmsMessage, type SmsSender } from '@extas/adapters';
import { SYSTEM } from '@extas/auth';
import type { AccountsDeps } from '@extas/accounts';
import type { CatalogueDeps } from '@extas/catalogue';
import type { PrismaClient } from '@extas/db/client';
import type { InventoryDeps } from '@extas/inventory';
import type { OrdersDeps, Who as OrdersWho } from '@extas/orders';
import type { PaymentsDeps } from '@extas/payments';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { ShippingDeps } from '@extas/shipping';

/** The kinds a live connection of turns gate checks into a SKIP (never called by the oracle; the live shop might). */
export const PROVIDER_KINDS = ['PAYMENT', 'COURIER', 'SMS', 'WHATSAPP', 'EMAIL', 'ERP'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

type ConnDb = Parameters<typeof createConnections>[0]['db'];

/** A database view for the connection layer with no connection rows: every kind resolves to its mock. */
function mockOnlyDb(): ConnDb {
  const none = async () => [];
  const refuse = async () => {
    throw new Error('the gate oracle runs every connection on its mock; it never tests or switches one');
  };
  return { integration: { findMany: none, findUniqueOrThrow: refuse }, integrationTestRun: { create: refuse }, auditLog: { create: refuse }, $transaction: refuse } as unknown as ConnDb;
}

/** The connection layer on mocks only (no vault, no rows). */
export function mockConnections(adapters: Parameters<typeof createConnections>[0]['adapters']) {
  return createConnections({ db: mockOnlyDb(), vault: { get: async () => null }, adapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
}

/** A sender that keeps what it would send in this process only: no SMS leaves the server (the sign-in code is read here). */
export function keptSms(): { sender: SmsSender; sent: SmsMessage[] } {
  const sent: SmsMessage[] = [];
  return {
    sent,
    sender: {
      async send(m) {
        sent.push(m);
        return { ok: true, messageId: `gate-kept-${sent.length}` };
      },
    },
  };
}

export interface GateDeps {
  db: PrismaClient;
  storeId: number;
  settings: SettingsResolver<typeof registry>;
  who: OrdersWho;
  orders: OrdersDeps;
  shipping: ShippingDeps;
  payments: PaymentsDeps;
  inventory: InventoryDeps;
  catalogue: CatalogueDeps;
  accounts: (sms: SmsSender) => AccountsDeps;
}

/** Every service the oracle calls, on the store's database and settings, as the system actor with its own audit source. */
export function gateDeps(db: PrismaClient, storeId: number): GateDeps {
  const settings = new SettingsResolver(prismaBackend(db), registry);
  const inventory: InventoryDeps = { db, settings, connections: mockConnections(allAdapters) };
  const orders: OrdersDeps = { db, settings, inventory };
  return {
    db,
    storeId,
    settings,
    // the system actor (every permission), with the gate run named on each audit row and timeline line it writes
    who: { actor: SYSTEM, storeId, ctx: { source: 'gate-orders', userAgent: 'extas-gate-orders' } },
    orders,
    shipping: { db, settings, connections: mockConnections(courierAdapters) },
    payments: { db, settings },
    inventory,
    catalogue: { db, settings },
    accounts: (sender) => ({ db, settings, sms: async () => ({ sender, mode: 'MOCK' as const }) }),
  };
}
