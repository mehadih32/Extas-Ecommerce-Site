// S08 · PR 193 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — when the order comes, at the checkout
// and on the thank-you page. Required acceptance test (CN-017) SIM-F-019: past a band's Eid order-by date the checkout
// never promises the usual hours — one test per band before and after its date. Holiday mode: "ships from …" during
// the break. Eid pre-order: never by default; with the owner's pre-order on and its advance set, an order past its
// place's date takes the advance through PR 560's path (COD goes, the same payment page, AWAITING_ADVANCE), and the
// money is the Cash on Delivery money. Every date and amount is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { checkoutQuote, payAction, placeOrder, receiptEta, viewOf, type CheckoutDeps, type CheckoutRequest, type PlaceInput } from '@extas/checkout';
import { formatDay } from '@extas/rules/pure';
import { registry } from '@extas/settings';
import { askCheckoutAdvance, recordAdvance, systemBy } from './index';
import { setUpOrders, TEST_FORM, type OrdersFixture } from './testing';

/** An instant at a Dhaka day and time. */
const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00+06:00`);
const dayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const EID = '2027-03-10';
const BANDS = [
  { band: 'dhaka-city', orderBy: '2027-03-06', line: 'House 4, Road 5, Dhanmondi, Dhaka 1209' },
  { band: 'dhaka-sub-area', orderBy: '2027-03-05', line: 'House 9, Ashulia, Savar' },
  { band: 'outside-dhaka', orderBy: '2027-03-03', line: 'Masterpara, Gabtali, Bogura' },
] as const;
const late = `Ordered now, this may arrive after Eid (${formatDay(EID, 'en-BD')}).`;

describe.skipIf(!HAS_TEST_DB)('PR 193 · SIM-F-019: when the order comes, Eid dates, holiday mode and Eid pre-order (PostgreSQL)', () => {
  let f: OrdersFixture;
  const set = (values: Record<string, unknown>) => Object.entries(values).forEach(([k, v]) => f.overrides.set(k, v));
  const eidOn = () => set({ 'rules.eid.enabled': true, 'rules.eid.eidDate': EID, 'rules.eid.bandDates': BANDS.map(({ band, orderBy }) => ({ band, orderBy })) });
  /** The checkout as the app wires it: a paid advance goes back to the order service (PR 560). */
  const cd = (): CheckoutDeps => ({ ...f.deps(), advancePaid: async (storeId, orderId) => void (await recordAdvance(f.ordersDeps(), { storeId, orderId }, systemBy('checkout'))) });
  const req = (cartId: string, line: string | null, more: Partial<CheckoutRequest> = {}): CheckoutRequest => ({ storeId: f.S, cartId, lang: 'en', address: line ? { line, confirmed: null } : null, ...more });

  beforeAll(async () => {
    f = await setUpOrders('checkout_eta');
    const sub = await f.priceBand('dhaka-sub-area', 7_000);
    // the owner's sub-area list: Savar is charged as the sub-area (Delivery › zones)
    const savar = await f.t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.dhaka.dhaka.savar' } });
    await f.t.prisma.areaBand.create({ data: { storeId: f.S, areaId: savar.id, bandId: sub } });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('as shipped: nothing said, no pre-order — the usual promise stands', async () => {
    expect(registry['rules.eid.enabled'].default).toBe(false);
    expect(registry['delivery.holiday'].default.enabled).toBe(false);
    f.clock.now = at('2027-03-08');
    const bag = await f.bag('shipped', [{ variantId: f.v.skyM }]);
    const q = await checkoutQuote(f.deps(), req(bag.cartId, BANDS[2].line));
    expect(q.eta).toEqual({ lines: [], preorder: null });
    expect(q.preorder).toBe(false);
    expect(q.pay).toMatchObject({ cod: true, codOff: null });
    expect(q.advance).toBeNull();
  });

  for (const b of BANDS) {
    it(`SIM-F-019 ${b.band}: the usual promise up to ${b.orderBy}, then "may arrive after Eid" (never the hours)`, async () => {
      eidOn();
      const bag = await f.bag(`band-${b.band}`, [{ variantId: f.v.skyM }]);
      f.clock.now = at(b.orderBy, '23:59');
      const before = await checkoutQuote(f.deps(), req(bag.cartId, b.line));
      expect(before.delivery).toMatchObject({ state: 'found', band: { key: b.band } });
      expect(before.eta.lines).toEqual([]);
      f.clock.now = at(dayAfter(b.orderBy), '00:01');
      const after = await checkoutQuote(f.deps(), req(bag.cartId, b.line));
      expect(after.eta.lines).toEqual([late]);
      expect(viewOf(after).eta.lines).toEqual([late]);
      // no pre-order unless the owner switched it on: the money and Cash on Delivery are untouched
      expect(after.eta.preorder).toBeNull();
      expect(after.pay).toMatchObject({ cod: true, codOff: null });
      expect(after.totals).toEqual(before.totals);
    });
  }

  it("a district's own date wins over its band's", async () => {
    eidOn();
    set({ 'rules.eid.districtDates': [{ district: 'bd.rajshahi.bogura', orderBy: '2027-03-01' }] });
    const bag = await f.bag('district', [{ variantId: f.v.skyM }]);
    f.clock.now = at('2027-03-02');
    expect((await checkoutQuote(f.deps(), req(bag.cartId, BANDS[2].line))).eta.lines).toEqual([late]);
    // another outside-Dhaka district keeps the band's date (3 Mar)
    expect((await checkoutQuote(f.deps(), req(bag.cartId, 'Sadar Road, Dinajpur'))).eta.lines).toEqual([]);
    f.overrides.delete('rules.eid.districtDates');
  });

  it('holiday mode: "ships from" the day after the break, during the break only, even before an address', async () => {
    f.overrides.delete('rules.eid.enabled');
    set({ 'delivery.holiday': { ...registry['delivery.holiday'].default, enabled: true, from: '2027-04-08', to: '2027-04-11', showDaysBefore: 3 } });
    f.clock.now = at('2027-04-06');
    const bag = await f.bag('holiday', [{ variantId: f.v.skyM }]);
    expect((await checkoutQuote(f.deps(), req(bag.cartId, BANDS[0].line))).eta.lines).toEqual([]);
    f.clock.now = at('2027-04-09');
    const ships = `We are on a break: your order ships from ${formatDay('2027-04-12', 'en-BD')}.`;
    expect((await checkoutQuote(f.deps(), req(bag.cartId, null))).eta.lines).toEqual([ships]);
    const q = await checkoutQuote(f.deps(), req(bag.cartId, TEST_FORM.address));
    expect(q.eta.lines).toEqual([ships]);
    expect(q.pay.cod).toBe(true);
    // the thank-you page says what the checkout said when he placed it
    const placed = await placeOrder(f.deps(), {
      storeId: f.S,
      visitorId: bag.visitorId,
      input: { idempotencyKey: randomUUID(), lang: 'en', form: TEST_FORM, confirmed: null, payment: q.pay.chosen, fingerprint: q.fingerprint } satisfies PlaceInput,
    });
    f.clock.now = at('2027-04-20');
    expect(await receiptEta(f.deps(), f.S, placed.number, 'en')).toEqual([ships]);
    expect((await receiptEta(f.deps(), f.S, placed.number, 'bn'))[0]).toContain(formatDay('2027-04-12', 'bn-BD'));
    f.overrides.delete('delivery.holiday');
  });

  it("Eid pre-order: only with the owner's switch and advance, only past the date; the advance goes PR 560's way", async () => {
    eidOn();
    const out = BANDS[2];
    const bag = await f.bag('preorder', [{ variantId: f.v.skyM }]);
    f.clock.now = at(dayAfter(out.orderBy));
    const cod = await checkoutQuote(f.deps(), req(bag.cartId, out.line));
    // switched on with no advance never offers it (the check refuses it in the admin too)
    set({ 'rules.eid.preorder.enabled': true });
    expect((await checkoutQuote(f.deps(), req(bag.cartId, out.line))).advance).toBeNull();
    set({ 'rules.eid.preorder.advanceMinor': 30_000 });
    // before the date: an ordinary order
    f.clock.now = at(out.orderBy);
    const early = await checkoutQuote(f.deps(), req(bag.cartId, out.line));
    expect(early.preorder).toBe(false);
    expect(early.pay.cod).toBe(true);
    // past the date: COD goes, the advance now and the rest at the door, the money exactly the COD money
    f.clock.now = at(dayAfter(out.orderBy));
    const q = await checkoutQuote(f.deps(), req(bag.cartId, out.line));
    expect(q.preorder).toBe(true);
    expect(q.pay).toMatchObject({ cod: false, codOff: 'ADVANCE' });
    expect(q.advance).toEqual({ kind: 'part', amountMinor: 30_000, restMinor: q.totals.dueMinor - 30_000 });
    expect(q.totals).toEqual(cod.totals);
    expect(q.eta.lines).toEqual([late]);
    expect(q.eta.preorder).toContain('300');
    expect(q.eta.preorder).not.toContain(String(q.totals.totalMinor / 100));

    const placed = await placeOrder(f.deps(), {
      storeId: f.S,
      visitorId: bag.visitorId,
      input: { idempotencyKey: randomUUID(), lang: 'en', form: { ...TEST_FORM, address: out.line }, confirmed: null, payment: q.pay.chosen, fingerprint: q.fingerprint } satisfies PlaceInput,
    });
    expect(placed.next).toBe('pay');
    const o = await f.t.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(o).toMatchObject({ paymentMethod: 'COD', advanceRequirement: 'PART_AMOUNT', advanceRequiredMinor: 30_000, codAmountMinor: q.totals.dueMinor, totalMinor: cod.totals.totalMinor });
    expect(o.flags).toContain('EID_PREORDER');
    expect(await f.t.prisma.checkoutFlagEvent.count({ where: { orderId: o.id } })).toBe(0);
    expect(await f.t.prisma.payment.findFirst({ where: { orderId: o.id } })).toMatchObject({ purpose: 'PART_ADVANCE', amountMinor: 30_000, status: 'INITIATED' });
    const ev = await f.t.prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.id, type: 'order.placed' } });
    expect(ev.data).toMatchObject({ codOff: 'ADVANCE', advance: { kind: 'part', amountMinor: 30_000 }, preorder: true });
    // it waits for the advance, the payment page pays just that, and it comes back to the queue
    expect(await askCheckoutAdvance(f.ordersDeps(), { storeId: f.S, orderId: o.id })).toBe(true);
    expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('AWAITING_ADVANCE');
    expect((await payAction(cd(), { storeId: f.S, visitorId: bag.visitorId, input: { number: placed.number, action: 'approve' } })).status).toBe('PAID');
    expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: 'PLACED', paidMinor: 30_000, paymentMethod: 'COD' });
    expect(await receiptEta(f.deps(), f.S, placed.number, 'en')).toEqual([late]);
  });

  it('a percentage advance of 100 is the full amount ahead; a gift or a shop with COD off gets no pre-order', async () => {
    eidOn();
    set({ 'rules.eid.preorder.enabled': true, 'rules.eid.preorder.advanceType': 'percent', 'rules.eid.preorder.advancePercent': 100 });
    const out = BANDS[2];
    f.clock.now = at(dayAfter(out.orderBy));
    const bag = await f.bag('full', [{ variantId: f.v.skyM }]);
    const q = await checkoutQuote(f.deps(), req(bag.cartId, out.line));
    expect(q.advance).toEqual({ kind: 'full', amountMinor: q.totals.dueMinor, restMinor: 0 });
    set({ 'checkout.gift': { ...registry['checkout.gift'].default, enabled: true } });
    expect((await checkoutQuote(f.deps(), req(bag.cartId, out.line, { gift: true }))).preorder).toBe(false);
    f.overrides.delete('checkout.gift');
    set({ 'payment.cod.enabled': false });
    const off = await checkoutQuote(f.deps(), req(bag.cartId, out.line));
    expect(off.preorder).toBe(false);
    expect(off.eta.lines).toEqual([late]);
    set({ 'payment.cod.enabled': true });
  });
});
