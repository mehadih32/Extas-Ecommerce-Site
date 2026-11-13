// S28 · PR 698 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the monthly cost ceiling in the engine.
// Off as shipped: nothing is held. With an SMS ceiling reached, a further SMS step is held (BLOCKED_BY_GUARD, COST_CEILING,
// not sent) while the order's first message and the other channel go on; with "cheapest channel" the step goes by its
// fallback channel instead; the status page reads the month's spend and warns at the share; last month's spend never
// counts; reading needs `messages.channels.read`. The senders are stand-ins. Every value is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, type MessageChannel } from '@extas/settings';
import { readCostCeilings, runMessages, type MessagesDeps, type OutgoingMessage, type Who } from './index';

const OFF = { enabled: false, smsMonthlyMinor: null, whatsappMonthlyMinor: null, warnPct: 80, fallbackToCheapest: false };

describe.skipIf(!HAS_TEST_DB)('PR 698 · message cost ceilings (PostgreSQL)', () => {
  let f: OrdersFixture;
  let reader: Who;
  let nobody: Who;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  const sender: MessagesDeps['sender'] = async (_s, channel) => ({
    provider: 'test',
    mode: 'MOCK',
    send: async (m) => {
      outbox.push({ channel, ...m });
      return { ok: true, messageId: randomUUID() };
    },
  });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  const journey = (confirmedFallback: 'NONE' | 'WHATSAPP') =>
    f.overrides.set('messages.journey', {
      ...DEFAULT_JOURNEY,
      confirmed: { ...DEFAULT_JOURNEY.confirmed, on: true, fallback: confirmedFallback },
      packed: { ...DEFAULT_JOURNEY.packed, on: false },
      day1Care: { ...DEFAULT_JOURNEY.day1Care, on: false },
      day3Review: { ...DEFAULT_JOURNEY.day3Review, on: false },
    });
  const spend = (service: string, amountMinor: number, occurredAt: Date) => db().costEntry.create({ data: { storeId: f.S, service, module: 'messages', amountMinor, currency: 'BDT', refType: 'notification', refId: randomUUID(), source: 'system', occurredAt } });
  const rows = (orderId: string) => db().notificationLog.findMany({ where: { orderId }, orderBy: [{ step: 'asc' }, { channel: 'asc' }], select: { step: true, channel: true, status: true, reason: true } });

  beforeAll(async () => {
    f = await setUpOrders('cost_ceiling');
    const role = await createRole(db(), SYSTEM, { key: 'test-ceiling-r', nameEn: 'r', nameBn: 'r', permissions: ['messages.channels.read'] });
    const u = await db().staffUser.create({ data: { email: 'ceiling-r@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
    await db().staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    reader = { actor: { staffUserId: u.id }, storeId: f.S };
    const n = await db().staffUser.create({ data: { email: 'ceiling-n@example.com', displayName: 'Nobody', passwordHash: 'not-a-login' } });
    nobody = { actor: { staffUserId: n.id }, storeId: f.S };
    f.overrides.set('system.stagingHost', 'shop.example');
    f.overrides.set('messages.language', 'en');
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(() => {
    f.clock.now = new Date();
    f.overrides.set('messages.costCeiling', OFF);
    outbox.length = 0;
  });

  it('is off as shipped: a message goes whatever was spent, and the page shows no ceiling', async () => {
    journey('NONE');
    await spend('SMS', 999_999, new Date());
    const o = await f.place('ceil-off', { phone: '01700000698' });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await run();
    await run();
    expect((await rows(o.orderId)).every((r) => r.status === 'SENT')).toBe(true);
    const s = await readCostCeilings(deps(), reader);
    expect(s).toMatchObject({ enabled: false, channels: [{ channel: 'SMS', state: 'none', spentMinor: 999_999 }, { channel: 'WHATSAPP', state: 'none' }] });
  });

  it('reading needs the channels key', async () => {
    await expect(readCostCeilings(deps(), nobody)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('warns at the share, and a spend of last month never counts', async () => {
    await db().costEntry.deleteMany({ where: { storeId: f.S } }).catch(() => null);
    f.overrides.set('messages.costCeiling', { ...OFF, enabled: true, smsMonthlyMinor: 1_000_000 });
    const lastMonth = new Date(f.clock.now.getTime() - 40 * 86_400_000);
    await spend('SMS', 900_000, lastMonth);
    expect((await readCostCeilings(deps(), reader)).channels[0]).toMatchObject({ state: 'ok', pct: expect.any(Number) });
    const before = (await readCostCeilings(deps(), reader)).channels[0]!.spentMinor;
    await spend('SMS', 1, new Date());
    expect((await readCostCeilings(deps(), reader)).channels[0]!.spentMinor).toBe(before + 1);
  });

  it('holds a further SMS step at the ceiling, never the first message or the other channel; nothing is lost', async () => {
    journey('NONE');
    f.overrides.set('messages.costCeiling', { ...OFF, enabled: true, smsMonthlyMinor: 1000 });
    await spend('SMS', 1000, new Date());
    const o = await f.place('ceil-hold', { phone: '01700000699' });
    await run();
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await run();
    await run();
    expect(await rows(o.orderId)).toEqual([
      { step: 'confirmed', channel: 'SMS', status: 'BLOCKED_BY_GUARD', reason: 'COST_CEILING' },
      { step: 'placed', channel: 'SMS', status: 'SENT', reason: null },
    ]);
    expect(outbox.filter((m) => m.purpose === 'order.confirmed')).toHaveLength(0);
  });

  it('with "cheapest channel" the step goes by its fallback channel instead', async () => {
    journey('WHATSAPP');
    f.overrides.set('messages.costCeiling', { ...OFF, enabled: true, smsMonthlyMinor: 1000, fallbackToCheapest: true });
    await spend('SMS', 1000, new Date());
    const o = await f.place('ceil-fallback', { phone: '01700000697' });
    await run();
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await run();
    await run();
    const r = await rows(o.orderId);
    expect(r.find((x) => x.step === 'confirmed' && x.channel === 'SMS')).toMatchObject({ status: 'SKIPPED', reason: 'COST_CEILING' });
    expect(r.find((x) => x.step === 'confirmed' && x.channel === 'WHATSAPP')).toMatchObject({ status: 'SENT' });
  });
});
