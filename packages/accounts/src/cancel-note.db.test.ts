// Follow-up 314 (PR 546, SIM-F-013) — his own cancelled order's page says why in the same plain words as the cancel
// notice (`messages.cancelNotice`, by the order's cancel code, in his language), never for a silent reason and never the
// team's note; a duplicate names the order of his that goes ahead (one he can open). Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { orderCancelNote } from './index';
import { setUpAccounts, type AccountsFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('follow-up 314 · why his order was cancelled', () => {
  let f: AccountsFixture;
  let me: { id: string };
  let other: { id: string };
  const cancel = (number: string, code: string | null, note: string | null = null) =>
    f.t.prisma.order.update({ where: { storeId_number: { storeId: f.A, number } }, data: { cancelReasonCode: code, cancelNote: note } });
  const of = (number: string, lang: 'en' | 'bn' = 'en', who: { customerId: string | null; visitorId: string | null } = { customerId: me.id, visitorId: null }) =>
    orderCancelNote(f.deps(), { storeId: f.A, number, lang, ...who });

  beforeAll(async () => {
    f = await setUpAccounts('accounts_cancel_note');
    me = await f.customer('+8801700000314', f.A, 'Karim Ahmed');
    other = await f.customer('+8801700000315');
    await f.order({ customerId: me.id, number: 'C-1', status: 'CANCELLED', placedAt: new Date('2026-10-22T06:00:00Z'), visitorId: 'v-314' });
    await f.order({ customerId: me.id, number: 'C-KEPT', status: 'CONFIRMED', placedAt: new Date('2026-10-22T06:05:00Z') });
    await f.order({ customerId: me.id, number: 'C-OLD', status: 'DELIVERED', placedAt: new Date('2026-10-01T06:00:00Z') });
    await f.order({ customerId: other.id, number: 'C-THEIRS', status: 'CONFIRMED', placedAt: new Date('2026-10-22T06:01:00Z') });
    await f.order({ customerId: me.id, number: 'C-OPEN', status: 'CONFIRMED', placedAt: new Date('2026-10-20T06:00:00Z') });
  });
  afterAll(async () => f?.t.drop());

  it('the plain reason in his language, never the team\'s note', async () => {
    await cancel('C-1', 'OUT_OF_STOCK', 'made-up internal note');
    expect(await of('C-1')).toEqual({ reason: 'The item ran out of stock. Sorry!', kept: null });
    expect(await of('C-1', 'bn')).toEqual({ reason: 'পণ্যটি স্টকে শেষ হয়ে গেছে, দুঃখিত।', kept: null });
    expect(JSON.stringify(await of('C-1'))).not.toContain('internal');
    // the owner's own words win; a reason he left without words, a silent one and OTHER say nothing
    f.overrides.set('messages.cancelNotice', { reasons: { OUT_OF_STOCK: { en: 'Sold out, sorry.', bn: '' } }, silent: ['RISK_DECLINED'], duplicateTemplate: 'order.cancelledDuplicate' });
    expect(await of('C-1', 'bn')).toEqual({ reason: 'Sold out, sorry.', kept: null });
    await cancel('C-1', 'ADVANCE_NOT_PAID');
    expect(await of('C-1')).toBeNull();
    await cancel('C-1', 'RISK_DECLINED');
    expect(await of('C-1')).toBeNull();
    f.overrides.delete('messages.cancelNotice');
    await cancel('C-1', 'NOT_ORDERED');
    expect(await of('C-1')).toBeNull();
    await cancel('C-1', 'OTHER', 'made-up note');
    expect(await of('C-1')).toBeNull();
  });

  it('a duplicate names his own order that goes ahead, the nearest in time, and only one he can open', async () => {
    await cancel('C-1', 'DUPLICATE_ORDER');
    expect(await of('C-1')).toEqual({ reason: 'You placed the same order twice.', kept: { number: 'C-KEPT' } });
    // the browser that placed it (no account) cannot open his account orders: the reason only
    expect(await of('C-1', 'en', { customerId: null, visitorId: 'v-314' })).toEqual({ reason: 'You placed the same order twice.', kept: null });
  });

  it('only for the customer whose order it is, and only a cancelled one', async () => {
    expect(await of('C-1', 'en', { customerId: other.id, visitorId: null })).toBeNull();
    expect(await of('C-1', 'en', { customerId: null, visitorId: null })).toBeNull();
    expect(await of('C-KEPT')).toBeNull();
    expect(await orderCancelNote(f.deps(), { storeId: f.B, number: 'C-1', lang: 'en', customerId: me.id, visitorId: null })).toBeNull();
  });
});
