// Follow-up 326 (PR 541) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the order list names what an
// order's open review is — PR 145's duplicate review, or PR 541's risk review with its section; a duplicate first when
// both are open; a decided review names nothing. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import type { Prisma } from '@extas/db/client';
import { listOrders, openReviewKinds } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('follow-up 326 · what the open review is, on the list (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const alert = (orderId: string, summary: Prisma.InputJsonObject, status: 'OPEN' | 'APPROVED' = 'OPEN') =>
    db().fraudAlert.create({ data: { storeId: f.S, orderId, matchedOrderIds: [], proposedAction: 'WARN', status, summary } });

  beforeAll(async () => {
    f = await setUpOrders('list-review');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('a duplicate, a risk section, both (the duplicate first), a decided one (nothing)', async () => {
    const dup = await f.place('lr-dup', { phone: '01700000601' });
    const risk = await f.place('lr-risk', { phone: '01700000602' });
    const both = await f.place('lr-both', { phone: '01700000603' });
    const done = await f.place('lr-done', { phone: '01700000604' });
    await alert(dup.orderId, { section: 'duplicate' });
    await alert(risk.orderId, { section: 'high', kind: 'risk', band: 'high' });
    await alert(both.orderId, { section: 'identity', kind: 'risk' });
    await alert(both.orderId, { section: 'duplicate' });
    await alert(done.orderId, { section: 'watch', kind: 'risk' }, 'APPROVED');
    const kinds = await openReviewKinds(f.ordersDeps(), f.S, [dup.orderId, risk.orderId, both.orderId, done.orderId]);
    expect(kinds.get(dup.orderId)).toEqual({ kind: 'duplicate' });
    expect(kinds.get(risk.orderId)).toEqual({ kind: 'risk', section: 'high' });
    expect(kinds.get(both.orderId)).toEqual({ kind: 'duplicate' });
    expect(kinds.has(done.orderId)).toBe(false);
    const rows = (await listOrders(f.ordersDeps(), f.staff, { view: 'all', limit: 100 })).rows;
    const of = (id: string) => rows.find((r) => r.id === id)!;
    expect(of(risk.orderId)).toMatchObject({ inReview: true, review: { kind: 'risk', section: 'high' } });
    expect(of(dup.orderId)).toMatchObject({ inReview: true, review: { kind: 'duplicate' } });
    expect(of(done.orderId)).toMatchObject({ inReview: false, review: null });
  });
});
