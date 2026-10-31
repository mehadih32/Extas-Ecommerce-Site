// PR 619 (CN-028, CN-029 Phase 2) on PostgreSQL — the switch-over to ERP contract v6, per store, with the practice ERP
// behind each store's OWN connection and key (books-fixture). The owner's rules tested here, before the code:
// - a dry run reads the ERP's list and the shop's records and changes nothing but its own report;
// - the switch is the owner's alone: an owner, his books PIN, the switch date typed back, a clean dry run no older than
//   `erp.switchOver.dryRunMaxHours` that saw the same list — and only then is `erp.model` written, with the owner's OK;
// - at the switch the old shop QC, restock, write-off and credit-due paths turn OFF for that store only (never deleted);
//   the opening balance, the one transfer and the moved orders are booked once, the OUT orders billed and in the
//   pipeline, the month before the switch backfilled from `GET /cost-of-goods`, the retired v5 calls never sent;
// - a v5 order document still waiting at the switch is sent again as v6, or kept for a person (follow-up 530);
// - store A's switch, keys and books never touch store B (CN-029 §16);
// - a wrong opening balance is put right by a new link epoch, never by a correction (follow-up 555).
// CN-033: this is the way of the ERP's list (`erp.switchOver.mode` = erp-list, kept whole); the fresh start, as it
// ships, has its own file (erp-switchover-fresh.db.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword } from '@extas/auth';
import { registry } from '@extas/settings';
import {
  enqueueErpDocument,
  erpLinkState,
  dryRunSwitchOver,
  ledgerBalance,
  relayErpPushes,
  runSwitchOver,
  sendHeldV5Order,
  setBooksPin,
  startNewErpLink,
  type SettingsWriter,
  type SwitchOverDeps,
} from '../src';
import { day, setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-619';
const PIN = '480326';

describe.skipIf(!HAS_TEST_DB)('PR 619 on PostgreSQL: the switch-over to the ERP model', () => {
  let f: BooksFixture;
  const realFetch = globalThis.fetch;
  let owner: { staffUserId: string | null };
  let keysPerson: { staffUserId: string | null };
  const writes: { key: string; value: unknown; storeId: number; ownerApproved: boolean }[] = [];
  const resent: { storeId: number; orderId: string }[] = [];
  const writer: SettingsWriter = {
    async set(key, value, target, opts) {
      // The resolver's own rule (packages/settings resolver.ts): a `requiresOwnerOk` setting needs the owner's OK.
      if ((registry as Record<string, { requiresOwnerOk?: boolean }>)[key]?.requiresOwnerOk && !opts.ownerApproved) throw Object.assign(new Error('OWNER_OK_REQUIRED'), { code: 'OWNER_OK_REQUIRED' });
      writes.push({ key, value, storeId: target.storeId, ownerApproved: Boolean(opts.ownerApproved) });
      f.overrides.set(`${key}@${target.storeId}`, value);
    },
  };
  const deps = (): SwitchOverDeps => ({
    ...f.deps(),
    writer,
    // The orders package queues the next revision as a v6 order (`resendOrderAsV6`); here a row with that key stands in.
    resendV5Order: async (storeId, orderId) => {
      resent.push({ storeId, orderId });
      await f.t.prisma.erpPush.create({ data: { storeId, documentType: 'order.create', referenceId: orderId, idempotencyKey: `order:${orderId}:create:r1`, status: 'PENDING', requestBody: { type: 'order.create', body: { items: [{ lineId: 'x-1' }] } } } });
    },
  });
  const at = (iso: string) => {
    f.clock.now = new Date(iso);
  };
  const shopOrder = async (storeId: number, number: string) => {
    const id = randomUUID();
    await f.t.prisma.order.create({ data: { id, storeId, number, source: 'WEBSITE', currency: 'BDT', status: 'CONFIRMED', subtotalMinor: 150_000, totalMinor: 150_000, paymentMethod: 'COD', idempotencyKey: `sw-${id}` } });
    return id;
  };
  const v5Push = async (storeId: number, orderId: string, ext: string) => {
    const doc = { type: 'order.create', body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: ext, customerName: 'Sample', customerPhone: '01700000000', shippingAddress: 'Sample', paymentMethod: 'COD', note: null, items: [{ sku: 'POLO-NAVY-M', quantity: 1, unitPrice: '990.00', discount: '0.00' }] } };
    return enqueueErpDocument(f.deps(), storeId, orderId, `order:${orderId}:create`, doc as never);
  };
  const erpA = () => f.world.v6(f.company(f.storeA));
  const erpB = () => f.world.v6(f.company(f.storeB));

  beforeAll(async () => {
    f = await setUpBooks('switchover');
    owner = await f.owner('switch');
    await f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    keysPerson = await f.staff(['vault.read', 'vault.write'], null, 'keys');
    f.setV6(f.storeA, false);
    f.setV6(f.storeB, false);
    for (const s of [f.storeA, f.storeB]) f.overrides.set(`erp.switchOver.mode@${s}`, 'erp-list');
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await f?.t.drop();
  });
  beforeEach(() => {
    f.clock.now = new Date(f.clock.now.getTime() + 60_000);
  });

  it('before the ERP announces anything the dry run says so and changes nothing; store B is never asked', async () => {
    at('2026-11-05T04:00:00Z');
    const r = await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeA));
    expect(r.ok).toBe(false);
    expect(r.blockers).toContain('NOT_ANNOUNCED');
    expect(await f.t.prisma.erpSwitchRun.count({ where: { storeId: f.storeA, kind: 'DRY_RUN' } })).toBe(1);
    expect(await f.t.prisma.erpSwitchRun.count({ where: { storeId: f.storeB } })).toBe(0);
    // Every call of store A's dry run went with store A's own key to store A's company.
    expect(new Set(f.world.calls.filter((c) => c.path === '/switch-over').map((c) => c.companyId))).toEqual(new Set([f.company(f.storeA)]));
  });

  it('a person without the keys permission cannot run a dry run; nobody but an owner can switch', async () => {
    const reader = await f.staff(['vault.read'], f.storeA, 'reader');
    await expect(dryRunSwitchOver(deps(), f.who(reader, f.storeA))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(runSwitchOver(deps(), f.who(keysPerson, f.storeA), { pin: PIN, confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'OWNER_ONLY' });
    expect(writes).toEqual([]);
  });

  it('announced but not yet moved, or before the date: blocked, nothing written', async () => {
    erpA().announceSwitch('2026-11-05');
    at('2026-11-04T10:00:00Z');
    const r = await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeA));
    expect(r.blockers).toEqual(expect.arrayContaining(['ERP_NOT_DONE', 'BEFORE_SWITCH_DATE']));
    expect(r.ok).toBe(false);
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'SWITCH_BLOCKED' });
    expect(writes).toEqual([]);
  });

  let orderOut = '';
  let orderNotOut = '';
  let queuedOrder = '';
  it('a clean dry run: the moved list, the transfer, the opening balance and the backfill as they would be booked, written nowhere but the report', async () => {
    orderOut = await shopOrder(f.storeA, 'OLD-1');
    orderNotOut = await shopOrder(f.storeA, 'OLD-2');
    await shopOrder(f.storeB, 'OLD-1'); // the same number in store B is another store's order
    queuedOrder = await shopOrder(f.storeA, 'OLD-9');
    expect((await v5Push(f.storeA, queuedOrder, 'OLD-9')).status).toBe('PENDING');
    // The ERP's own part on the switch date (§3.3), and the days before it the shop never priced (§3.5).
    at('2026-11-05T03:00:00Z');
    erpA().seededCostOfGoods.push({ date: '2026-11-02', sku: 'POLO-NAVY-M', pieces: 2, value: 1300 }, { date: '2026-11-04', sku: 'POLO-NAVY-L', pieces: 1, value: 700 });
    erpA().completeSwitch([
      { externalOrderId: 'OLD-1', kind: 'OUT', consignmentId: 'C-OLD-1', lines: [{ lineId: 'OLD-1-1', sku: 'POLO-NAVY-M', shopPrice: 650 }] },
      { externalOrderId: 'OLD-2', kind: 'NOT_OUT', lines: [{ lineId: 'OLD-2-1', sku: 'POLO-NAVY-L', shopPrice: 700 }] },
      { externalOrderId: 'OLD-3', kind: 'UNPAID', amount: 900 },
      { externalOrderId: 'OLD-4', kind: 'ADVANCE', amount: 200 },
    ]);
    at('2026-11-05T04:00:00Z');
    const r = await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeA));
    expect(r).toMatchObject({ ok: true, blockers: [], switchDate: '2026-11-05' });
    const plan = r.plan;
    expect(plan.openingBalanceMinor).toBe(0);
    expect(plan.transferMinor).toBe(70_000);
    expect(plan.orders.map((o) => [o.externalOrderId, o.kind, o.amountMinor, o.orderId !== null])).toEqual([
      ['OLD-1', 'OUT', 65_000, true],
      ['OLD-2', 'NOT_OUT', 70_000, true],
      ['OLD-3', 'UNPAID', 90_000, false],
      ['OLD-4', 'ADVANCE', -20_000, false],
    ]);
    expect(plan.orders.find((o) => o.externalOrderId === 'OLD-1')!.orderId).toBe(orderOut);
    expect(plan.backfill).toEqual({ from: '2026-11-01', to: '2026-11-04', goodsMinor: { '2026-11-01': 0, '2026-11-02': 130_000, '2026-11-03': 0, '2026-11-04': 70_000 } });
    expect(plan.queuedV5).toEqual({ count: 1, orderIds: [queuedOrder], action: 'resend' });
    expect(plan.legacyOn).toEqual(['returns.legacy.shopQc', 'returns.legacy.restock', 'returns.legacy.writeOff', 'returns.legacy.creditDue']);
    // Nothing but the report moved: still v5, no entry, no moved order, no summary, no setting written.
    expect(writes).toEqual([]);
    const link = await f.linkOf(f.storeA);
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id } })).toBe(0);
    expect(await f.t.prisma.erpSwitchOrder.count()).toBe(0);
    expect(await f.t.prisma.erpDailySummary.count({ where: { linkId: link.id } })).toBe(0);
    const row = await f.t.prisma.erpStoreLink.findUniqueOrThrow({ where: { id: link.id } });
    expect([row.switchedAt, row.openingImportedAt, row.dryRunAt?.toISOString()]).toEqual([null, null, '2026-11-05T04:00:00.000Z']);
  });

  it('the switch refuses a wrong or missing PIN, a date typed wrong, and a dry run the ERP`s list no longer matches', async () => {
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: '', confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'PIN_REQUIRED' });
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: '111999', confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'WRONG_PIN' });
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-06' })).rejects.toMatchObject({ code: 'CONFIRM_DATE' });
    // The ERP's list changed after the owner looked at it: he must look again.
    const s = erpA().switchOverState;
    erpA().switchOverState = { ...s, orders: [...s.orders, { externalOrderId: 'OLD-5', kind: 'UNPAID', amount: 100, consignmentId: null, lines: [] }], transfer: { amount: 800, reference: s.transfer!.reference } };
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'DRY_RUN_STALE' });
    erpA().switchOverState = s;
    // A dry run older than `erp.switchOver.dryRunMaxHours` does not count.
    at('2026-11-06T05:00:00Z');
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'DRY_RUN_NEEDED' });
    expect(writes).toEqual([]);
  });

  it('the switch: v6 with the owner`s OK, the old return paths off for store A only, the opening items booked once, the month backfilled', async () => {
    at('2026-11-05T05:00:00Z');
    expect((await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeA))).ok).toBe(true);
    at('2026-11-05T05:10:00Z');
    const r = await runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-05' });
    expect(r).toMatchObject({ ok: true, kind: 'SWITCH', switchDate: '2026-11-05' });
    // `erp.model` written once, for store A, with the owner's OK; the four legacy switches off for store A only.
    expect(writes.filter((w) => w.key === 'erp.model')).toEqual([{ key: 'erp.model', value: 'v6', storeId: f.storeA, ownerApproved: true }]);
    expect(writes.filter((w) => w.key.startsWith('returns.legacy.')).map((w) => [w.key, w.value, w.storeId])).toEqual([
      ['returns.legacy.shopQc', false, f.storeA],
      ['returns.legacy.restock', false, f.storeA],
      ['returns.legacy.writeOff', false, f.storeA],
      ['returns.legacy.creditDue', false, f.storeA],
    ]);
    expect(writes.some((w) => w.storeId === f.storeB)).toBe(false);
    const link = await f.linkOf(f.storeA);
    const row = await f.t.prisma.erpStoreLink.findUniqueOrThrow({ where: { id: link.id } });
    expect([row.switchDate?.toISOString().slice(0, 10), Number(row.openingBalanceMinor), row.openingBalanceDate?.toISOString().slice(0, 10), row.switchedAt?.toISOString()]).toEqual(['2026-11-05', 0, '2026-11-05', '2026-11-05T05:10:00.000Z']);
    // The moved list kept as the opening items; the OUT order billed on the switch date and in the pipeline; the one transfer.
    expect((await f.t.prisma.erpSwitchOrder.findMany({ where: { linkId: link.id }, orderBy: { externalOrderId: 'asc' } })).map((o) => [o.externalOrderId, o.kind, Number(o.amountMinor)])).toEqual([
      ['OLD-1', 'OUT', 65_000],
      ['OLD-2', 'NOT_OUT', 70_000],
      ['OLD-3', 'UNPAID', 90_000],
      ['OLD-4', 'ADVANCE', -20_000],
    ]);
    const entries = await f.t.prisma.erpAccountEntry.findMany({ where: { linkId: link.id }, orderBy: { seq: 'asc' } });
    expect(entries.map((e) => [e.kind, Number(e.amountMinor), e.businessDate.toISOString().slice(0, 10), e.externalOrderId ?? e.paymentRef])).toEqual([
      ['SWITCH_TRANSFER', 70_000, '2026-11-05', 'SWITCH-2026-11-05'],
      ['BILL', 65_000, '2026-11-05', 'OLD-1'],
    ]);
    expect(await ledgerBalance(f.t.prisma, link)).toBe(135_000);
    expect((await f.t.prisma.erpPipelinePiece.findMany({ where: { linkId: link.id } })).map((p) => [p.externalOrderId, p.state, p.buyingPriceMinor])).toEqual([['OLD-1', 'BILLED', 65_000]]);
    const notOut = await f.t.prisma.erpOrder.findUniqueOrThrow({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: 'OLD-2' } }, include: { lines: true } });
    expect([notOut.orderId, notOut.billedAt, Number(notOut.erpTotalMinor), notOut.lines.map((l) => [l.lineId, l.sku, l.shopPriceMinor])]).toEqual([orderNotOut, null, 70_000, [['OLD-2-1', 'POLO-NAVY-L', 70_000]]]);
    // The month before the switch: one summary per day, goods from the ERP's cost of goods, sales listed as not known.
    const days = await f.t.prisma.erpDailySummary.findMany({ where: { linkId: link.id }, orderBy: { date: 'asc' } });
    expect(days.map((d) => [d.date.toISOString().slice(0, 10), d.reason, (d.body as { costs: { goods: number } }).costs.goods])).toEqual([
      ['2026-11-01', 'BACKFILL', 0],
      ['2026-11-02', 'BACKFILL', 1300],
      ['2026-11-03', 'BACKFILL', 0],
      ['2026-11-04', 'BACKFILL', 700],
    ]);
    for (const d of days) expect(d.incomplete).toEqual(expect.arrayContaining(['sales', 'income', 'deliveries', 'returnLosses']));
    for (const d of days) expect(d.incomplete).not.toContain('goods');
    // The v5 order that never reached the ERP: kept out of the v5 relay and sent again as v6 (setting `resend`).
    expect(resent).toEqual([{ storeId: f.storeA, orderId: queuedOrder }]);
    expect((await f.t.prisma.erpPush.findFirstOrThrow({ where: { referenceId: queuedOrder } })).status).toBe('FAILED');
    // Store B: still v5, no link change, no entries, no moved orders.
    expect(f.overrides.get(`erp.model@${f.storeB}`)).toBe('v5');
    expect(await f.t.prisma.erpSwitchOrder.count({ where: { storeId: f.storeB } })).toBe(0);
    expect(await f.t.prisma.erpAccountEntry.count({ where: { storeId: f.storeB } })).toBe(0);
    // History: the run is kept and can never change.
    const run = await f.t.prisma.erpSwitchRun.findFirstOrThrow({ where: { storeId: f.storeA, kind: 'SWITCH' } });
    await expect(f.t.prisma.erpSwitchRun.update({ where: { id: run.id }, data: { ok: false } })).rejects.toThrow(/append-only/);
  });

  it('pressed again: nothing is booked twice, and the page says the store is switched', async () => {
    await expect(runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-05' })).rejects.toMatchObject({ code: 'SWITCH_BLOCKED', details: expect.arrayContaining(['ALREADY_SWITCHED']) });
    const link = await f.linkOf(f.storeA);
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id } })).toBe(2);
    const state = await erpLinkState(deps(), f.who(keysPerson, f.storeA));
    expect(state).toMatchObject({ model: 'v6', link: { epoch: 1, switchDate: '2026-11-05' }, balance: { shopMinor: 135_000 } });
    expect(state.switchOver.lastSwitch).toMatchObject({ ok: true });
  });

  it('after the switch customer payments, returns and ad spend are never sent (the retired v5 calls)', async () => {
    const id = randomUUID();
    for (const [type, body] of [
      ['payment.create', { externalOrderId: 'OLD-1', amount: '650.00' }],
      ['adSpend.create', { date: '2026-11-05', amount: '1000.00' }],
      ['return.create', { externalOrderId: 'OLD-1', reason: 'size', items: [] }],
    ] as const) {
      expect((await enqueueErpDocument(f.deps(), f.storeA, id, `${type}:${id}`, { type, body } as never)).status).toBe('RETIRED');
    }
    await relayErpPushes(f.deps(), { storeId: f.storeA });
    expect(f.world.calls.filter((c) => c.method === 'POST' && ['/payments', '/ad-spend', '/returns'].includes(c.path))).toEqual([]);
  });

  it('follow-up 530 `hold`: a waiting v5 order is kept for a person, who sends it as v6 from the ERP link page', async () => {
    f.overrides.set(`erp.switchOver.queuedV5Orders@${f.storeB}`, 'hold');
    at('2026-11-07T03:00:00Z');
    const waiting = await shopOrder(f.storeB, 'B-OLD-7');
    await v5Push(f.storeB, waiting, 'B-OLD-7');
    erpB().announceSwitch('2026-11-07');
    erpB().completeSwitch([]);
    at('2026-11-07T04:00:00Z');
    expect((await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeB))).ok).toBe(true);
    resent.length = 0;
    await runSwitchOver(deps(), f.who(owner, f.storeB), { pin: PIN, confirmDate: '2026-11-07' });
    expect(resent).toEqual([]);
    const state = await erpLinkState(deps(), f.who(keysPerson, f.storeB));
    expect(state.queues.heldAtSwitch.map((o) => o.orderId)).toEqual([waiting]);
    await sendHeldV5Order(deps(), f.who(keysPerson, f.storeB), waiting);
    expect(resent).toEqual([{ storeId: f.storeB, orderId: waiting }]);
    // Store A's held list never shows store B's order.
    expect((await erpLinkState(deps(), f.who(keysPerson, f.storeA))).queues.heldAtSwitch).toEqual([]);
    await expect(sendHeldV5Order(deps(), f.who(keysPerson, f.storeA), waiting)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('follow-up 555: a wrong opening balance is put right by a new link epoch (owner + PIN), and the switch-over books the new one there', async () => {
    const before = await f.linkOf(f.storeA);
    await expect(startNewErpLink(deps(), f.who(keysPerson, f.storeA), { pin: PIN, reason: 'OPENING_WRONG', note: 'the ERP corrected the opening balance' })).rejects.toMatchObject({ code: 'OWNER_ONLY' });
    // The ERP corrects its opening balance (its books before the switch).
    erpA().switchOverState = { ...erpA().switchOverState, openingBalance: 5000 };
    const r = await startNewErpLink(deps(), f.who(owner, f.storeA), { pin: PIN, reason: 'OPENING_WRONG', note: 'the ERP corrected the opening balance' });
    expect(r).toMatchObject({ ended: { epoch: 1 }, kind: 'NEW_LINK' });
    const ended = await f.t.prisma.erpStoreLink.findUniqueOrThrow({ where: { id: before.id } });
    expect([ended.endedReason, Boolean(ended.endedAt)]).toEqual(['OPENING_WRONG', true]);
    at('2026-11-07T06:00:00Z');
    const dry = await dryRunSwitchOver(deps(), f.who(keysPerson, f.storeA));
    expect(dry).toMatchObject({ ok: true, blockers: [] });
    expect(dry.plan.openingBalanceMinor).toBe(500_000);
    await runSwitchOver(deps(), f.who(owner, f.storeA), { pin: PIN, confirmDate: '2026-11-05' });
    const now = await f.linkOf(f.storeA);
    expect(now.id).not.toBe(before.id);
    const row = await f.t.prisma.erpStoreLink.findUniqueOrThrow({ where: { id: now.id } });
    expect([row.epoch, Number(row.openingBalanceMinor)]).toEqual([2, 500_000]);
    // The old link's history stays as it was; `erp.model` was not written again (already v6).
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: before.id } })).toBe(2);
    expect(writes.filter((w) => w.key === 'erp.model' && w.storeId === f.storeA)).toHaveLength(1);
  });

  it('a switch date of a store is its own: store B`s day close and summaries start on its own date', async () => {
    const b = await f.t.prisma.erpStoreLink.findFirstOrThrow({ where: { storeId: f.storeB, endedAt: null } });
    expect(b.switchDate?.toISOString().slice(0, 10)).toBe('2026-11-07');
    expect((await f.t.prisma.erpDailySummary.findMany({ where: { linkId: b.id } })).every((d) => d.date < day('2026-11-07'))).toBe(true);
  });
});
