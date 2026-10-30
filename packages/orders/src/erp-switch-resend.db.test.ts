// CN-028 · PR 619 (follow-up 530) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a confirmed order whose
// v5 document never reached the ERP before the store switched to contract v6 is sent again as a v6 order — the next
// revision, one line per piece with its own line id and whole-taka customer prices — and the old v5 document never goes.
// Only the store's own order can be sent, and only once the store speaks v6.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { SWITCH_V5_ORDER } from '@extas/inventory';
import { confirmOrder, resendOrderAsV6 } from './index';
import { setUpErpOrders, type ErpFixture } from './test/erp-v6-fixture';

describe.skipIf(!HAS_TEST_DB)('PR 619 · a v5 order waiting at the switch goes again as v6 (PostgreSQL)', () => {
  let f: ErpFixture;
  beforeAll(async () => {
    f = await setUpErpOrders('switchresend');
  });
  afterAll(async () => {
    f?.restore();
    await f?.t.drop();
  });

  it('v5 confirm, switch (the v5 row taken out of the relay), resend: a v6 revision is queued and sent; the v5 document never goes', async () => {
    const o = await f.place('sw-resend');
    await confirmOrder(f.erpDeps(), f.staff, o.orderId);
    const v5 = await f.t.prisma.erpPush.findFirstOrThrow({ where: { referenceId: o.orderId, documentType: 'order.create' } });
    expect((v5.requestBody as { body: { items: { lineId?: string }[] } }).body.items.some((i) => typeof i.lineId === 'string')).toBe(false);
    // What the switch-over does to it (PR 619 step 1), then the store speaks v6.
    await f.t.prisma.erpPush.update({ where: { id: v5.id }, data: { status: 'FAILED', lastError: SWITCH_V5_ORDER } });
    // Before the switch is through, nothing is sent again.
    await expect(resendOrderAsV6(f.erpDeps(), f.S, o.orderId)).rejects.toMatchObject({ code: 'ERP_MODEL' });
    f.v6();
    // Another store cannot send this store's order.
    await expect(resendOrderAsV6(f.erpDeps(), f.B, o.orderId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const pushId = await resendOrderAsV6(f.erpDeps(), f.S, o.orderId);
    const rows = await f.t.prisma.erpPush.findMany({ where: { referenceId: o.orderId, documentType: 'order.create' }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.idempotencyKey.replace(o.orderId, 'ID'), r.status])).toEqual([
      ['order:ID:create', 'FAILED'],
      ['order:ID:create:r1', 'PENDING'],
    ]);
    expect(rows[1]!.id).toBe(pushId);
    expect((rows[1]!.requestBody as { body: { items: { lineId?: string }[] } }).body.items.every((i) => typeof i.lineId === 'string')).toBe(true);
    await f.relay();
    const after = await f.t.prisma.erpPush.findMany({ where: { referenceId: o.orderId, documentType: 'order.create' }, orderBy: { createdAt: 'asc' } });
    expect(after.map((r) => r.status)).toEqual(['FAILED', 'SENT']);
    // Pressed again: the same revision, nothing new.
    expect(await resendOrderAsV6(f.erpDeps(), f.S, o.orderId)).toBe(pushId);
  });
});
