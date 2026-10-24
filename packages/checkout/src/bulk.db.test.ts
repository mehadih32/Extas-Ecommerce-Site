// PR 606 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL). SIM-F-023 (required acceptance test): a team
// wants 40 polos and the shop holds 4 — the bag stops at 4, and now it says so: the bulk card shows (a line at the
// stock in hand), the enquiry goes in with the bag's lines and the 40 he wants, and the team sees it in its list and
// moves its stage (audited). Off by default: no enquiry is taken. One number or browser sends at most `perDay` a day.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { bagView, CartError, setQuantity } from '@extas/cart';
import { registry } from '@extas/settings';
import { bulkCardReason, listBulkEnquiries, sendBulkEnquiry, setBulkEnquiryStatus, type TeamWho } from './index';
import { setUpCheckout, type CheckoutFixture } from './testing';

const LANE_ON = { ...registry['orders.bulkLane'].default, enabled: true };
const FORM = { name: 'Sabrina Test', phone: '01700006060', company: 'Test Ltd', quantity: '40', logo: true, lang: 'en', source: 'bag' }; // hardcode-ok: a made-up test number

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 606 · the bulk / corporate lane (PostgreSQL)', () => {
  let f: CheckoutFixture;
  let staff: TeamWho;
  let reader: TeamWho;
  const db = () => f.t.prisma;

  beforeAll(async () => {
    f = await setUpCheckout('bulk');
    const p = f.t.prisma;
    const all = await createRole(p, SYSTEM, { key: 'test-bulk-team', nameEn: 'team', nameBn: 'team', permissions: ['orders.read', 'orders.notes'] });
    const ro = await createRole(p, SYSTEM, { key: 'test-bulk-read', nameEn: 'reader', nameBn: 'reader', permissions: ['orders.read'] });
    const u = await p.staffUser.create({ data: { email: 'bulk-team@example.com', displayName: 'Bulk Team', passwordHash: 'not-a-login' } });
    const r = await p.staffUser.create({ data: { email: 'bulk-read@example.com', displayName: 'Bulk Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: all.id, storeId: f.S } });
    await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: ro.id, storeId: f.S } });
    staff = { actor: { staffUserId: u.id }, storeId: f.S };
    reader = { actor: { staffUserId: r.id }, storeId: f.S };
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off by default: no enquiry is taken', async () => {
    expect(await code(sendBulkEnquiry(f.deps(), { storeId: f.S, visitorId: null, input: { ...FORM, itemsText: 'Polos' } }))).toBe('NOT_OPEN');
    expect(await db().bulkEnquiry.count()).toBe(0);
  });

  it('SIM-F-023: 40 polos asked, 4 in stock — the bag says "bulk order? talk to us", and the enquiry carries the bag and the 40', async () => {
    f.overrides.set('orders.bulkLane', LANE_ON);
    const v = f.variant('oxford-cotton-shirt', 'sky', 'M');
    await db().stockLevel.updateMany({ where: { variantId: v.id }, data: { onHand: 4, available: 4, reserved: 0 } });
    const bag = await f.bag('bulk-40', [{ variantId: v.id }]);
    const line = await db().cartItem.findFirstOrThrow({ where: { cartId: bag.cartId }, select: { id: true } });
    // the bag cannot hold 40 …
    const refused = await setQuantity(f.deps(), { storeId: f.S, cartId: bag.cartId, lineId: line.id, quantity: 40 }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(CartError);
    await setQuantity(f.deps(), { storeId: f.S, cartId: bag.cartId, lineId: line.id, quantity: 4 });
    // … so it shows the bulk card instead of stopping silently
    const view = await bagView(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en' });
    expect(view.items[0]).toMatchObject({ quantity: 4, maxQuantity: 4 });
    expect(bulkCardReason(LANE_ON, view.summary.count, view.items)).toBe('stock');

    const sent = await sendBulkEnquiry(f.deps(), { storeId: f.S, visitorId: bag.visitorId, ip: '192.0.2.60', input: { ...FORM, withBag: true } });
    expect(sent.ref).toBe('BQ-1001');
    const row = await db().bulkEnquiry.findUniqueOrThrow({ where: { id: sent.id } });
    expect(row).toMatchObject({ status: 'NEW', name: 'Sabrina Test', phone: '+8801700006060', company: 'Test Ltd', quantity: 40, logo: true, source: 'bag', itemsText: null });
    expect(row.items).toEqual([{ productId: expect.any(String), variantId: v.id, name: expect.any(String), colour: expect.any(String), size: 'M', quantity: 4 }]);
    // the bag is untouched: an enquiry is not an order
    expect(await db().cart.findUniqueOrThrow({ where: { id: bag.cartId }, select: { status: true } })).toEqual({ status: 'ACTIVE' });
  });

  it('a form with a problem names its field; the owner minimum holds', async () => {
    f.overrides.set('orders.bulkLane', { ...LANE_ON, minQuantity: 50 });
    const e = await sendBulkEnquiry(f.deps(), { storeId: f.S, visitorId: null, input: { ...FORM, phone: '01700006061', itemsText: 'Polos' } }).catch(
      (x: unknown) => x as { code: string; data: unknown },
    );
    expect(e).toMatchObject({ code: 'FORM', data: { field: 'quantity', problem: 'few' } });
    f.overrides.set('orders.bulkLane', LANE_ON);
  });

  it('at most `perDay` a day from one number; the next day it opens again; numbers run on', async () => {
    f.overrides.set('orders.bulkLane', { ...LANE_ON, perDay: 2 });
    const one = { storeId: f.S, visitorId: null, input: { ...FORM, phone: '01700006062', itemsText: 'Panjabis' } };
    expect((await sendBulkEnquiry(f.deps(), one)).ref).toBe('BQ-1002');
    expect((await sendBulkEnquiry(f.deps(), one)).ref).toBe('BQ-1003');
    expect(await code(sendBulkEnquiry(f.deps(), one))).toBe('TOO_MANY');
    f.clock.now = new Date(f.clock.now.getTime() + 25 * 3_600_000);
    expect((await sendBulkEnquiry(f.deps(), one)).ref).toBe('BQ-1004');
    f.overrides.set('orders.bulkLane', LANE_ON);
  });

  it("the team's list (orders.read) and its stage (orders.notes, audited); nobody else moves it", async () => {
    const list = await listBulkEnquiries(f.deps(), reader, {});
    expect(list.rows.map((r) => r.ref)).toEqual(['BQ-1004', 'BQ-1003', 'BQ-1002', 'BQ-1001']);
    expect(list.counts.NEW).toBe(4);
    expect(list.rows.at(-1)).toMatchObject({ quantity: 40, logo: true, items: [expect.objectContaining({ quantity: 4 })] });
    const id = list.rows.at(-1)!.id;
    expect(await code(setBulkEnquiryStatus(f.deps(), reader, id, { status: 'CONTACTED' }))).toBe('FORBIDDEN');
    expect(await setBulkEnquiryStatus(f.deps(), staff, id, { status: 'CONTACTED' })).toEqual({ id, status: 'CONTACTED' });
    expect(await db().auditLog.count({ where: { action: 'bulkEnquiry.status', entityId: id } })).toBe(1);
    expect((await listBulkEnquiries(f.deps(), reader, { status: 'CONTACTED' })).rows.map((r) => r.ref)).toEqual(['BQ-1001']);
    expect(await code(setBulkEnquiryStatus(f.deps(), staff, id, { status: 'PRICED' }))).toBe('INVALID_INPUT');
  });
});
