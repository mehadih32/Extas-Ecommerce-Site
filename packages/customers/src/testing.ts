// The PostgreSQL tests' shared set-up (never imported by app code): the order fixture (a throwaway database with the
// real migrations, the sample catalogue, orders placed through the real checkout), a staff member with every customers
// permission (and `orders.read`, `audit.read`), one who may only read customers (numbers masked), and a helper that
// makes a customer profile. Every value is a made-up test value.
import { createRole, SYSTEM, type Actor } from '@extas/auth';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { CUSTOMER_PERMISSIONS, type CustomersDeps, type Who } from './context';

export interface CustomersFixture extends OrdersFixture {
  customersDeps: () => CustomersDeps;
  /** Every customers permission, `orders.read` and `audit.read`. */
  manager: Who;
  /** Only `customers.read`: numbers are masked. */
  viewer: Who;
  /** A customer profile in the test store. */
  profile: (data: { phone: string; name?: string; email?: string; whatsappNumber?: string; createdAt?: Date }) => Promise<string>;
}

export async function setUpCustomers(label: string): Promise<CustomersFixture> {
  const f = await setUpOrders(label);
  const p = f.t.prisma;
  const role = await createRole(p, SYSTEM, { key: 'test-customers', nameEn: 'customers', nameBn: 'customers', permissions: [...CUSTOMER_PERMISSIONS, 'orders.read', 'audit.read'] });
  const viewRole = await createRole(p, SYSTEM, { key: 'test-customers-read', nameEn: 'customer reader', nameBn: 'customer reader', permissions: ['customers.read'] });
  const m = await p.staffUser.create({ data: { email: 'customers@example.com', displayName: 'Customers Staff', passwordHash: 'not-a-login' } });
  const v = await p.staffUser.create({ data: { email: 'customer-reader@example.com', displayName: 'Customer Reader', passwordHash: 'not-a-login' } });
  await p.staffRoleAssignment.create({ data: { staffUserId: m.id, roleId: role.id, storeId: f.S } });
  await p.staffRoleAssignment.create({ data: { staffUserId: v.id, roleId: viewRole.id, storeId: f.S } });
  const manager: Actor = { staffUserId: m.id };
  return {
    ...f,
    customersDeps: () => ({ db: p, settings: f.deps().settings, now: () => f.clock.now }),
    manager: { actor: manager, storeId: f.S },
    viewer: { actor: { staffUserId: v.id }, storeId: f.S },
    async profile(data) {
      const c = await p.customer.create({ data: { storeId: f.S, phone: data.phone, name: data.name ?? null, email: data.email ?? null, whatsappNumber: data.whatsappNumber ?? null, ...(data.createdAt ? { createdAt: data.createdAt } : {}) } });
      return c.id;
    },
  };
}
