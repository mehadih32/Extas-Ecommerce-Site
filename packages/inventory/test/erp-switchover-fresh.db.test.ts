// CN-033 (1) · PR 619 on PostgreSQL — the switch-over as a fresh start (`erp.switchOver.mode` = fresh-start, as it
// ships). The ERP decided on 30 Oct 2026 not to build the switch-over steps (`GET /switch-over` with the moved old
// orders, `GET /cost-of-goods`): the website never sent real orders to the live ERP through the old link. The owner's
// rules tested here, before the code:
// - the owner, his books PIN, a clean dry run and the switch date typed back stay; the switch date is the store's
//   day of the dry run (or the date a stopped switch already kept on the link);
// - the ERP is never asked for the switch-over list or the cost of goods; no moved orders, an opening balance of 0, no
//   switch transfer, no days filled before the switch;
// - everything else of the switch runs as before: v6 with the owner's OK, the old return switches off, the waiting v5
//   orders sent again, the link marked switched, the run kept;
// - the way is the owner's choice per store; `erp-list` (the earlier way) still reads the ERP's list (its own file:
//   erp-switchover.db.test.ts); a dry run of the other way does not count.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword } from '@extas/auth';
import { registry } from '@extas/settings';
import { dryRunSwitchOver, enqueueErpDocument, erpLinkState, runSwitchOver, setBooksPin, setSwitchOverMode, type SettingsWriter, type SwitchOverDeps } from '../src';
import { setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-033';
const PIN = '730311';

describe.skipIf(!HAS_TEST_DB)('CN-033 · PR 619 on PostgreSQL: the switch-over as a fresh start', () => {
  let f: BooksFixture;
  let owner: { staffUserId: string | null };
  let keysPerson: { staffUserId: string | null };
  const writes: { key: string; value: unknown; storeId: number; ownerApproved: boolean }[] = [];
  const resent: { storeId: number; orderId: string }[] = [];
  const writer: SettingsWriter = {
    async set(key, value, target, opts) {
      if ((registry as Record<string, { requiresOwnerOk?: boolean }>)[key]?.requiresOwnerOk && !opts.ownerApproved) throw Object.assign(new Error('OWNER_OK_REQUIRED'), { code: 'OWNER_OK_REQUIRED' });
      writes.push({ key, value, storeId: target.storeId, ownerApproved: Boolean(opts.ownerApproved) });
      f.overrides.set(`${key}@${target.storeId}`, value);
    },
  };
  const deps = (): SwitchOverDeps => ({
    ...f.deps(),
    writer,
    resendV5Order: async (storeId, orderId) => {
      resent.push({ storeId, orderId });
    },
  });
  const at = (iso: string) => {
    f.clock.now = new Date(iso);
  };
  /** The ERP calls of the switch-over list and the cost of goods (never made on a fresh start). */
  const listCalls = () => f.world.calls.filter((c) => c.path.startsWith('/switch-over') || c.path.startsWith('/cost-of-goods'));
  const shopOrder = async (storeId: number, number: string) => {
    const id = randomUUID();
    await f.t.prisma.order.create({ data: { id, storeId, number, source: 'WEBSITE', currency: 'BDT', status: 'CONFIRMED', subtotalMinor: 150_000, totalMinor: 150_000, paymentMethod: 'COD', idempotencyKey: `fs-${id}` } });
    return id;
  };

  beforeAll(async () => {
    f = await setUpBooks('switchfresh');
    owner = await f.owner('fresh');
    await f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    keysPerson = await f.staff(['vault.read', 'vault.write'], null, 'keys');
    f.setV6(f.storeA, false);
    f.setV6(f.storeB, false);
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(() => {
    f.clock.now = new Date(f.clock.now.getTime() + 60_000);
  });

  let queued = '';
  it('as it ships the dry run is a fresh start: today as the switch date, nothing moved, the ERP`s list never asked', async () => {
    at('2026-11-05T04:00:00Z');
    queued = await shopOrder(f.storeA, 'FS-9');
    const doc = { type: 'order.create', body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: 'FS-9', customerName: 'Sample', customerPhone: '01700000000', shippingAddress: 'Sample', paymentMethod: 'COD', note: null, items: [{ sku: 'POLO-NAVY-M', quantity: 1, unitPrice: '990.00', discount: '0.00' }] } };
    expect((await enqueueErpDocument(f.deps(), f.storeA, queued, `order:${queued}:create`, doc as never)).status).toBe('PENDING');
    const r = await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeA));
    expect(r).toMatchObject({ ok: true, blockers: [], switchDate: '2026-11-05' });
    expect(r.plan).toMatchObject({ mode: 'fresh-start', status: null, switchDate: '2026-11-05', openingBalanceMinor: 0, transferMinor: 0, transferReference: null, orders: [], backfill: null });
    expect(r.plan.queuedV5).toEqual({ count: 1, orderIds: [queued], action: 'resend' });
    expect(r.plan.legacyOn).toHaveLength(4);
    expect(listCalls()).toEqual([]);
    // The ERP was still asked who it is (one store = one ERP company), with store A's own key.
    expect(f.world.calls.filter((c) => c.path === '/health').map((c) => c.companyId)).toContain(f.company(f.storeA));
    expect(writes).toEqual([]);
    expect((await erpLinkState(deps(), f.who(keysPerson, f.storeA))).switchOver.mode).toBe('fresh-start');
  });

  it('the switch is still the owner`s: his PIN and the date typed back; another day is refused', async () => {
    await expect(runSwitchOver(deps(), f.who(keysPerson, f.storeA), { pin: PIN, confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'OWNER_ONLY' });
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: '', confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'PIN_REQUIRED' });
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-04' })).rejects.toMatchObject({ code: 'CONFIRM_DATE', details: ['2026-11-05'] });
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '' })).rejects.toMatchObject({ code: 'CONFIRM_DATE' });
    // A dry run of yesterday saw another switch date: it does not count today.
    at('2026-11-06T04:00:00Z');
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-06' })).rejects.toMatchObject({ code: 'DRY_RUN_STALE' });
    expect(writes).toEqual([]);
  });

  it('the switch: v6 with the owner`s OK, the old return paths off, opening 0, no moved order, no transfer, no backfill', async () => {
    at('2026-11-06T05:00:00Z');
    expect((await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeA))).plan.switchDate).toBe('2026-11-06');
    at('2026-11-06T05:10:00Z');
    const r = await runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-06' });
    expect(r).toMatchObject({ ok: true, kind: 'SWITCH', switchDate: '2026-11-06' });
    expect(Object.fromEntries(r.steps.map((s) => [s.step, s.done]))).toMatchObject({
      'queuedV5.held': 1,
      'link.switchDate': true,
      movedOrders: 'not on a fresh start',
      'erp.model': 'v6',
      'returns.legacy.off': 4,
      openingBalance: 0,
      switchTransfer: 'not on a fresh start',
      bills: 'not on a fresh start',
      pipeline: 'not on a fresh start',
      backfill: 'not on a fresh start',
      'queuedV5.resent': 1,
    });
    expect(writes.filter((w) => w.key === 'erp.model')).toEqual([{ key: 'erp.model', value: 'v6', storeId: f.storeA, ownerApproved: true }]);
    expect(writes.filter((w) => w.key.startsWith('returns.legacy.')).every((w) => w.value === false && w.storeId === f.storeA)).toBe(true);
    const link = await f.linkOf(f.storeA);
    const row = await f.t.prisma.erpStoreLink.findUniqueOrThrow({ where: { id: link.id } });
    expect([row.switchDate?.toISOString().slice(0, 10), Number(row.openingBalanceMinor), row.openingBalanceDate?.toISOString().slice(0, 10), row.switchedAt?.toISOString()]).toEqual(['2026-11-06', 0, '2026-11-06', '2026-11-06T05:10:00.000Z']);
    expect(await f.t.prisma.erpSwitchOrder.count({ where: { linkId: link.id } })).toBe(0);
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id, kind: { in: ['SWITCH_TRANSFER', 'BILL'] } } })).toBe(0);
    expect(await f.t.prisma.erpDailySummary.count({ where: { linkId: link.id, reason: 'BACKFILL' } })).toBe(0);
    expect(resent).toEqual([{ storeId: f.storeA, orderId: queued }]);
    expect(listCalls()).toEqual([]);
    // The run is kept with its way.
    const run = await f.t.prisma.erpSwitchRun.findFirstOrThrow({ where: { storeId: f.storeA, kind: 'SWITCH' } });
    expect((run.report as { plan: { mode: string } }).plan.mode).toBe('fresh-start');
    // Store B was never touched.
    expect(writes.some((w) => w.storeId === f.storeB)).toBe(false);
  });

  it('the way is the owner`s choice per store, never after the switch; a dry run of the other way does not count', async () => {
    await expect(setSwitchOverMode(deps(), f.who(keysPerson, f.storeB), 'erp-list')).rejects.toMatchObject({ code: 'OWNER_ONLY' });
    await expect(setSwitchOverMode(deps(), f.who(owner, f.storeB), 'moved-orders')).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['mode'] });
    await expect(setSwitchOverMode(deps(), f.who(owner, f.storeA), 'erp-list')).rejects.toMatchObject({ code: 'SWITCH_BLOCKED', details: ['ALREADY_SWITCHED'] });
    at('2026-11-07T04:00:00Z');
    expect((await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeB))).ok).toBe(true);
    expect(await setSwitchOverMode(deps(), f.who(owner, f.storeB), 'erp-list')).toEqual({ mode: 'erp-list' });
    expect(writes.filter((w) => w.key === 'erp.switchOver.mode')).toEqual([{ key: 'erp.switchOver.mode', value: 'erp-list', storeId: f.storeB, ownerApproved: false }]);
    // The earlier way reads the ERP's list again (here: nothing announced yet), and the fresh dry run does not count.
    await expect(runSwitchOver(deps(), f.who(owner, f.storeB), { pin: PIN, confirmDate: '2026-11-07' })).rejects.toMatchObject({ code: 'SWITCH_BLOCKED', details: expect.arrayContaining(['NOT_ANNOUNCED']) });
    expect(listCalls().map((c) => c.companyId)).toEqual([f.company(f.storeB)]);
    expect(await setSwitchOverMode(deps(), f.who(owner, f.storeB), 'fresh-start')).toEqual({ mode: 'fresh-start' });
  });

  it('a switch that stopped after keeping its date goes on with that date, not today`s', async () => {
    const link = await f.linkOf(f.storeB);
    await f.t.prisma.erpStoreLink.update({ where: { id: link.id }, data: { switchDate: new Date('2026-11-07T00:00:00Z') } });
    at('2026-11-08T04:00:00Z');
    const r = await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeB));
    expect(r).toMatchObject({ ok: true, switchDate: '2026-11-07' });
    await runSwitchOver(deps(), f.who(owner, f.storeB), { pin: PIN, confirmDate: '2026-11-07' });
    expect(f.overrides.get(`erp.model@${f.storeB}`)).toBe('v6');
  });
});
