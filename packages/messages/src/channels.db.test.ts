// S14 · PR 291 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real
// checkout; skipped without TEST_DATABASE_ADMIN_URL). The SMS gateway's side of the engine: an SMS goes from the masking
// name only once it is approved and wanted, else from the gateway's own number; the parts it took are kept; its cost is
// the provider's price, else the owner's part price — never on a mock send; the Channels & limits screen with its
// version, its checks and its permission. The senders here are stand-ins: nothing is ever sent to a real number.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdapterMode } from '@extas/db/client';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, type MessageChannel } from '@extas/settings';
import { channelsScreen, runMessages, saveChannels, smsParts, type MessagesDeps, type OutgoingMessage, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 291 · the SMS gateway in the engine and Channels & limits (PostgreSQL)', () => {
  let f: OrdersFixture;
  let staff: Who;
  let reader: Who;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  let mode: AdapterMode = 'MOCK';
  let price: number | null = null;
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({
    provider: channel === 'SMS' ? 'bulkSmsBd' : 'test',
    mode,
    send: async (m) => {
      outbox.push({ channel, ...m });
      return { ok: true, messageId: randomUUID(), ...(price !== null ? { costMinor: price } : {}) };
    },
    balance: async () => (channel === 'SMS' ? { amountMinor: 52_500, count: null } : null),
  });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  const smsOf = (o: { number: string }) => outbox.filter((m) => m.channel === 'SMS' && new RegExp(`${o.number}(?!\\d)`).test(m.text));
  const placedRow = (orderId: string) => db().notificationLog.findFirstOrThrow({ where: { orderId, step: 'placed', channel: 'SMS' } });

  beforeAll(async () => {
    f = await setUpOrders('channels');
    const p = db();
    const role = await createRole(p, SYSTEM, { key: 'test-channels', nameEn: 'channels', nameBn: 'channels', permissions: ['messages.channels.read', 'messages.channels.write'] });
    const readRole = await createRole(p, SYSTEM, { key: 'test-channels-read', nameEn: 'reader', nameBn: 'reader', permissions: ['messages.channels.read'] });
    const u = await p.staffUser.create({ data: { email: 'channels@example.com', displayName: 'Channels Staff', passwordHash: 'not-a-login' } });
    const r = await p.staffUser.create({ data: { email: 'channels-reader@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: readRole.id, storeId: f.S } });
    staff = { actor: { staffUserId: u.id }, storeId: f.S };
    reader = { actor: { staffUserId: r.id }, storeId: f.S };
    f.overrides.set('system.stagingHost', 'shop.example');
    // only the "order received" SMS, so each order sends exactly one message
    f.overrides.set('messages.journey', { ...DEFAULT_JOURNEY, confirmed: { ...DEFAULT_JOURNEY.confirmed, on: false }, packed: { ...DEFAULT_JOURNEY.packed, on: false }, day1Care: { ...DEFAULT_JOURNEY.day1Care, on: false }, day3Review: { ...DEFAULT_JOURNEY.day3Review, on: false } });
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(async () => {
    f.clock.now = new Date();
    mode = 'MOCK';
    price = null;
    f.overrides.delete('messages.sms.masking');
    f.overrides.delete('messages.sms.rates');
    f.overrides.delete('messages.language');
    await run();
    outbox.length = 0;
  });

  it('the masking name is used only once approved and wanted; else the gateway`s own number (senderId null)', async () => {
    const a = await f.place('mask-none');
    await run();
    expect(smsOf(a)).toHaveLength(1);
    expect(smsOf(a)[0]!.senderId).toBeNull();

    f.overrides.set('messages.sms.masking', { senderName: 'SHOPNAME', state: 'requested', useWhenApproved: true });
    const b = await f.place('mask-requested');
    await run();
    expect(smsOf(b)[0]!.senderId).toBeNull();

    f.overrides.set('messages.sms.masking', { senderName: 'SHOPNAME', state: 'approved', useWhenApproved: false });
    const c = await f.place('mask-unwanted');
    await run();
    expect(smsOf(c)[0]!.senderId).toBeNull();

    f.overrides.set('messages.sms.masking', { senderName: 'SHOPNAME', state: 'approved', useWhenApproved: true });
    const d = await f.place('mask-approved');
    await run();
    expect(smsOf(d)[0]!.senderId).toBe('SHOPNAME');
  });

  it('keeps the parts an SMS took (Bengali takes more); a mock send has no cost', async () => {
    const en = await f.place('parts-en');
    await run();
    const row = await placedRow(en.orderId);
    expect(row.segments).toBe(smsParts(smsOf(en)[0]!.text).parts);
    expect(row.segments).toBeGreaterThanOrEqual(1);
    expect(row.costMinor).toBeNull();
    expect(row.mode).toBe('MOCK');

    f.overrides.set('messages.language', 'bn');
    const bn = await f.place('parts-bn');
    await run();
    const text = smsOf(bn)[0]!.text;
    expect(text).toMatch(/[ঀ-৿]/);
    expect(smsParts(text).unicode).toBe(true);
    expect((await placedRow(bn.orderId)).segments).toBe(text.length <= 70 ? 1 : Math.ceil(text.length / 67));
  });

  it('cost: the provider`s own price wins; else the owner`s part price (masked or not) times the parts; unknown = none', async () => {
    mode = 'LIVE';
    const none = await f.place('cost-none');
    await run();
    expect((await placedRow(none.orderId)).costMinor).toBeNull();

    f.overrides.set('messages.sms.rates', { maskedMinor: 60, nonMaskedMinor: 35 });
    const plain = await f.place('cost-plain');
    await run();
    const r1 = await placedRow(plain.orderId);
    expect(r1.costMinor).toBe(35 * r1.segments!);
    const tries = await db().notificationAttempt.findMany({ where: { notificationLogId: r1.id } });
    expect(tries.map((t) => t.costMinor)).toEqual([r1.costMinor]);

    f.overrides.set('messages.sms.masking', { senderName: 'SHOPNAME', state: 'approved', useWhenApproved: true });
    const masked = await f.place('cost-masked');
    await run();
    const r2 = await placedRow(masked.orderId);
    expect(r2.costMinor).toBe(60 * r2.segments!);

    price = 41;
    const priced = await f.place('cost-provider');
    await run();
    expect((await placedRow(priced.orderId)).costMinor).toBe(41);

    // PR 343: every message with a cost wrote one cost row (service = channel, what it was for = the log row); none for
    // a message whose cost is unknown
    const costOf = async (orderId: string) => db().costEntry.findMany({ where: { storeId: f.S, refType: 'notification', refId: (await placedRow(orderId)).id } });
    expect(await costOf(none.orderId)).toEqual([]);
    for (const [o, minor] of [[plain, r1.costMinor], [masked, r2.costMinor], [priced, 41]] as const) {
      const rows = await costOf(o.orderId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ service: 'SMS', module: 'messages', amountMinor: minor, source: 'system', summaryLine: null });
      expect(rows[0]!.detail).toContain('bulkSmsBd');
    }
  });

  it('PR 343: a prepaid SMS balance is drawn down by each cost; a mock send writes no cost row and draws nothing', async () => {
    const bal = await db().prepaidBalance.create({ data: { storeId: f.S, service: 'SMS', balanceMinor: 10_000 } });
    mode = 'LIVE';
    price = 41;
    const a = await f.place('prepaid-a');
    await run();
    expect((await db().prepaidBalance.findUniqueOrThrow({ where: { id: bal.id } })).balanceMinor).toBe(10_000 - 41);
    mode = 'MOCK';
    const b = await f.place('prepaid-mock');
    await run();
    expect((await db().prepaidBalance.findUniqueOrThrow({ where: { id: bal.id } })).balanceMinor).toBe(10_000 - 41);
    expect(await db().costEntry.count({ where: { refType: 'notification', refId: (await placedRow(b.orderId)).id } })).toBe(0);
    expect(await db().costEntry.count({ where: { refType: 'notification', refId: (await placedRow(a.orderId)).id } })).toBe(1);
  });

  it('Channels & limits: providers with their mode and credit, the week, the settings with a version; checked saves', async () => {
    mode = 'LIVE';
    const s = await channelsScreen(deps(), staff);
    expect(s.perms.write).toBe(true);
    expect(s.config.masking).toBeNull();
    expect(s.channels.map((c) => c.channel)).toEqual(['SMS', 'WHATSAPP', 'EMAIL']);
    expect(s.channels[0]).toMatchObject({ provider: 'bulkSmsBd', mode: 'LIVE', balance: { amountMinor: 52_500, count: null }, balanceError: null });
    expect(s.channels[0]!.week.sent).toBeGreaterThan(0);

    const writer = {
      ...f.deps().settings,
      async set(key: string, value: unknown) {
        f.overrides.set(key, value);
      },
    };
    const d = { ...deps(), settings: writer } as Parameters<typeof saveChannels>[0];
    expect(await code(saveChannels(d, reader, { enabled: false }, s.version))).toBe('FORBIDDEN');
    // a masking name that is asked for needs its name; an unknown field is refused
    expect(await code(saveChannels(d, staff, { masking: { senderName: '', state: 'approved', useWhenApproved: true } }, s.version))).toBe('INVALID_INPUT');
    expect(await code(saveChannels(d, staff, { colour: 'red' }, s.version))).toBe('INVALID_INPUT');
    const saved = await saveChannels(d, staff, { masking: { senderName: 'SHOPNAME', state: 'requested', useWhenApproved: true }, smsRates: { maskedMinor: 60, nonMaskedMinor: 35 } }, s.version);
    expect(saved.config.masking).toEqual({ senderName: 'SHOPNAME', state: 'requested', useWhenApproved: true });
    expect(saved.version).not.toBe(s.version);
    expect(await code(saveChannels(d, staff, { enabled: false }, s.version))).toBe('STALE');
    const audit = await db().auditLog.findFirst({ where: { action: 'messages.channels.save' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.after).toMatchObject({ masking: { state: 'requested' } });
    expect(await code(channelsScreen(deps(), { actor: { staffUserId: randomUUID() }, storeId: f.S }))).toBe('FORBIDDEN');
  });
});
