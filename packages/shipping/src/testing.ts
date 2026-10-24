// The PostgreSQL tests' shared set-up (never imported by app code): the order fixture (a throwaway database with the
// real migrations, the sample catalogue, orders placed through the real checkout), the order staff member given every
// shipping permission too, a reader with only `delivery.read`, and the courier connection layer with no keys — so every
// courier runs on its practice world. Every value is a made-up test value.
import { createConnections, courierAdapters, type CourierApi } from '@extas/adapters';
import { createRole, SYSTEM, type Actor } from '@extas/auth';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { SHIPPING_PERMISSIONS, type ShippingDeps, type Who } from './context';

export interface ShippingFixture extends OrdersFixture {
  shippingDeps: () => ShippingDeps;
  /** The order staff member, with every shipping permission as well. */
  shipper: Who;
  /** Staff who may only see the courier list (`delivery.read`). */
  looker: Who;
  /** A courier account of `providerKey`, switched on. */
  courier: (providerKey: string, name?: string) => Promise<string>;
  api: (providerKey: string) => Promise<CourierApi>;
}

export async function setUpShipping(label: string): Promise<ShippingFixture> {
  const f = await setUpOrders(label);
  const p = f.t.prisma;
  const role = await createRole(p, SYSTEM, { key: 'test-shipping', nameEn: 'shipping', nameBn: 'shipping', permissions: [...SHIPPING_PERMISSIONS, 'delivery.read'] });
  await p.staffRoleAssignment.create({ data: { staffUserId: f.staffId, roleId: role.id, storeId: f.S } });
  const lookRole = await createRole(p, SYSTEM, { key: 'test-shipping-look', nameEn: 'look', nameBn: 'look', permissions: ['delivery.read'] });
  const l = await p.staffUser.create({ data: { email: 'looker@example.com', displayName: 'Looker', passwordHash: 'not-a-login' } });
  await p.staffRoleAssignment.create({ data: { staffUserId: l.id, roleId: lookRole.id, storeId: f.S } });
  const connections = createConnections({ db: p, vault: { get: async () => null }, adapters: courierAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
  const shippingDeps = (): ShippingDeps => ({ db: p, settings: f.deps().settings, connections, now: () => f.clock.now });
  const actor: Actor = { staffUserId: f.staffId };
  let n = 0;
  return {
    ...f,
    shippingDeps,
    shipper: { actor, storeId: f.S },
    looker: { actor: { staffUserId: l.id }, storeId: f.S },
    async courier(providerKey, name) {
      n += 1;
      return (await p.courierAccount.create({ data: { storeId: f.S, providerKey, name: name ?? `${providerKey} ${n}`, enabled: true } })).id;
    },
    async api(providerKey) {
      return (await connections.use<CourierApi>('COURIER', { storeId: f.S, provider: providerKey })).api;
    },
  };
}
