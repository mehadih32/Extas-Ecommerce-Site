// CN-029 Phase 2 · PR 621 — the ERP v6 acceptance drills of the books (a go-live gate), on PostgreSQL with the practice
// ERP behind each store's OWN connection and key (books-fixture). One store's life from its switch day, in order, each
// drill the owner's rule it proves (written before the code it checks):
// - the switch day ties: the opening items booked once, the transfer and the moved bill close the day with no remainder;
// - the same webhook twice books once; a lost webhook is caught up by the pull and the late copy books nothing;
// - a reversal that arrives before its original waits for it, then both apply: never an edit, the balances agree;
// - a wrong amount is a difference to the paisa, put right by a reversal plus a new entry (owner's PIN), never an edit;
// - an account hold pauses checkout and holds the order; the release sends it again by itself;
// - the ERP down for two days: the summaries wait and go by themselves, every day once accepted, none lost;
// - a closed day whose own money moves raises HISTORY_CHANGED; it clears once the day matches again;
// - an exchange never sent back is billed by the ERP at its deadline, and the books still tie;
// - a month with a day not matched must not close; once put right it closes without an override;
// - a payment of the closed month put right counts on its own open day as an earlier-month correction (money review);
// - the tie formula holds for every day, week, month, year and the whole life of the link, chained without a gap,
//   counting the shop's corrections and the earlier-month corrections as their own terms;
// - store B's link, ledger, hold and books are never touched by any of it (CN-029 §16).
// Every key, secret and amount is a made-up test value; the clock is fixed and moved by the tests.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword } from '@extas/auth';
import { registry } from '@extas/settings';
import { periodOf, tieRemainder, type TieParts } from '@extas/erp-types';
import {
  adjustDifference,
  applyErpEvents,
  balanceOn,
  checkErpAccount,
  closeMonth,
  dryRunSwitchOver,
  enqueueOrderPush,
  erpCheckoutPaused,
  recordBill,
  recordErpEvent,
  recordErpPayment,
  relayErpPushes,
  runBooksMatch,
  runSwitchOver,
  setBooksPin,
  summaryTick,
  syncErpAccount,
  verifyAccountChain,
  type SettingsWriter,
  type SwitchOverDeps,
} from '../src';
import { day, setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-621';
const PIN = '480326';
const COSTS = { salary: 30000, rent: 12000, utilities: 3000, other: 500 };

describe.skipIf(!HAS_TEST_DB)('PR 621 · ERP v6 acceptance drills of the books (PostgreSQL, practice ERP)', () => {
  let f: BooksFixture;
  const realFetch = globalThis.fetch;
  let owner: { staffUserId: string | null };
  let accounts: { staffUserId: string | null };
  let keysPerson: { staffUserId: string | null };
  /** While true the practice ERP answers every PUT /daily-summaries with 503. */
  let summariesDown = false;
  const summaryPuts: { date: string; status: number }[] = [];
  const writer: SettingsWriter = {
    async set(key, value, target, opts) {
      if ((registry as Record<string, { requiresOwnerOk?: boolean }>)[key]?.requiresOwnerOk && !opts.ownerApproved) throw Object.assign(new Error('OWNER_OK_REQUIRED'), { code: 'OWNER_OK_REQUIRED' });
      f.overrides.set(`${key}@${target.storeId}`, value);
    },
  };
  const switchDeps = (): SwitchOverDeps => ({ ...f.deps(), writer, resendV5Order: async () => {} });
  const at = (iso: string) => {
    f.clock.now = new Date(iso);
  };
  const A = () => f.storeA;
  const B = () => f.storeB;
  const erpA = () => f.world.v6(f.company(A()));
  const erpB = () => f.world.v6(f.company(B()));
  const entriesOf = async (storeId: number) => f.t.prisma.erpAccountEntry.findMany({ where: { linkId: (await f.linkOf(storeId)).id }, orderBy: { seq: 'asc' } });
  const shopBalance = async (storeId: number) => (await balanceOn(f.t.prisma, await f.linkOf(storeId), '2027-06-30')).endMinor;
  const erpBalance = (storeId: number) => Math.round(f.world.v6(f.company(storeId)).balance() * 100);
  const open = async (storeId: number, where: Record<string, unknown> = {}) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.booksDifference.findMany({ where: { linkId: link.id, status: { in: ['PENDING', 'MISMATCH'] }, ...where }, orderBy: [{ date: 'asc' }, { key: 'asc' }] });
  };
  const latestCloses = async (storeId: number, from: string, to: string) => {
    const link = await f.linkOf(storeId);
    const rows = await f.t.prisma.booksDayClose.findMany({ where: { linkId: link.id, date: { gte: day(from), lte: day(to) } }, orderBy: [{ date: 'asc' }, { version: 'desc' }] });
    const seen = new Set<string>();
    return rows.filter((r) => {
      const d = r.date.toISOString().slice(0, 10);
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  };
  const costs = async (storeId: number, month: string) => {
    const link = await f.linkOf(storeId);
    await f.t.prisma.erpFixedCostMonth.create({ data: { storeId, linkId: link.id, month: day(`${month}-01`), version: 1, salaryMinor: BigInt(COSTS.salary * 100), rentMinor: BigInt(COSTS.rent * 100), utilitiesMinor: BigInt(COSTS.utilities * 100), otherMinor: BigInt(COSTS.other * 100) } });
    f.world.v6(f.company(storeId)).putFixedCosts(month, { month, costs: COSTS });
  };
  /** ERP and shop: an order shipped (billed by both at the same moment). */
  const shipped = async (storeId: number, ext: string, pieces: { sku: string; customer: number; shop: number }[], billedAt: string) => {
    await f.placeAndShip(storeId, ext, pieces.map((p, i) => f.line(`${ext}-${i + 1}`, p.sku, p.customer)));
    await f.shopOrder(storeId, ext, pieces.map((p, i) => ({ lineId: `${ext}-${i + 1}`, sku: p.sku, shopPrice: p.shop })), new Date(billedAt));
  };
  /** ERP and shop: the parcel came back and was handed back on `handedBackAt`. */
  const returned = async (storeId: number, ext: string, received: number, handedBackAt: string, atIso: string) => {
    await f.push(storeId, { type: 'order.delivery', externalOrderId: ext, body: { status: 'RETURNED', courier: 'PATHAO', consignmentId: `C-${ext}`, collected: 0, at: atIso } } as never);
    await f.push(storeId, { type: 'returnList.create', body: { returnListId: `RL-${ext}`, courier: 'PATHAO', handedBackAt, parcels: [{ consignmentId: `C-${ext}`, externalOrderId: ext, receivedCount: received }] } } as never);
    await f.shopDelivery(storeId, ext, 'RETURNED', new Date(atIso));
    await f.shopHandBack(storeId, `RL-${ext}`, handedBackAt, [{ ext, received }]);
  };
  const recordAsWebhook = async (storeId: number, ev: { eventId: string; type: string; occurredAt: string; date: string; reverses?: string; data: Record<string, unknown> }) => {
    const link = await f.linkOf(storeId);
    const integ = await f.t.prisma.integration.findFirstOrThrow({ where: { storeId, kind: 'ERP' }, select: { id: true } });
    await recordErpEvent(f.deps(), { integrationId: integ.id, storeId, linkId: link.id, source: 'WEBHOOK', event: { eventId: ev.eventId, type: ev.type as never, occurredAt: new Date(ev.occurredAt), date: ev.date, reverses: ev.reverses ?? null, data: ev.data } });
  };
  const run = (storeId: number, o: { from?: string; through?: string } = {}) => runBooksMatch(f.deps(), { storeId, ...o });
  /** The shop's balance equals the ERP's, but for `openMinor` an open difference explains (the paisa not yet put right). */
  const bothAgree = async (storeId: number, openMinor = 0) => {
    await syncErpAccount(f.deps(), { storeId });
    expect(await shopBalance(storeId)).toBe(erpBalance(storeId) + openMinor);
  };

  beforeAll(async () => {
    f = await setUpBooks('acceptbooks');
    owner = await f.owner('accept');
    await f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    accounts = await f.staff(['books.read', 'books.adjust', 'books.close', 'books.reconcile', 'erp.account.read', 'erp.payments.record'], null, 'accept-accounts');
    keysPerson = await f.staff(['vault.read', 'vault.write'], null, 'accept-keys');
    // Store A still speaks v5 until its switch; store B is v6 from the start and only watches.
    f.setV6(f.storeA, false);
    for (const s of [f.storeA, f.storeB]) f.world.v6(f.company(s)).holdDays = 10_000;
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const put = /\/daily-summaries\/(\d{4}-\d{2}-\d{2})/.exec(url);
      if (put && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
        if (summariesDown) {
          summaryPuts.push({ date: put[1]!, status: 503 });
          return new Response(JSON.stringify({ error: { code: 'DOWN', message: 'the practice ERP is down' } }), { status: 503, headers: { 'content-type': 'application/json' } });
        }
        const res = await inner(input, init);
        summaryPuts.push({ date: put[1]!, status: res.status });
        return res;
      }
      return inner(input, init);
    }) as typeof fetch;
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await f?.t.drop();
  });

  it('the switch day: the moved bill and the one transfer booked once, at the buying price, and the day ties with no remainder', async () => {
    // The shop's own orders the ERP moves (the shop knows every moved order it sold).
    for (const number of ['OLD-1', 'OLD-2']) {
      const id = randomUUID();
      await f.t.prisma.order.create({ data: { id, storeId: A(), number, source: 'WEBSITE', currency: 'BDT', status: 'CONFIRMED', subtotalMinor: 150_000, totalMinor: 150_000, paymentMethod: 'COD', idempotencyKey: `acc-${id}` } });
    }
    at('2026-11-04T10:00:00Z');
    erpA().announceSwitch('2026-11-05');
    at('2026-11-05T03:00:00Z');
    erpA().completeSwitch([
      { externalOrderId: 'OLD-1', kind: 'OUT', consignmentId: 'C-OLD-1', lines: [{ lineId: 'OLD-1-1', sku: 'POLO-NAVY-M', shopPrice: 650 }] },
      { externalOrderId: 'OLD-2', kind: 'NOT_OUT', lines: [{ lineId: 'OLD-2-1', sku: 'POLO-NAVY-L', shopPrice: 700 }] },
      { externalOrderId: 'OLD-3', kind: 'UNPAID', amount: 900 },
      { externalOrderId: 'OLD-4', kind: 'ADVANCE', amount: 200 },
    ]);
    at('2026-11-05T04:00:00Z');
    expect(await dryRunSwitchOver(switchDeps(), f.who(keysPerson, A()))).toMatchObject({ ok: true, blockers: [] });
    at('2026-11-05T04:10:00Z');
    expect(await runSwitchOver(switchDeps(), f.who(owner, A()), { pin: PIN, confirmDate: '2026-11-05' })).toMatchObject({ ok: true, switchDate: '2026-11-05' });
    expect(f.overrides.get(`erp.model@${A()}`)).toBe('v6');
    expect((await entriesOf(A())).map((e) => [e.kind, Number(e.amountMinor)])).toEqual([
      ['SWITCH_TRANSFER', 70_000],
      ['BILL', 65_000],
    ]);
    await bothAgree(A());

    at('2026-11-05T20:00:00Z');
    const r = await run(A());
    expect(r).toMatchObject({ status: 'ok', through: '2026-11-05' });
    const [close] = await latestCloses(A(), '2026-11-05', '2026-11-05');
    expect([close!.result === 'MATCHED' || close!.result === 'PARTIAL', Number(close!.switchTransferMinor), Number(close!.pipelineEndMinor), Number(close!.tieRemainderMinor)]).toEqual([true, 70_000, 65_000, 0]);
    expect(await open(A(), { date: day('2026-11-05'), kind: { not: 'UNMATCHED_PAYMENT' } })).toEqual([]);
  });

  it('the same webhook twice books once; approved is a credit at the price paid, declined a return loss; the balances agree', async () => {
    at('2026-11-06T04:00:00Z');
    await shipped(A(), 'WEB-A1', [{ sku: 'POLO-NAVY-M', customer: 990, shop: 650 }, { sku: 'POLO-NAVY-L', customer: 1090, shop: 700 }], '2026-11-06T04:00:00Z');
    await shipped(A(), 'WEB-A2', [{ sku: 'POLO-BLACK-XL', customer: 990, shop: 650 }], '2026-11-06T04:00:00Z');
    await bothAgree(A());
    at('2026-11-07T05:00:00Z');
    await returned(A(), 'WEB-A1', 2, '2026-11-07', '2026-11-07T10:00:00+06:00');
    await returned(A(), 'WEB-A2', 1, '2026-11-07', '2026-11-07T10:00:00+06:00');
    await f.deliverAll(A());
    at('2026-11-08T05:00:00Z');
    erpA().decidePiece('WEB-A1', 'WEB-A1-1', 'APPROVED');
    erpA().decidePiece('WEB-A1', 'WEB-A1-2', 'DECLINED', 'B_GRADE');
    await f.deliverAll(A(), { twice: true });
    await syncErpAccount(f.deps(), { storeId: A() });
    const credits = (await entriesOf(A())).filter((e) => e.kind === 'RETURN_CREDIT');
    expect(credits.map((e) => [Number(e.amountMinor), e.lineId])).toEqual([[-65_000, 'WEB-A1-1']]);
    await bothAgree(A());
  });

  it('a lost webhook: the payment is caught up from the ERP`s account, the late copy books nothing', async () => {
    at('2026-11-09T05:00:00Z');
    const pay = erpA().recordPayment(500, { reference: 'BANK-A1', date: '2026-11-09' });
    expect(await f.deliverAll(A(), { drop: true })).toBe(1);
    expect(await checkErpAccount(f.deps(), { storeId: A() })).toMatchObject({ status: 'ok', caughtUp: 1 });
    await recordAsWebhook(A(), pay as never);
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: A() });
    expect((await entriesOf(A())).filter((e) => e.kind === 'PAYMENT').map((e) => [e.eventId, Number(e.amountMinor), e.source])).toEqual([[pay.eventId, -50_000, 'PULL']]);
    await recordErpPayment(f.deps(), f.who(accounts, A()), { paidOn: '2026-11-09', amountMinor: 50_000, method: 'BANK', reference: 'BANK-A1' });
    await bothAgree(A());
  });

  it('a reversal that arrives before its original waits for it; then both apply as a credit and its reversal, never an edit', async () => {
    at('2026-11-10T05:00:00Z');
    const [first] = erpA().decidePiece('WEB-A2', 'WEB-A2-1', 'APPROVED');
    const second = erpA().reverseDecision(first!.eventId, 'DECLINED', 'STAIN_OR_DAMAGE');
    expect(await f.deliverAll(A(), { drop: true })).toBe(2);
    const before = (await entriesOf(A())).length;
    await recordAsWebhook(A(), second as never);
    await applyErpEvents(f.deps());
    expect(await f.t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: second.eventId } })).toMatchObject({ status: 'WAITING_ORIGINAL' });
    expect((await entriesOf(A())).length).toBe(before);
    await recordAsWebhook(A(), first as never);
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: A() });
    const mine = (await entriesOf(A())).filter((e) => e.lineId === 'WEB-A2-1');
    expect(mine.map((e) => [e.kind, Number(e.amountMinor)])).toEqual([
      ['RETURN_CREDIT', -65_000],
      ['REVERSAL', 65_000],
    ]);
    const link = await f.linkOf(A());
    expect((await f.t.prisma.erpPipelinePiece.findFirstOrThrow({ where: { linkId: link.id, lineId: 'WEB-A2-1' } })).state).toBe('DECLINED');
    expect(await verifyAccountChain(f.t.prisma, link.id)).toMatchObject({ ok: true });
    await bothAgree(A());
  });

  it('a wrong amount: a bill one paisa off is a difference to the paisa on its day; the later days still match', async () => {
    at('2026-11-11T04:00:00Z');
    await f.placeAndShip(A(), 'WEB-A3', [f.line('WEB-A3-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(A(), 'WEB-A3', [{ lineId: 'WEB-A3-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], null);
    expect(await recordBill(f.deps(), { storeId: A(), externalOrderId: 'WEB-A3', consignmentId: 'C-WEB-A3', erpTotalMinor: 65_001, billedAt: new Date('2026-11-11T05:00:00Z') })).toMatchObject({ created: true });
    const link = await f.linkOf(A());
    await f.t.prisma.erpOrder.update({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: 'WEB-A3' } }, data: { billedAt: new Date('2026-11-11T05:00:00Z') } });
    at('2026-11-11T20:00:00Z');
    const r = await run(A(), { from: '2026-11-05' });
    expect(r.days.find((x) => x.date === '2026-11-11')).toMatchObject({ result: 'MISMATCH', matched: false });
    expect(r.days.filter((x) => x.date < '2026-11-11').every((x) => x.matched)).toBe(true);
    expect((await open(A(), { kind: { not: 'UNMATCHED_PAYMENT' } })).map((x) => [x.key, Number(x.amountMinor)])).toEqual([
      ['B:tie', 1],
      ['F:BILL|WEB-A3', 1],
    ]);
  });

  it('an account hold pauses checkout and holds the order (store A only); the release sends it again by itself', async () => {
    at('2026-11-12T04:00:00Z');
    erpA().hold('PAYMENT_OVERDUE');
    const orderId = randomUUID();
    await enqueueOrderPush(f.deps(), {
      storeId: A(),
      orderId,
      externalOrderId: 'WEB-A9',
      customerName: 'Sample customer',
      customerPhone: '01700000000',
      shippingAddress: 'Sample address',
      paymentMethod: 'COD',
      items: [{ sku: 'TEE-WHITE-M', quantity: 1, unitPriceMinor: 79_000, orderItemId: randomUUID(), lineTotalMinor: 79_000 }],
      shippingFeeMinor: 6_000,
    });
    expect(await relayErpPushes(f.deps(), { storeId: A() })).toMatchObject({ held: 1, sent: 0, failed: 0 });
    expect(await erpCheckoutPaused(f.deps(), A())).toMatchObject({ paused: true });
    expect((await erpCheckoutPaused(f.deps(), B())).paused).toBe(false);
    at('2026-11-12T06:00:00Z');
    erpA().release();
    await f.deliverAll(A());
    expect((await erpCheckoutPaused(f.deps(), A())).paused).toBe(false);
    expect(await relayErpPushes(f.deps(), { storeId: A() })).toMatchObject({ sent: 1 });
    expect((await f.t.prisma.erpPush.findFirstOrThrow({ where: { storeId: A(), referenceId: orderId, documentType: 'order.create' }, orderBy: { createdAt: 'desc' } })).status).toBe('SENT');
    expect(erpA().orders.has('WEB-A9')).toBe(true);
  });

  it('the ERP down for two days: the daily summaries wait, then go by themselves; every day is accepted once, none lost', async () => {
    summariesDown = true;
    at('2026-11-13T18:31:00Z');
    expect((await summaryTick(f.deps(), A())).failed).toBeGreaterThan(0);
    at('2026-11-14T18:31:00Z');
    await summaryTick(f.deps(), A());
    expect(summaryPuts.some((p) => p.date === '2026-11-14' && p.status === 503)).toBe(true);
    summariesDown = false;
    at('2026-11-14T20:00:00Z');
    const r = await summaryTick(f.deps(), A());
    expect(r.failed).toBe(0);
    expect(r.accepted).toBeGreaterThanOrEqual(2);
    for (let d = '2026-11-05'; d <= '2026-11-14'; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
      expect(erpA().summaries.get(d), d).toBeTruthy();
    }
    // Nothing waits any more: the next tick sends nothing.
    at('2026-11-14T21:30:00Z');
    expect((await summaryTick(f.deps(), A())).sent).toBe(0);
    // Store B's ERP got none of store A's days.
    expect([...erpB().summaries.keys()].filter((d) => d >= '2026-11-05')).toEqual([]);
  });

  it('a closed day whose own money moves raises HISTORY_CHANGED; once the day matches again it clears', async () => {
    at('2026-11-15T20:00:00Z');
    await run(A(), { from: '2026-11-12' });
    at('2026-11-17T04:00:00Z');
    erpA().recordPayment(100, { reference: 'BANK-LATE-A', date: '2026-11-15' });
    await f.deliverAll(A());
    at('2026-11-17T20:00:00Z');
    await run(A(), { from: '2026-11-15' });
    expect((await open(A(), { kind: 'HISTORY_CHANGED' })).map((x) => x.date.toISOString().slice(0, 10))).toEqual(['2026-11-15']);
    await recordErpPayment(f.deps(), f.who(accounts, A()), { paidOn: '2026-11-15', amountMinor: 10_000, method: 'BANK', reference: 'BANK-LATE-A' });
    at('2026-11-18T20:00:00Z');
    await run(A(), { from: '2026-11-15' });
    expect(await open(A(), { kind: 'HISTORY_CHANGED' })).toEqual([]);
    await bothAgree(A(), 1);
  });

  it('an exchange never sent back: the ERP bills it at its deadline, the shop books it once, and the day ties', async () => {
    at('2026-11-16T04:00:00Z');
    await shipped(A(), 'WEB-A5', [{ sku: 'POLO-NAVY-M', customer: 990, shop: 650 }], '2026-11-16T04:00:00Z');
    await f.push(A(), { type: 'order.delivery', externalOrderId: 'WEB-A5', body: { status: 'DELIVERED', courier: 'PATHAO', consignmentId: 'C-WEB-A5', collected: 990, at: '2026-11-16T16:00:00+06:00' } } as never);
    await f.shopDelivery(A(), 'WEB-A5', 'DELIVERED', new Date('2026-11-16T10:00:00Z'));
    at('2026-11-18T04:00:00Z');
    await f.push(A(), {
      type: 'order.create',
      body: {
        channel: 'WEBSITE',
        status: 'CONFIRMED',
        externalOrderId: 'WEB-A5-X1',
        customerName: 'Sample customer',
        customerPhone: '01700000000',
        shippingAddress: 'Sample address',
        paymentMethod: 'COD',
        note: 'Exchange of order WEB-A5',
        items: [{ ...f.line('WEB-A5-X1-1', 'POLO-NAVY-L', 0), replacesLineId: 'WEB-A5-1' }],
        deliveryCharge: 0,
        advancePaid: 0,
        exchange: { ofExternalOrderId: 'WEB-A5', note: 'Exchange of order WEB-A5' },
      },
    } as never);
    await f.push(A(), { type: 'shipment.create', body: { externalOrderId: 'WEB-A5-X1', courier: 'PATHAO', consignmentId: 'C-WEB-A5-X1', charge: '60.00', pickedUpAt: f.clock.now.toISOString() } } as never);
    await f.push(A(), { type: 'order.delivery', externalOrderId: 'WEB-A5-X1', body: { status: 'DELIVERED', courier: 'PATHAO', consignmentId: 'C-WEB-A5-X1', collected: 0, at: '2026-11-18T16:00:00+06:00' } } as never);
    const x = [...erpA().exchanges.values()].find((e) => e.externalOrderId === 'WEB-A5-X1')!;
    expect([x.status, x.deadline]).toEqual(['WAITING_RETURN', '2026-11-22']);
    await f.deliverAll(A());
    // Not back by the deadline: the ERP's night bills the new piece at its shop price.
    at('2026-11-23T04:00:00Z');
    expect(erpA().runNight().map((e) => [e.type, e.data.reason, e.data.amount])).toEqual([['exchange.billed', 'DEADLINE_PASSED', 700]]);
    await f.deliverAll(A(), { twice: true });
    await syncErpAccount(f.deps(), { storeId: A() });
    expect((await entriesOf(A())).filter((e) => e.kind.startsWith('EXCHANGE_')).map((e) => [e.kind, Number(e.amountMinor), e.businessDate.toISOString().slice(0, 10)])).toEqual([['EXCHANGE_BILL', 70_000, '2026-11-23']]);
    await bothAgree(A(), 1);
    at('2026-11-23T20:00:00Z');
    await run(A(), { from: '2026-11-16' });
    const close = (await latestCloses(A(), '2026-11-23', '2026-11-23'))[0]!;
    expect([Number(close.tieRemainderMinor), Number(close.returnLossesMinor) >= 70_000]).toEqual([0, true]);
  });

  it('a month with a day not matched must not close; put right with the owner`s PIN it closes without an override', async () => {
    await costs(A(), '2026-11');
    at('2026-12-01T20:00:00Z');
    await run(A(), { from: '2026-11-05' });
    await expect(closeMonth(f.deps(), f.who(accounts, A()), { month: '2026-11', pin: PIN })).rejects.toMatchObject({ code: 'NOT_MATCHED', details: expect.arrayContaining(['2026-11-11']) });
    const link = await f.linkOf(A());
    expect(await f.t.prisma.booksPeriodClose.count({ where: { linkId: link.id, level: 'MONTH' } })).toBe(0);
    // The wrong amount is put right: a reversal of the shop's bill and a new entry at the ERP's figure, never an edit.
    const diff = (await open(A(), { key: 'F:BILL|WEB-A3' }))[0]!;
    await expect(adjustDifference(f.deps(), f.who(accounts, A()), diff.id, { pin: '000000', reason: 'The shipment answer carried 650.01; the ERP billed 650.', erpEventId: ((diff.detail as { erpRefs?: string[] }).erpRefs ?? [])[0]! })).rejects.toMatchObject({ code: 'WRONG_PIN' });
    await adjustDifference(f.deps(), f.who(accounts, A()), diff.id, { pin: PIN, reason: 'The shipment answer carried 650.01; the ERP billed 650.', erpEventId: ((diff.detail as { erpRefs?: string[] }).erpRefs ?? [])[0]! });
    const fixes = (await entriesOf(A())).filter((e) => e.externalOrderId === 'WEB-A3');
    expect(fixes.map((e) => [e.kind, Number(e.amountMinor)])).toEqual([
      ['BILL', 65_001],
      ['REVERSAL', -65_001],
      ['ADJUSTMENT', 65_000],
    ]);
    await bothAgree(A());
    at('2026-12-01T21:00:00Z');
    await run(A(), { from: '2026-11-05' });
    expect(await open(A(), { date: { lte: day('2026-11-30') }, kind: { not: 'UNMATCHED_PAYMENT' } })).toEqual([]);
    await expect(closeMonth(f.deps(), f.who(accounts, A()), { month: '2026-11', pin: PIN })).resolves.toMatchObject({ level: 'MONTH', override: false });
  });

  it('a payment of the closed month put right: the correction counts on its own open day as an earlier-month correction, the closed month stays as it was', async () => {
    // 2 December: the ERP's payment dated 25 November (500) arrives late; its webhook said 600.
    at('2026-12-02T04:00:00Z');
    (erpA() as unknown as { book: (kind: string, amount: number, ref: { reference?: string; eventId?: string; date?: string }) => void }).book('PAYMENT', -500, { reference: 'BANK-NOV-A', eventId: 'evt-a-nov-pay', date: '2026-11-25' });
    await recordAsWebhook(A(), { eventId: 'evt-a-nov-pay', type: 'payment.recorded', occurredAt: '2026-12-02T04:00:00Z', date: '2026-11-25', data: { amount: '600', reference: 'BANK-NOV-A', method: 'BANK' } });
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: A() });
    await recordErpPayment(f.deps(), f.who(accounts, A()), { paidOn: '2026-11-25', amountMinor: 50_000, method: 'BANK', reference: 'BANK-NOV-A' });
    at('2026-12-02T10:00:00Z');
    await run(A(), { from: '2026-11-25', through: '2026-12-01' });
    const diff = (await open(A(), { key: 'A:PAYMENT|evt-a-nov-pay' }))[0]!;
    expect(await adjustDifference(f.deps(), f.who(accounts, A()), diff.id, { pin: PIN, reason: 'November is closed; the ERP received 500, the webhook said 600.', erpEventId: 'evt-a-nov-pay' })).toMatchObject({ kind: 'PRIOR_PERIOD', date: '2026-12-02' });
    await bothAgree(A());
    at('2026-12-03T20:00:00Z');
    await run(A(), { from: '2026-11-25', through: '2026-12-02' });
    expect(await open(A(), { kind: { not: 'UNMATCHED_PAYMENT' } })).toEqual([]);
    const close = (await latestCloses(A(), '2026-12-02', '2026-12-02'))[0]!;
    expect((close.figures as { tie: Record<string, unknown> }).tie).toMatchObject({ priorPeriodMinor: 10_000, remainderMinor: 0 });
    // November keeps its one close; the lifetime check at its end counts the correction dated after it.
    const link = await f.linkOf(A());
    expect(await f.t.prisma.booksPeriodClose.count({ where: { linkId: link.id, level: 'MONTH' } })).toBe(1);
    const life = await f.t.prisma.booksPeriodClose.findFirstOrThrow({ where: { linkId: link.id, level: 'LIFETIME' }, orderBy: [{ periodEnd: 'desc' }, { version: 'desc' }] });
    expect(life.result === 'MATCHED' || life.result === 'PARTIAL').toBe(true);
  });

  it('the tie formula holds for every day, week, month, year and the whole life of the link, chained without a gap', async () => {
    const closes = await latestCloses(A(), '2026-11-05', '2026-12-02');
    expect(closes.map((c) => c.date.toISOString().slice(0, 10))[0]).toBe('2026-11-05');
    expect(closes).toHaveLength(28);
    const n = (v: bigint) => Number(v);
    // The shop's own corrections are their own terms: those of the open period and those of a closed month (round 2).
    const adj = (c: (typeof closes)[number]) => {
      const tie = (c.figures as { tie?: { adjustmentsMinor?: number; priorPeriodMinor?: number } }).tie;
      return Number(tie?.adjustmentsMinor ?? 0) + Number(tie?.priorPeriodMinor ?? 0);
    };
    expect(closes.some((c) => Number((c.figures as { tie?: { priorPeriodMinor?: number } }).tie?.priorPeriodMinor ?? 0) !== 0)).toBe(true);
    // A day: its own remainder is zero; the next day starts where it ended (balance and pipeline).
    for (const [i, c] of closes.entries()) {
      expect(n(c.tieRemainderMinor), c.date.toISOString()).toBe(0);
      if (i > 0) {
        expect(n(c.openingBalanceMinor)).toBe(n(closes[i - 1]!.closingBalanceMinor));
        expect(n(c.pipelineStartMinor)).toBe(n(closes[i - 1]!.pipelineEndMinor));
      }
    }
    const period = (rows: typeof closes) => {
      const parts: TieParts = {
        balanceStartMinor: n(rows[0]!.openingBalanceMinor),
        balanceEndMinor: n(rows.at(-1)!.closingBalanceMinor),
        goodsMinor: rows.reduce((s, c) => s + n(c.goodsMinor), 0),
        returnLossesMinor: rows.reduce((s, c) => s + n(c.returnLossesMinor), 0),
        pipelineStartMinor: n(rows[0]!.pipelineStartMinor),
        pipelineEndMinor: n(rows.at(-1)!.pipelineEndMinor),
        switchTransferMinor: rows.reduce((s, c) => s + n(c.switchTransferMinor), 0),
        paymentsMinor: rows.reduce((s, c) => s + n(c.paymentsMinor), 0),
      };
      return tieRemainder(parts) - rows.reduce((s, c) => s + adj(c), 0);
    };
    const between = (a: string, b: string) => closes.filter((c) => c.date >= day(a) && c.date <= day(b));
    const rules = { weekStart: registry['books.week.start'].default, fiscalYearStartMonth: registry['books.fiscalYear.startMonth'].default } as never;
    const weeks = new Set(closes.map((c) => JSON.stringify(periodOf(c.date.toISOString().slice(0, 10), 'WEEK', rules))));
    expect(weeks.size).toBeGreaterThanOrEqual(4);
    for (const w of weeks) {
      const { start, end } = JSON.parse(w) as { start: string; end: string };
      expect(period(between(start, end)), `week ${start}`).toBe(0);
    }
    expect(period(between('2026-11-01', '2026-11-30')), 'month').toBe(0);
    const fy = periodOf('2026-11-05', 'YEAR', rules);
    expect(period(between(fy.start, fy.end)), 'year').toBe(0);
    expect(period(closes), 'life').toBe(0);
    // The life of the link ends where the ERP's balance ends, and the stored weeks and lifetime agree.
    expect(n(closes.at(-1)!.closingBalanceMinor)).toBe(erpBalance(A()));
    const link = await f.linkOf(A());
    const life = await f.t.prisma.booksPeriodClose.findFirstOrThrow({ where: { linkId: link.id, level: 'LIFETIME' }, orderBy: [{ periodEnd: 'desc' }, { version: 'desc' }] });
    expect(life.result === 'MATCHED' || life.result === 'PARTIAL').toBe(true);
    // Each week's latest close: the wrong-amount week was a MISMATCH until it was put right, then matched.
    const weekRows = await f.t.prisma.booksPeriodClose.findMany({ where: { linkId: link.id, level: 'WEEK' }, orderBy: [{ periodStart: 'asc' }, { version: 'desc' }] });
    const latestWeeks = weekRows.filter((w, i) => i === 0 || weekRows[i - 1]!.periodStart.getTime() !== w.periodStart.getTime());
    expect(latestWeeks.length).toBeGreaterThanOrEqual(3);
    expect(latestWeeks.filter((w) => w.periodEnd <= day('2026-11-30')).map((w) => w.result).filter((r) => r === 'MISMATCH')).toEqual([]);
    expect(weekRows.some((w) => w.result === 'MISMATCH')).toBe(true);
  });

  it('CN-029 §16: store B was never touched — no entry, no close, no hold, no summary, its own balance', async () => {
    const link = await f.linkOf(B());
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id } })).toBe(0);
    expect(await f.t.prisma.erpAccountEntry.count({ where: { storeId: B() } })).toBe(0);
    expect(await f.t.prisma.booksDayClose.count({ where: { storeId: B() } })).toBe(0);
    expect(await f.t.prisma.booksDifference.count({ where: { storeId: B() } })).toBe(0);
    expect(await f.t.prisma.erpSwitchRun.count({ where: { storeId: B() } })).toBe(0);
    expect(erpB().balance()).toBe(0);
    expect(erpB().orders.size).toBe(0);
    expect(f.overrides.get(`erp.model@${B()}`)).toBe('v6');
    // Every call of store A's went with store A's key to store A's company.
    expect(f.world.calls.filter((c) => c.companyId === f.company(B()))).toEqual([]);
  });
});
