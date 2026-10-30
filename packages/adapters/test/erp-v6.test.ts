// PR 607 (CN-028) — ERP contract v6 through the real HTTP client against the practice ERP (no network, no database):
// the typed calls of docs/erp/site-changes-v6.md and the test list of its §4 that the ERP side owns — billing at the
// shop price when the parcel leaves, the refusals, Return stock, partial deliveries, return lists and the owner's
// checks, exchanges (on time, late, refused, an exchange of an exchange), the account and its hold, daily summaries,
// fixed costs, the cost of goods and the retired v5 calls. The clock is fixed (2026-10-23, Asia/Dhaka).
import { describe, expect, it } from 'vitest';
import {
  createErpHttpClient,
  ErpError,
  identifyPartial,
  MockErpWorld,
  retiredInV6,
  summaryNetProfit,
  type ErpApi,
  type ErpDocument,
  type ErpOrderLineV6,
  type ErpSalesOrderV6,
} from '../src';

const BASE = 'https://erp.example.test';
const T0 = new Date('2026-10-23T04:00:00Z'); // 10:00 in Dhaka

function setup() {
  const w = new MockErpWorld();
  let clock = T0;
  w.now = () => clock;
  const api = createErpHttpClient({ baseUrl: BASE, apiKey: w.defaultKey, provider: 'extasErp', fetch: w.fetch }) as ErpApi & { v6: NonNullable<ErpApi['v6']> };
  const days = (n: number) => {
    clock = new Date(clock.getTime() + n * 86_400_000);
  };
  for (const [sku, colour, size, price, grade] of [
    ['EX-PL-001-NAVY-M', 'NAVY', 'M', 650, 'A'],
    ['EX-PL-001-NAVY-L', 'NAVY', 'L', 700, 'A'],
    ['EX-PL-001-NAVY-XL', 'NAVY', 'XL', 720, 'A'],
    ['EX-PL-001-BLACK-XL', 'BLACK', 'XL', 650, 'A'],
    ['EX-PL-001-NAVY-M-B', 'NAVY', 'M', 400, 'B'],
  ] as const) {
    w.setVariant({ sku, styleCode: 'EX-PL-001', styleName: 'Sample polo', color: colour, size, shopPrice: price, grade, retailPrice: '1250.00', avgCost: '600.00' });
    w.setStock(sku, 'SAMPLE-WH-1', { onHand: 5 });
  }
  w.setVariant({ sku: 'EX-TS-009-WHITE-M', styleCode: 'EX-TS-009', color: 'WHITE', size: 'M', shopPrice: null });
  w.setStock('EX-TS-009-WHITE-M', 'SAMPLE-WH-1', { onHand: 5 });
  return { w, api, days, v6: w.v6() };
}

let n = 0;
const key = () => `k-${++n}`;
const line = (lineId: string, sku: string, customerPrice: number, extra: Partial<ErpOrderLineV6> = {}): ErpOrderLineV6 => ({ lineId, sku, quantity: 1, grade: 'A', unitPrice: `${customerPrice}.00`, discount: '0.00', customerPrice, comboId: null, ...extra });
const order = (ext: string, items: ErpOrderLineV6[], extra: Partial<ErpSalesOrderV6> = {}): ErpDocument => ({
  type: 'order.create',
  body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: ext, customerName: 'Sample customer', customerPhone: '01700000000', shippingAddress: 'Sample address', paymentMethod: 'COD', note: null, items, deliveryCharge: 80, advancePaid: 0, ...extra },
});
const push = (api: ErpApi, doc: ErpDocument) => api.push(doc, { idempotencyKey: key() });
async function refusal(p: Promise<unknown>): Promise<ErpError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErpError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}
const deliver = (api: ErpApi, ext: string, status: 'DELIVERED' | 'PARTIAL' | 'RETURNED', collected: number, mark?: { keptLines: string[]; discountGiven: number }) =>
  push(api, { type: 'order.delivery', externalOrderId: ext, body: { status, courier: 'PATHAO', consignmentId: `C-${ext}`, collected, at: '2026-10-23T15:40:00+06:00', ...(mark ? { mark: { ...mark, phoneConfirmed: true, note: null } } : {}) } });
const ship = (api: ErpApi, ext: string) => push(api, { type: 'shipment.create', body: { externalOrderId: ext, courier: 'PATHAO', consignmentId: `C-${ext}`, charge: '60.00', pickedUpAt: '2026-10-23T12:00:00+06:00' } });
const handBack = (api: ErpApi, id: string, parcels: { externalOrderId: string; receivedCount?: number }[]) =>
  push(api, { type: 'returnList.create', body: { returnListId: id, courier: 'PATHAO', handedBackAt: '2026-10-24', parcels: parcels.map((p) => ({ consignmentId: `C-${p.externalOrderId}`, ...p })) } });

describe('PR 607 · ERP contract v6 against the practice ERP', () => {
  it('imports a style by its code with shop price and grade, and every SKU of it only', async () => {
    const { api } = setup();
    const rows = await api.v6.variantsByStyle('EX-PL-001');
    expect(rows.map((r) => [r.sku, r.shopPrice, r.grade]).sort()).toEqual([
      ['EX-PL-001-BLACK-XL', '650', 'A'],
      ['EX-PL-001-NAVY-L', '700', 'A'],
      ['EX-PL-001-NAVY-M', '650', 'A'],
      ['EX-PL-001-NAVY-M-B', '400', 'B'],
      ['EX-PL-001-NAVY-XL', '720', 'A'],
    ]);
    const stock = await api.stockForSku('EX-PL-001-NAVY-M-B');
    expect(stock[0]).toMatchObject({ grade: 'B', fromReturnStock: 0, available: 5 });
  });

  it('an A + B order is quoted at the shop prices; it is billed only when the parcel leaves, a cancelled one never', async () => {
    const { api, v6 } = setup();
    const r = await push(api, order('WEB-1', [line('WEB-1-1', 'EX-PL-001-NAVY-M', 1190), line('WEB-1-2', 'EX-PL-001-NAVY-M-B', 600, { grade: 'B' })]));
    expect(r.body).toMatchObject({ erpTotal: 1050, billedAt: null, lines: [{ lineId: 'WEB-1-1', shopPrice: 650, fromReturnStock: false }, { lineId: 'WEB-1-2', grade: 'B', shopPrice: 400 }] });
    expect((await api.v6.account()).balance).toBe('0');
    const s = await ship(api, 'WEB-1');
    expect(s.body).toMatchObject({ billedAt: '2026-10-23', erpTotal: 1050 });
    // The same shipment again (a retried booking) bills nothing more.
    await ship(api, 'WEB-1');
    expect((await api.v6.account()).balance).toBe('1050');
    await push(api, order('WEB-2', [line('WEB-2-1', 'EX-PL-001-NAVY-L', 1290)]));
    await push(api, { type: 'order.status', externalOrderId: 'WEB-2', body: { status: 'CANCELLED' } });
    expect((await api.v6.account()).balance).toBe('1050');
    expect(v6.ledger.filter((x) => x.kind === 'BILL')).toHaveLength(1);
  });

  it('refuses with the v6 codes: no shop price, short stock (with shortSkus, nothing saved), account on hold', async () => {
    const { api, v6, w } = setup();
    const noPrice = await refusal(push(api, order('WEB-3', [line('WEB-3-1', 'EX-TS-009-WHITE-M', 990)])));
    expect([noPrice.status, noPrice.erpCode, noPrice.detailsBody]).toEqual([409, 'NO_SHOP_PRICE', { skus: ['EX-TS-009-WHITE-M'] }]);
    const short = await refusal(push(api, order('WEB-4', [line('WEB-4-1', 'EX-PL-001-NAVY-M', 1190, { quantity: 9 })])));
    expect([short.erpCode, short.detailsBody]).toEqual(['INSUFFICIENT_STOCK', { shortSkus: [{ sku: 'EX-PL-001-NAVY-M', wanted: 9, available: 5 }] }]);
    expect(v6.orders.has('WEB-4')).toBe(false);
    expect(w.stockOf('EX-PL-001-NAVY-M', 'SAMPLE-WH-1')).toEqual({ onHand: 5, reserved: 0 });
    v6.hold('No payment for 31 days');
    const held = await refusal(push(api, order('WEB-5', [line('WEB-5-1', 'EX-PL-001-NAVY-M', 1190)])));
    expect([held.erpCode, (held.detailsBody as { reason: string }).reason]).toEqual(['ACCOUNT_ON_HOLD', 'No payment for 31 days']);
    expect((await api.v6.account()).hold).toMatchObject({ onHold: true, reason: 'No payment for 31 days' });
    v6.release();
    expect((await push(api, order('WEB-5', [line('WEB-5-1', 'EX-PL-001-NAVY-M', 1190)]))).status).toBe(201);
  });

  it('identifies partial deliveries: 850 / 1190 / 980 with 1310 collected is GREEN (1190 kept), so is 1110 with a phone discount of 200', () => {
    const lines = [
      { lineId: 'a', sku: 'A', customerPrice: 850, quantity: 1 },
      { lineId: 'b', sku: 'B', customerPrice: 1190, quantity: 1 },
      { lineId: 'c', sku: 'C', customerPrice: 980, quantity: 1 },
    ];
    expect(identifyPartial(lines, 1310, { advancePaid: 0, discount: 0 })).toEqual({ identification: 'GREEN', keptLines: ['b'] });
    expect(identifyPartial(lines, 1110, { advancePaid: 0, discount: 200 })).toEqual({ identification: 'GREEN', keptLines: ['b'] });
    // Two pieces of the same price: count and value are certain, which one is not.
    expect(identifyPartial([{ lineId: 'x', sku: 'X', customerPrice: 900, quantity: 1 }, { lineId: 'y', sku: 'Y', customerPrice: 900, quantity: 1 }], 980, { advancePaid: 0, discount: 0 }).identification).toBe('YELLOW');
    expect(identifyPartial(lines, 2500, { advancePaid: 0, discount: 0 }).identification).toBe('ORANGE');
    // Below the cheapest piece and within the delivery charge: a full return.
    expect(identifyPartial(lines, 100, { advancePaid: 0, discount: 0 })).toEqual({ identification: 'GREEN', keptLines: [] });
  });

  it('a return list of three parcels, one ORANGE: two to Return stock, one on Hold, balance unchanged; refusals; the same list twice is the first answer', async () => {
    const { api, v6 } = setup();
    for (const ext of ['WEB-10', 'WEB-11', 'WEB-12']) {
      await push(api, order(ext, [line(`${ext}-1`, 'EX-PL-001-NAVY-M', 850), line(`${ext}-2`, 'EX-PL-001-NAVY-L', 1190), line(`${ext}-3`, 'EX-PL-001-BLACK-XL', 980)], { deliveryCharge: 0 }));
      await ship(api, ext);
    }
    expect((await deliver(api, 'WEB-10', 'RETURNED', 0)).body).toMatchObject({ status: 'RETURNED' });
    expect((await deliver(api, 'WEB-11', 'PARTIAL', 1310)).body).toMatchObject({ identification: 'GREEN', keptLines: ['WEB-11-2'] });
    expect((await deliver(api, 'WEB-12', 'PARTIAL', 2500)).body).toMatchObject({ identification: 'ORANGE' });
    await push(api, order('WEB-13', [line('WEB-13-1', 'EX-PL-001-NAVY-XL', 1300)]));
    await deliver(api, 'WEB-13', 'DELIVERED', 1380);
    const before = (await api.v6.account()).balance;
    const doc: ErpDocument = { type: 'returnList.create', body: { returnListId: 'RL-1', courier: 'PATHAO', handedBackAt: '2026-10-24', parcels: [{ consignmentId: 'C-WEB-10', externalOrderId: 'WEB-10', receivedCount: 2 }, { consignmentId: 'C-WEB-11', externalOrderId: 'WEB-11' }, { consignmentId: 'C-WEB-12', externalOrderId: 'WEB-12' }, { consignmentId: null, externalOrderId: 'WEB-13' }, { consignmentId: null, externalOrderId: 'WEB-404' }] } };
    const first = await api.push(doc, { idempotencyKey: 'RL-1' });
    const rows = (first.body as { parcels: { externalOrderId: string; result: string; reason: string | null; expectedCount: number | null }[] }).parcels;
    expect(rows.map((r) => [r.externalOrderId, r.result, r.reason])).toEqual([
      ['WEB-10', 'IN_RETURN_STOCK', null],
      ['WEB-11', 'IN_RETURN_STOCK', null],
      ['WEB-12', 'HOLD', null],
      ['WEB-13', 'REFUSED', 'NOT_RETURNED'],
      ['WEB-404', 'REFUSED', 'NOT_OUR_ORDER'],
    ]);
    expect(rows[0]!.expectedCount).toBe(3); // the shop counted 2: the ERP highlights it, decides nothing
    expect((await api.v6.account()).balance).toBe(before);
    const again = await api.push(doc, { idempotencyKey: 'RL-1' });
    expect([again.replayed, again.body]).toEqual([true, first.body]);
    const resolved = v6.resolveHold('WEB-12', ['WEB-12-1', 'WEB-12-3']);
    expect(resolved).toMatchObject({ type: 'return.parcel.resolved', data: { externalOrderId: 'WEB-12', pieces: [{ lineId: 'WEB-12-1' }, { lineId: 'WEB-12-3' }] } });
  });

  it('the owner approves two pieces and declines one: credit at the price paid, once; the returns summary agrees; claims list the damaged one', async () => {
    const { api, v6 } = setup();
    await push(api, order('WEB-20', [line('WEB-20-1', 'EX-PL-001-NAVY-M', 850), line('WEB-20-2', 'EX-PL-001-NAVY-L', 1190), line('WEB-20-3', 'EX-PL-001-BLACK-XL', 980)]));
    await ship(api, 'WEB-20');
    await deliver(api, 'WEB-20', 'RETURNED', 80);
    await handBack(api, 'RL-20', [{ externalOrderId: 'WEB-20', receivedCount: 3 }]);
    expect((await api.v6.account()).waitingCheck).toBe('2000');
    expect((await api.stockForSku('EX-PL-001-NAVY-M'))[0]).toMatchObject({ fromReturnStock: 1, available: 5 });
    const [a] = v6.decidePiece('WEB-20', 'WEB-20-1', 'APPROVED');
    v6.decidePiece('WEB-20', 'WEB-20-2', 'APPROVED');
    const [d] = v6.decidePiece('WEB-20', 'WEB-20-3', 'DECLINED', 'STAIN_OR_DAMAGE');
    expect(a).toMatchObject({ type: 'return.piece.decided', data: { decision: 'APPROVED', credit: 650 } });
    expect(d).toMatchObject({ data: { decision: 'DECLINED', reason: 'STAIN_OR_DAMAGE', credit: 0, consignmentId: 'C-WEB-20', handedBackAt: '2026-10-24' } });
    expect((await api.v6.account()).balance).toBe(String(2000 - 650 - 700));
    expect(await api.v6.returnsSummary('2026-10-23')).toMatchObject({ approved: 2, approvedCredit: '1350', declined: 1, inReturnStock: 0, onHold: 0 });
    expect(await api.v6.returnClaims({ from: '2026-10-01', to: '2026-10-31' })).toEqual([expect.objectContaining({ externalOrderId: 'WEB-20', lineId: 'WEB-20-3', reason: 'STAIN_OR_DAMAGE', value: '650' })]);
    // The pull carries the same event ids as the webhooks.
    const pulled = await api.v6.returns({ limit: 50 });
    expect(pulled.items[0]!.events.map((e) => e.eventId)).toEqual(expect.arrayContaining([a!.eventId, d!.eventId]));
    // A reversal is a new event naming the old one.
    const rev = v6.reverseDecision(a!.eventId, 'DECLINED', 'USED');
    expect(rev).toMatchObject({ reverses: a!.eventId, data: { decision: 'DECLINED', credit: 0 } });
    expect((await api.v6.account()).balance).toBe(String(2000 - 700));
  });

  it('a Return-stock piece goes out on a new order; failing the packing check makes the line short; REPLACE gives a new erpTotal, CANCEL drops it', async () => {
    const { api, v6, w } = setup();
    await push(api, order('WEB-30', [line('WEB-30-1', 'EX-PL-001-NAVY-XL', 1300)]));
    await ship(api, 'WEB-30');
    await deliver(api, 'WEB-30', 'RETURNED', 0);
    await handBack(api, 'RL-30', [{ externalOrderId: 'WEB-30' }]);
    w.setStock('EX-PL-001-NAVY-XL', 'SAMPLE-WH-1', { onHand: 0 });
    const r = await push(api, order('WEB-31', [line('WEB-31-1', 'EX-PL-001-NAVY-XL', 1300), line('WEB-31-2', 'EX-PL-001-NAVY-M', 1190)]));
    expect((r.body as { lines: { fromReturnStock: boolean }[] }).lines.map((l) => l.fromReturnStock)).toEqual([true, false]);
    const evs = v6.failPackingCheck('WEB-31', 'WEB-31-1');
    expect(evs.map((e) => e.type)).toEqual(['return.piece.decided', 'order.line.short']);
    expect(evs[1]).toMatchObject({ data: { externalOrderId: 'WEB-31', lineId: 'WEB-31-1', reason: 'RETURN_PIECE_FAILED_CHECK' } });
    const rep = await push(api, { type: 'order.line', externalOrderId: 'WEB-31', lineId: 'WEB-31-1', body: { action: 'REPLACE', sku: 'EX-PL-001-BLACK-XL', grade: 'A' } });
    expect(rep.body).toMatchObject({ erpTotal: 650 + 650 });
    const can = await push(api, { type: 'order.line', externalOrderId: 'WEB-31', lineId: 'WEB-31-2', body: { action: 'CANCEL', reason: 'customer agreed' } });
    expect(can.body).toMatchObject({ erpTotal: 650, lines: [{ state: 'ACTIVE' }, { state: 'CANCELLED' }] });
    // WAIT on a short line: filled when the SKU is back (`order.line.filled`).
    await push(api, order('WEB-32', [line('WEB-32-1', 'EX-PL-001-NAVY-L', 1290)]));
    w.v6().orders.get('WEB-32')!.lines[0]!.fromReturnStock = true;
    w.v6().pieces.push({ ...w.v6().pieces[0]!, sku: 'EX-PL-001-NAVY-L', stage: 'SOLD_AGAIN' });
    v6.failPackingCheck('WEB-32', 'WEB-32-1');
    await push(api, { type: 'order.line', externalOrderId: 'WEB-32', lineId: 'WEB-32-1', body: { action: 'WAIT' } });
    expect(v6.takeEvents().some((e) => e.type === 'order.line.filled' && e.data.lineId === 'WEB-32-1')).toBe(true);
  });

  it('exchanges: unbilled, a 4-day watch; on time and approved settles +50; late is billed 700 then credited 650; refused is cancelled', async () => {
    const { api, v6, days } = setup();
    const placed = async (ext: string) => {
      await push(api, order(ext, [line(`${ext}-1`, 'EX-PL-001-NAVY-M', 1190)]));
      await ship(api, ext);
      await deliver(api, ext, 'DELIVERED', 1270);
    };
    const exchange = (ext: string, of: string, sku: string) => push(api, order(ext, [line(`${ext}-1`, sku, 0, { replacesLineId: `${of}-1` })], { exchange: { ofExternalOrderId: of, note: `Exchange of order ${of}, line 1` }, deliveryCharge: 80 }));
    await placed('WEB-40');
    const x = await exchange('WEB-40-X1', 'WEB-40', 'EX-PL-001-NAVY-L');
    expect(x.body).toMatchObject({ erpTotal: 0, atRisk: 700, lines: [{ shopPrice: 700, replacedShopPrice: 650 }] });
    expect(await refusal(exchange('WEB-40-X2', 'WEB-40', 'EX-PL-001-NAVY-XL'))).toMatchObject({ erpCode: 'EXCHANGE_OPEN' });
    await ship(api, 'WEB-40-X1');
    await deliver(api, 'WEB-40-X1', 'DELIVERED', 80);
    const pending = await api.v6.exchanges({ status: 'pending', limit: 10 });
    expect(pending.items[0]).toMatchObject({ status: 'WAITING_RETURN', atRisk: '700', deliveredAt: '2026-10-23', deadline: '2026-10-27' });
    expect(pending.totalAtRisk).toBe('700');
    expect((await api.v6.account()).exchangesAtRisk).toBe('700');
    days(3);
    await handBack(api, 'RL-40', [{ externalOrderId: 'WEB-40-X1' }]);
    const [, settled] = v6.decidePiece('WEB-40', 'WEB-40-1', 'APPROVED');
    expect(settled).toMatchObject({ type: 'exchange.settled', data: { kind: 'EXTRA', amount: 50 } });

    // Never back: billed the night after the deadline, then a late approved return is credited at the old price.
    await placed('WEB-41');
    await exchange('WEB-41-X1', 'WEB-41', 'EX-PL-001-NAVY-L');
    await deliver(api, 'WEB-41-X1', 'DELIVERED', 0);
    days(5);
    expect(v6.runNight()).toEqual([expect.objectContaining({ type: 'exchange.billed', data: expect.objectContaining({ reason: 'DEADLINE_PASSED', amount: 700 }) })]);
    await push(api, { type: 'exchange.lateReturn', exchangeId: (await api.v6.exchanges({ status: 'all', limit: 10 })).items.find((i) => i.externalOrderId === 'WEB-41-X1')!.exchangeId, body: { handedBackAt: '2026-10-29', courier: 'PATHAO', returnListId: 'RL-41', consignmentId: null, note: 'came in a different lot' } });
    const [, credited] = v6.decidePiece('WEB-41', 'WEB-41-1', 'APPROVED');
    expect(credited).toMatchObject({ type: 'exchange.credited', data: { amount: 650 } });
    const net = v6.ledger.filter((r) => r.reference && r.externalOrderId === 'WEB-41-X1').reduce((s, r) => s + r.amount, 0);
    expect(net).toBe(50);

    // Refused by the customer: cancelled, nothing billed.
    await placed('WEB-42');
    await exchange('WEB-42-X1', 'WEB-42', 'EX-PL-001-NAVY-L');
    await deliver(api, 'WEB-42-X1', 'RETURNED', 0);
    expect(v6.takeEvents().some((e) => e.type === 'exchange.cancelled' && e.data.externalOrderId === 'WEB-42-X1')).toBe(true);
    expect(v6.ledger.some((r) => r.externalOrderId === 'WEB-42-X1')).toBe(false);
  });

  it('an exchange of an exchange (650 → 700 → 720), both old pieces approved, ends at 720; short stock refuses, a new key goes through later', async () => {
    const { api, v6, w } = setup();
    await push(api, order('WEB-50', [line('WEB-50-1', 'EX-PL-001-NAVY-M', 1190)]));
    await ship(api, 'WEB-50');
    await deliver(api, 'WEB-50', 'DELIVERED', 1270);
    await push(api, order('WEB-50-X1', [line('WEB-50-X1-1', 'EX-PL-001-NAVY-L', 0, { replacesLineId: 'WEB-50-1' })], { exchange: { ofExternalOrderId: 'WEB-50', note: 'size' } }));
    await deliver(api, 'WEB-50-X1', 'DELIVERED', 0);
    w.setStock('EX-PL-001-NAVY-XL', 'SAMPLE-WH-1', { onHand: 0 });
    const doc = order('WEB-50-X2', [line('WEB-50-X2-1', 'EX-PL-001-NAVY-XL', 0, { replacesLineId: 'WEB-50-X1-1' })], { exchange: { ofExternalOrderId: 'WEB-50-X1', note: 'size again' } });
    expect(await refusal(api.push(doc, { idempotencyKey: 'x2-a' }))).toMatchObject({ erpCode: 'INSUFFICIENT_STOCK' });
    w.setStock('EX-PL-001-NAVY-XL', 'SAMPLE-WH-1', { onHand: 2 });
    // The ERP keeps the 409 against the old key; a new key after the stock arrived goes through.
    expect(await refusal(api.push(doc, { idempotencyKey: 'x2-a' }))).toMatchObject({ erpCode: 'INSUFFICIENT_STOCK' });
    expect((await api.push(doc, { idempotencyKey: 'x2-b' })).status).toBe(201);
    await deliver(api, 'WEB-50-X2', 'DELIVERED', 0);
    await handBack(api, 'RL-50a', [{ externalOrderId: 'WEB-50-X1' }]);
    await handBack(api, 'RL-50b', [{ externalOrderId: 'WEB-50-X2' }]);
    v6.decidePiece('WEB-50', 'WEB-50-1', 'APPROVED');
    v6.decidePiece('WEB-50-X1', 'WEB-50-X1-1', 'APPROVED');
    expect(v6.balance()).toBe(720);
  });

  it('the account: a hold after 30 days with money owed (warning from day 15), a payment starts the count again; the period adds up', async () => {
    const { api, v6, days } = setup();
    await push(api, order('WEB-60', [line('WEB-60-1', 'EX-PL-001-NAVY-M', 1190)]));
    await ship(api, 'WEB-60');
    days(16);
    let acc = await api.v6.account();
    expect(acc.hold).toMatchObject({ onHold: false, holdsOn: '2026-11-22', warnFromDays: 15, lastPaymentAt: null });
    days(15);
    acc = await api.v6.account();
    expect(acc.hold).toMatchObject({ onHold: true, reason: 'No payment for 31 days' });
    v6.recordPayment(650, { reference: 'BANK-1' });
    acc = await api.v6.account({ from: '2026-10-01', to: '2026-11-30' });
    expect(acc.hold).toMatchObject({ onHold: false, daysSinceLastPayment: 0 });
    expect(acc.period).toMatchObject({ openingBalance: '0', ordersTotal: '650', paymentsTotal: '650', closingBalance: '0' });
    expect(acc.statement.map((s) => [s.kind, s.amount])).toEqual([
      ['BILL', '650'],
      ['PAYMENT', '-650'],
    ]);
  });

  it('daily summaries and fixed costs: every version kept, the stored copy readable; the sample adds up to 35300', async () => {
    const { api } = setup();
    const day = {
      date: '2026-11-02',
      orders: { count: 42, pieces: 61 },
      sales: { gross: 98500, discounts: 6200, customerReturns: 3900, net: 88400 },
      income: { deliveryCharges: 3700 },
      deliveries: { delivered: 37, failed: 2, returned: 3, codPending: 21500 },
      costs: { goods: 41250, returnLosses: 650, packaging: 1850, delivery: 4600, paymentFees: 650, accessories: 400, ads: { facebook: 5200, instagram: 0, google: 1300, tiktok: 0, other: 0 }, other: 900 },
      returns: { handedBackPieces: 4, approvedCredit: 2600, waitingCheckValue: 11700 },
      customers: { new: 18, returning: 11 },
      incomplete: ['ads' as const],
      netProfit: 35300,
    };
    expect(summaryNetProfit(day)).toBe(35300);
    expect((await push(api, { type: 'dailySummary.put', date: day.date, body: day })).body).toMatchObject({ version: 1 });
    expect((await push(api, { type: 'dailySummary.put', date: day.date, body: { ...day, incomplete: [] } })).body).toMatchObject({ version: 2 });
    expect(await api.v6.dailySummaries({ from: '2026-11-01', to: '2026-11-30' })).toEqual([expect.objectContaining({ date: '2026-11-02', versions: 2, netProfit: '35300', incomplete: [] })]);
    await push(api, { type: 'fixedCosts.put', month: '2026-11', body: { month: '2026-11', costs: { salary: 45000, rent: 20000, utilities: 4500, other: 2000 }, note: 'salary raised from November' } });
    expect(await api.v6.fixedCosts()).toEqual([{ month: '2026-11', costs: { salary: '45000', rent: '20000', utilities: '4500', other: '2000' }, note: 'salary raised from November' }]);
  });

  it('the cost of goods by day and SKU at the shop price, and the order read back with erpTotal and billedAt', async () => {
    const { api, v6 } = setup();
    v6.seededCostOfGoods.push({ date: '2026-10-01', sku: 'EX-PL-001-NAVY-M', pieces: 2, value: 1300 });
    await push(api, order('WEB-70', [line('WEB-70-1', 'EX-PL-001-NAVY-L', 1290)]));
    await deliver(api, 'WEB-70', 'DELIVERED', 1370);
    expect(await api.v6.costOfGoods({ from: '2026-10-01', to: '2026-10-31' })).toEqual([
      { date: '2026-10-01', sku: 'EX-PL-001-NAVY-M', pieces: 2, value: '1300' },
      { date: '2026-10-23', sku: 'EX-PL-001-NAVY-L', pieces: 1, value: '700' },
    ]);
    // Billed at the delivery result because no shipment came.
    expect(await api.v6.order('WEB-70')).toMatchObject({ erpTotal: '700', billedAt: new Date('2026-10-23') });
  });

  it('after the switch date the retired v5 calls answer 410, and the shop never sends them (retiredInV6)', async () => {
    const { api, v6 } = setup();
    await push(api, order('WEB-80', [line('WEB-80-1', 'EX-PL-001-NAVY-M', 1190)]));
    v6.switched = true;
    expect(await refusal(push(api, { type: 'order.status', externalOrderId: 'WEB-80', body: { status: 'DELIVERED' } }))).toMatchObject({ status: 410, erpCode: 'USE_DELIVERY_RESULT' });
    expect(await refusal(push(api, { type: 'return.create', body: { externalOrderId: 'WEB-80', reason: 'size', items: [{ sku: 'EX-PL-001-NAVY-M', quantity: 1, qc: 'good' }] } }))).toMatchObject({ status: 410, erpCode: 'GONE' });
    expect((await push(api, { type: 'order.status', externalOrderId: 'WEB-80', body: { status: 'PACKED' } })).status).toBe(200);
    expect(retiredInV6({ type: 'return.create' })).toBe(true);
    expect(retiredInV6({ type: 'payment.create' })).toBe(true);
    expect(retiredInV6({ type: 'adSpend.create' })).toBe(true);
    expect(retiredInV6({ type: 'order.status', body: { status: 'RETURNED' } })).toBe(true);
    expect(retiredInV6({ type: 'order.status', body: { status: 'CANCELLED' } })).toBe(false);
    expect(retiredInV6({ type: 'order.create' })).toBe(false);
  });

  it('CN-029 §16: the practice company is fixed by the store id (SAMPLE-CO-<id>), whatever order stores ask in', () => {
    const w = new MockErpWorld();
    // Store 3 asks first, then 1, then 2: each gets its own company by id, never the first one free.
    expect(w.companyForStore(3)).toBe('SAMPLE-CO-3');
    expect(w.companyForStore(1)).toBe('SAMPLE-CO-1');
    expect(w.companyForStore(2)).toBe('SAMPLE-CO-2');
    expect(w.companyForStore(3)).toBe('SAMPLE-CO-3');
    expect(w.company('SAMPLE-CO-3').warehouses.map((x) => x.id)).toEqual(['SAMPLE-WH-C3']);
    expect(new Set([1, 2, 3].map((s) => w.keyFor(w.companyForStore(s)))).size).toBe(3);
    // Installation level is the first company, as before; a test may tie a store elsewhere.
    expect(w.companyForStore(null)).toBe(w.company().id);
    w.linkStore(4, 'SAMPLE-CO-1');
    expect(w.companyForStore(4)).toBe('SAMPLE-CO-1');
    // A reset world gives the same answers again.
    w.reset();
    expect(w.companyForStore(2)).toBe('SAMPLE-CO-2');
    expect(w.companyForStore(4)).toBe('SAMPLE-CO-4');
  });

  it('a broken v6 answer is BAD_RESPONSE, never a silent zero', async () => {
    const { api, w } = setup();
    w.failNext({ path: '/account', rawBody: JSON.stringify({ balance: 'lots' }) });
    expect(await refusal(api.v6.account())).toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('PR 619: GET /switch-over — nothing until announced, then the final list: OUT billed on the switch date, one transfer of ADVANCE and UNPAID', async () => {
    const { api, v6, w } = setup();
    expect(await api.v6.switchOver()).toMatchObject({ status: 'NONE', switchDate: null, orders: [] });
    v6.announceSwitch('2026-10-23');
    expect(await api.v6.switchOver()).toMatchObject({ status: 'ANNOUNCED', switchDate: '2026-10-23', openingBalance: null });
    v6.completeSwitch([
      { externalOrderId: 'OLD-1', kind: 'OUT', consignmentId: 'C-OLD-1', lines: [{ lineId: 'OLD-1-1', sku: 'EX-PL-001-NAVY-M', shopPrice: 650 }] },
      { externalOrderId: 'OLD-2', kind: 'NOT_OUT', lines: [{ lineId: 'OLD-2-1', sku: 'EX-PL-001-NAVY-L', shopPrice: 700 }] },
      { externalOrderId: 'OLD-3', kind: 'UNPAID', amount: 900 },
      { externalOrderId: 'OLD-4', kind: 'ADVANCE', amount: 200 },
    ]);
    const s = await api.v6.switchOver();
    expect(s).toMatchObject({ status: 'DONE', switchDate: '2026-10-23', openingBalance: '0', transfer: { amount: '700', reference: 'SWITCH-2026-10-23' } });
    expect(s.orders.map((o) => [o.externalOrderId, o.kind, o.amount])).toEqual([
      ['OLD-1', 'OUT', '650'],
      ['OLD-2', 'NOT_OUT', '700'],
      ['OLD-3', 'UNPAID', '900'],
      ['OLD-4', 'ADVANCE', '-200'],
    ]);
    // The ERP's account on the switch date: the OUT bill and the one transfer; the NOT_OUT order is billed when it leaves.
    expect((await api.v6.account({ from: '2026-10-23', to: '2026-10-23' })).period).toMatchObject({ ordersTotal: '650', otherCharges: '700', closingBalance: '1350' });
    expect(await api.v6.order('OLD-2')).toMatchObject({ erpTotal: '700', billedAt: null });
    expect(w.v6().switched).toBe(true);
  });
});
