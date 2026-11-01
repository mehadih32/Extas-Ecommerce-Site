// PR 414 follow-up (CN-013 go-live gate phase 2) — what the gate-orders oracle does on the shop's own side, each step
// through the package function the admin's button calls (confirm, add a line, book, print the sticker, record a
// payment, re-book, import the courier's statement, cancel), as the system actor with the gate run on every audit row.
// The browser (tools/gate-orders/shop.mjs) places the orders on the storefront like a customer; this side prepares the
// GATE TEST products, reads what the shop stored and showed, and runs the admin's half of each scenario.
//
// Rules it keeps (owner's OK of 1 Nov 2026, CLAUDE.md hard rules):
// - every connection is its mock (deps.ts); a check that would reach a real provider the live shop has switched on is
//   a SKIP, and with a real message gateway or ERP switched on no order is placed at all (shop.mjs reads `providers`);
// - nothing is deleted: test orders are cancelled through the normal cancel path, test products, colours, sizes, the
//   test shelf and the test courier account are archived; money is only ever the smallest manual record on a test order
//   (gate check 4) and a statement that says nothing was collected (gate check 23) — no refund, price or discount moves;
// - sample data only (tools/gate-orders/data/test-data.json), never the owner's: the run touches only orders that hold a
//   GATE TEST piece, and it never changes a setting for the shop's visitors;
// - live run 1 Nov: it pays on the practice gateway through its run's own grant (lib/test-shop.ts openRun: its own
//   browser only, on the preview host, closed at the end), and turns cash on delivery on for the run only with the
//   owner's `allow_cod` (put back as it was; both written to the audit log as the system actor).
import { courierAdapters, mockCourierWorld, STEADFAST_PROVIDER, type CourierParcel } from '@extas/adapters';
import { audit } from '@extas/auth';
import { requestCode } from '@extas/accounts';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { variantStock } from '@extas/inventory';
import { formatAmount, render, runContext, sampleInput, type MessagesDeps } from '@extas/messages';
import { counts, kpi, salesBySku } from '@extas/metrics';
import { addLine, addNote, cancelAfterBooking, cancelOrder, confirmOrder, getOrder, recordCourierCancel } from '@extas/orders';
import { importSettlement, orderMoney, recordPayment } from '@extas/payments';
import { addCourier, bookOrders, listCouriers, printStickers, rateFor, rebookParcel, staleParcelOf, updateCourier } from '@extas/shipping';
import { archiveProducts, closeRuns, openRun, setTestStock, setUpProducts, skuPrefix, type Kit, type TestData } from '../lib/test-shop';
import { keptSms, PROVIDER_KINDS, type GateDeps } from './deps';

export { skuPrefix, type TestData };

type Json = Record<string, unknown>;
const errText = (e: unknown): string => {
  const code = (e as { code?: unknown })?.code;
  const msg = e instanceof Error ? e.message : String(e);
  return `${typeof code === 'string' ? `${code}: ` : ''}${msg}`.split('\n')[0]!.slice(0, 300);
};

/** The courier account the run books with (its own, archived at the end): the marker in its name. */
const courierName = (d: TestData) => `${d.marker} — do not use (gate-orders run)`.slice(0, 60);

const OPEN_SHIPMENT = ['BOOKING', 'IN_REVIEW', 'PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'CANCEL_REQUESTED'] as const;
const CLOSED_ORDER = ['CANCELLED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'];

export class Oracle {
  private readonly provider = courierAdapters.some((a) => a.provider === STEADFAST_PROVIDER) ? STEADFAST_PROVIDER : courierAdapters[0]!.provider;
  private readonly world = mockCourierWorld(this.provider);
  private courierId: string | null = null;
  private courierProvider: string | null = null;
  private readonly tagged = new Set<string>();

  constructor(
    private readonly g: GateDeps,
    private readonly data: TestData,
    private readonly runId: string,
  ) {}

  private get S() {
    return this.g.storeId;
  }

  private setting<K extends Parameters<GateDeps['settings']['value']>[0]>(key: K) {
    return this.g.settings.value(key, { storeId: this.S });
  }

  /** The order of this store by its number, holding a GATE TEST piece (never any other order). */
  private async gateOrder(number: string) {
    const o = await this.g.db.order.findFirst({ where: { storeId: this.S, number: String(number), items: { some: { sku: { startsWith: skuPrefix(this.data) } } } }, select: { id: true, number: true, status: true } });
    if (!o) throw new Error(`no GATE TEST order ${number}`);
    return o;
  }

  // ---- guard, providers, settings ----

  /** What the host guard needs from the shop (its saved preview host, every host it sells on) and the live providers. */
  async facts(): Promise<Json> {
    const [saved, domains, rows] = await Promise.all([
      this.g.settings.value('system.stagingHost'),
      this.g.db.storeDomain.findMany({ where: { archivedAt: null }, select: { hostname: true } }),
      this.g.db.integration.findMany({ where: { kind: { in: [...PROVIDER_KINDS] }, enabled: true, archivedAt: null, mode: { not: 'MOCK' }, OR: [{ storeId: null }, { storeId: this.S }] }, select: { kind: true, provider: true, mode: true } }),
    ]);
    return { saved: saved ?? null, storeHosts: domains.map((d) => d.hostname), providers: { live: rows.map((r) => ({ kind: r.kind, provider: r.provider, mode: r.mode })) } };
  }

  /** The owner's switches the scenarios depend on (read only; the run never changes one). */
  async switches(): Promise<Json> {
    const [cod, mobileOn, mobileList, cardOn, onlineOn, testPayments, gift, messages, prefix, currency, cancelCustomer, bands] = await Promise.all([
      this.setting('payment.cod.enabled'),
      this.setting('checkout.pay.mobile.enabled'),
      this.setting('checkout.pay.mobile.list'),
      this.setting('checkout.pay.card.enabled'),
      this.setting('checkout.pay.online.enabled'),
      this.setting('payments.testPayments'),
      this.setting('checkout.gift'),
      this.setting('messages.enabled'),
      this.setting('naming.productPathPrefix'),
      this.setting('store.currency'),
      this.setting('orders.cancel.customer'),
      this.g.db.deliveryBand.findMany({ where: { storeId: this.S, archivedAt: null }, select: { key: true, enabled: true, chargeMinor: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const now = new Date();
    const coupon = await this.g.db.coupon.findFirst({
      where: { storeId: this.S, enabled: true, archivedAt: null, usageLimit: null, perCustomerLimit: null, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
      select: { code: true, minOrderMinor: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      cod: cod === true,
      mobile: { enabled: mobileOn === true, list: Array.isArray(mobileList) ? mobileList : [] },
      card: cardOn === true,
      online: onlineOn === true,
      testPayments: testPayments === true,
      gift: !!(gift && typeof gift === 'object' && (gift as { enabled?: boolean }).enabled),
      messages: messages === true,
      pathPrefix: typeof prefix === 'string' ? prefix : '',
      currency,
      cancelCustomer,
      bands,
      // only a coupon with no use limit (a test order never spends one of the owner's limited codes); the code goes to
      // the browser to type and is scrubbed from the report
      coupon: coupon ? { code: coupon.code, minOrderMinor: coupon.minOrderMinor } : null,
    };
  }

  // ---- the GATE TEST products ----

  /** The shared helpers' view of this oracle (tools/gate-orders/lib/test-shop.ts). */
  private get kit(): Kit {
    return { db: this.g.db, storeId: this.S, settings: this.g.settings, who: this.g.who, source: 'gate-orders' };
  }

  /** The test colours, sizes, shelf, products, variants and stock (made once, opened again on a later run). */
  async setUp(): Promise<Json> {
    return { ...(await setUpProducts(this.kit, this.data, this.runId)) };
  }

  /** Sets one test variant's sellable stock on the test shelf (the last-piece and race scenarios). */
  async setStock(variantId: string, qty: number): Promise<Json> {
    return setTestStock(this.kit, this.data, this.runId, variantId, qty);
  }

  /**
   * The run's mock-payment grant for its own browser on the preview host (and cash on delivery only with the owner's
   * `allow_cod`): GATE_PAY_TOKEN_HASH, GATE_ALLOW_COD and GATE_RUN_MINUTES come from the shell (gate-orders.sh).
   */
  async openRun(host: string): Promise<Json> {
    const hash = process.env.GATE_PAY_TOKEN_HASH ?? '';
    if (!hash) return { open: false, why: 'no run token (GATE_PAY_TOKEN_HASH)', cod: { on: (await this.setting('payment.cod.enabled')) === true, changed: false } };
    return openRun(this.kit, { runId: this.runId, tokenHash: hash, host, minutes: Number(process.env.GATE_RUN_MINUTES || 0), allowCod: process.env.GATE_ALLOW_COD === 'yes' });
  }

  /** Closes the run's grant (with `all`: every other open one, what a crashed run left) and puts cash on delivery back. */
  closeRun(all = false): ReturnType<typeof closeRuns> {
    return closeRuns(this.kit, all ? { except: this.runId } : { runId: this.runId });
  }

  /** The sellable pieces of test variants now (the inventory's own figure, as the admin's stock page reads it). */
  async stock(variantIds: string[]): Promise<Json> {
    const out: Json = {};
    for (const id of variantIds) out[id] = (await variantStock(this.g.inventory, this.g.who, { variantId: id })).sellable;
    return out;
  }

  // ---- reading the orders ----

  /** The run's orders for one number since a time (exactly-one checks). */
  async ordersOf(phone: string, since: string): Promise<Json> {
    const p = phoneNormalizeBD(phone);
    if (!p.ok) return { orders: [], why: 'not a mobile number' };
    const rows = await this.g.db.order.findMany({ where: { storeId: this.S, phone: p.e164, placedAt: { gte: new Date(since) }, items: { some: { sku: { startsWith: skuPrefix(this.data) } } } }, select: { number: true, status: true, paymentMethod: true, customerId: true }, orderBy: { placedAt: 'asc' } });
    return { orders: rows };
  }

  /** An internal note on each test order (the order's flags take only the owner's list, so a note marks it). */
  async tag(number: string): Promise<void> {
    if (this.tagged.has(number)) return;
    const o = await this.gateOrder(number);
    await addNote(this.g.orders, this.g.who, o.id, { body: `${this.data.marker} order of the go-live gate run ${this.runId}: placed on the preview site on the mocks; cancelled by the run. Do not pack or ship.`, isInternal: true });
    this.tagged.add(number);
  }

  /** What the shop stored and what the order's admin screen shows (the order service's `getOrder`, as the screen reads it). */
  async order(number: string): Promise<Json> {
    const o0 = await this.gateOrder(number);
    await this.tag(number).catch(() => undefined);
    const o = await this.g.db.order.findUniqueOrThrow({
      where: { id: o0.id },
      select: { id: true, number: true, status: true, phone: true, customerName: true, shippingAddressText: true, backfilledAddress: true, addressUnclear: true, deliveryChargeMinor: true, chargeFixed: true, totalMinor: true, discountMinor: true, couponCode: true, paidMinor: true, codAmountMinor: true, paymentMethod: true, lang: true, isGift: true, customerId: true, area: { select: { code: true } }, deliveryBand: { select: { key: true, chargeMinor: true } }, items: { where: { status: 'ACTIVE' }, select: { sku: true, quantity: true } } },
    });
    const admin = await getOrder(this.g.orders, this.g.who, o.id);
    return {
      number: o.number,
      status: o.status,
      stored: { name: o.customerName, phone: o.phone, address: o.shippingAddressText },
      admin: { name: admin.delivery.name, phone: admin.delivery.phone, address: admin.delivery.addressTyped },
      backfilled: o.backfilledAddress,
      areaCode: o.area?.code ?? null,
      addressUnclear: o.addressUnclear,
      band: o.deliveryBand ? { key: o.deliveryBand.key, chargeMinor: o.deliveryBand.chargeMinor } : null,
      deliveryChargeMinor: o.deliveryChargeMinor,
      chargeFixed: o.chargeFixed,
      totalMinor: o.totalMinor,
      paidMinor: o.paidMinor,
      dueMinor: admin.money.dueMinor,
      paymentMethod: o.paymentMethod,
      lang: o.lang,
      isGift: o.isGift,
      customerId: o.customerId,
      discountMinor: o.discountMinor,
      couponApplied: !!o.couponCode,
      items: o.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
      payments: admin.payments.map((p) => ({ method: p.method, status: p.status, amountMinor: p.amountMinor })),
    };
  }

  // ---- the courier side (mock courier, the run's own courier account) ----

  /** The run's courier account (made once, switched on again, archived by the clean-up). */
  async courier(): Promise<string> {
    if (this.courierId) return this.courierId;
    const name = courierName(this.data);
    const { couriers, providers } = await listCouriers(this.g.shipping, this.g.who, { includeArchived: true });
    const provider = providers.includes(this.provider) ? this.provider : providers[0];
    if (!provider) throw new Error('the shop has no courier adapter');
    const mine = couriers.find((c) => c.name === name && c.providerKey === provider);
    const id = mine ? mine.id : (await addCourier(this.g.shipping, this.g.who, { providerKey: provider, name })).id;
    if (mine && (!mine.enabled || mine.archived)) await updateCourier(this.g.shipping, this.g.who, id, { enabled: true, archived: false });
    this.courierId = id;
    this.courierProvider = provider;
    return id;
  }

  private parcelOf(merchantRef: string | null): CourierParcel | null {
    return merchantRef ? (this.world.byRef(merchantRef) ?? null) : null;
  }

  private async latestShipment(orderId: string) {
    return this.g.db.shipment.findFirst({ where: { storeId: this.S, orderId }, orderBy: { attempt: 'desc' }, select: { id: true, status: true, consignmentId: true, merchantRef: true, codAmountMinor: true, weightGrams: true, attempt: true } });
  }

  /** Confirm (when it waits) and book one test order with the run's courier, then print its sticker. */
  async book(number: string): Promise<Json> {
    const o = await this.gateOrder(number);
    if (o.status === 'PLACED') await confirmOrder(this.g.orders, this.g.who, o.id);
    const run = await bookOrders(this.g.shipping, this.g.who, { courierAccountId: await this.courier(), orderIds: [o.id] });
    const r = run.results[0];
    if (!r || r.outcome !== 'booked') return { booked: false, outcome: r?.outcome ?? null, code: r?.code ?? null, error: r?.error ?? null };
    return { booked: true, ...(await this.parcelFacts(o.id)) };
  }

  /** What the mock courier was sent and what the sticker prints for the order's live parcel. */
  private async parcelFacts(orderId: string): Promise<Json> {
    const s = await this.latestShipment(orderId);
    if (!s) return { courier: null, sticker: null };
    const p = this.parcelOf(s.merchantRef);
    let sticker: Json | null = null;
    let stickerError: string | null = null;
    try {
      const print = await printStickers(this.g.shipping, this.g.who, { shipmentIds: [s.id], requestKey: `gate-${this.runId}-${s.id}`.slice(0, 100) });
      const x = print.parcels[0];
      if (x) sticker = { name: x.receiver.name, phone: x.receiver.phone, address: x.receiver.address, collectMinor: x.collectMinor, gift: x.gift, practice: x.practice };
    } catch (e) {
      stickerError = errText(e);
    }
    return {
      shipmentId: s.id,
      attempt: s.attempt,
      consignmentId: s.consignmentId,
      codAmountMinor: s.codAmountMinor,
      courier: p ? { name: p.receiver.name, phone: p.receiver.phone, address: p.receiver.address, codMinor: p.codMinor, weightGrams: p.weightGrams } : null,
      sticker,
      stickerError,
    };
  }

  // ---- the six gate checks that need an order ----

  /** Check 1: a mock-bKash-paid order — the rider collects 0, the sticker says 0, and no message asks for money. */
  async check1(number: string): Promise<Json> {
    const o = await this.gateOrder(number);
    const money = await orderMoney(this.g.payments, this.g.who, o.id);
    const booked = await this.book(number);
    const messages = await this.messagesAskMoney(o.id);
    return { dueMinor: money?.dueMinor ?? null, codToCollectMinor: money?.codToCollectMinor ?? null, booked, messages };
  }

  /**
   * Every message of the owner's journey that is switched on, filled for this order the way the engine fills it (the
   * engine's own `render`), on every channel and language the shop has words for. A paid order's message that would
   * show an amount is refused by the engine (AMOUNT_RULE); one that goes out must name no amount.
   */
  private async messagesAskMoney(orderId: string): Promise<Json> {
    const o = await this.g.db.order.findUniqueOrThrow({ where: { id: orderId }, select: { number: true, customerName: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true, currency: true } });
    const mdeps: MessagesDeps = { db: this.g.db, settings: this.g.settings, sender: async () => ({ send: async () => ({ ok: false, error: 'the gate run sends nothing' }) }) as never };
    const c = await runContext(mdeps, this.S);
    const due = Math.max(0, o.totalMinor - o.walletAppliedMinor - o.paidMinor);
    const steps = Object.entries(c.journey).filter(([, s]) => s.on);
    const rows = await this.g.db.notificationTemplate.findMany({ where: { storeId: this.S, key: { in: steps.map(([, s]) => s.template) }, archivedAt: null }, select: { key: true, channel: true, locale: true, subject: true, body: true } });
    const amountShapes = [formatAmount(o.totalMinor, o.currency), formatAmount(Math.max(1, o.totalMinor - o.walletAppliedMinor), o.currency)];
    const out: Json[] = [];
    for (const [step, s] of steps) {
      for (const t of rows.filter((r) => r.key === s.template)) {
        const lang = t.locale === 'en' ? 'en' : 'bn';
        const input = { ...sampleInput({ storeName: c.storeName, host: c.host, currency: o.currency, amountLine: c.amountLine, exactAmount: c.exact }, lang, 'prepaid'), dueMinor: due, orderNumber: o.number, customerName: o.customerName ?? '' };
        const r = render(t.body, t.channel === 'EMAIL' ? (t.subject ?? '') : null, input);
        if (!r.ok) {
          out.push({ step, channel: t.channel, locale: t.locale, sent: false, reason: r.reason });
          continue;
        }
        const text = `${r.subject ?? ''} ${r.text}`;
        out.push({ step, channel: t.channel, locale: t.locale, sent: true, asksMoney: amountShapes.some((a) => a && text.includes(a)) });
      }
    }
    return { dueMinor: due, steps: steps.length, checked: out.length, rows: out };
  }

  /**
   * Check 4 (and scenario 15): the admin adds a piece, the order is booked, a payment is recorded by hand, the parcel is
   * found stale and re-booked — the courier's new amount is the live amount due.
   */
  async check4(number: string, variantId: string): Promise<Json> {
    const o = await this.gateOrder(number);
    if (o.status === 'PLACED') await confirmOrder(this.g.orders, this.g.who, o.id);
    const before = await this.g.db.order.findUniqueOrThrow({ where: { id: o.id }, select: { totalMinor: true } });
    await addLine(this.g.orders, this.g.who, o.id, { variantId, quantity: 1 });
    const after = await this.g.db.order.findUniqueOrThrow({ where: { id: o.id }, select: { totalMinor: true } });
    const first = await this.book(number);
    if (!first.booked) return { added: after.totalMinor > before.totalMinor, first, rebooked: false };
    const pay = await recordPayment(this.g.payments, this.g.who, o.id, { method: 'BKASH', amountMinor: this.data.payment.recordMinor, reference: `${skuPrefix(this.data)}${this.runId}`.slice(0, 100), note: `${this.data.marker}: the gate run's test record (check 4)`, confirm: true }, { idempotencyKey: `gate-${this.runId}-${o.id}-pay` });
    const stale = await staleParcelOf(this.g.db, this.S, o.id);
    let rebook: Json | null = null;
    if (stale) {
      const r = await rebookParcel(this.g.shipping, this.g.who, stale.shipmentId, { cancelledVia: 'panel', courierRef: `${skuPrefix(this.data)}MOCK`, note: `${this.data.marker}: the practice courier's parcel, re-booked by the gate run` });
      rebook = { outcome: r.booking?.outcome ?? null, ...(await this.parcelFacts(o.id)) };
    }
    return { added: after.totalMinor > before.totalMinor, addedMinor: after.totalMinor - before.totalMinor, first, recordedMinor: pay.amountMinor, dueMinor: pay.dueMinor, codToCollectMinor: pay.codToCollectMinor, stale: stale ? { why: stale.why, bookedCodMinor: stale.bookedCodMinor, dueMinor: stale.dueMinor } : null, rebook };
  }

  /** Check 21: after a failed mock payment and a retry — one order, one paid payment. */
  async check21(number: string, phone: string, since: string): Promise<Json> {
    const o = await this.gateOrder(number);
    const payments = await this.g.db.payment.findMany({ where: { storeId: this.S, orderId: o.id }, select: { status: true, method: true } });
    const orders = (await this.ordersOf(phone, since)).orders as unknown[];
    return { orders: orders.length, paid: payments.filter((p) => p.status === 'PAID').length, failed: payments.filter((p) => p.status === 'FAILED').length, payments: payments.length };
  }

  /** Check 23: the courier's statement with a planted mismatch (nothing collected for a parcel that owes) and a parcel we never booked. */
  async check23(number: string): Promise<Json> {
    const o = await this.gateOrder(number);
    const s = await this.latestShipment(o.id);
    if (!s?.consignmentId || !this.courierId) return { imported: false, why: 'the order has no booked parcel' };
    if (s.codAmountMinor <= 0) return { imported: false, why: 'the parcel owes nothing (a prepaid order)' };
    const sum = await importSettlement(this.g.payments, this.g.who, {
      courierAccountId: this.courierId,
      reference: `${this.data.marker} ${this.runId}`.slice(0, 120),
      lines: [
        { consignmentId: s.consignmentId, codMinor: this.data.statement.collectedMinor, chargeMinor: this.data.statement.chargeMinor },
        { consignmentId: `${this.data.statement.unknownConsignment}-${this.runId}`.slice(0, 100), codMinor: this.data.statement.collectedMinor, chargeMinor: this.data.statement.chargeMinor },
      ],
    });
    return { imported: true, mismatched: sum.mismatched, matched: sum.matched, lines: sum.lines.map((l) => ({ ours: l.consignmentId === s.consignmentId, matchState: l.matchState, reasonCode: l.reasonCode, expectedMinor: l.expectedMinor })), totalCodMinor: sum.totalCodMinor };
  }

  /** Check 24: the 2.1 kg parcel — the courier is sent its real weight, and the owner's rate card (if any) prices it by its own slab. */
  async check24(number: string): Promise<Json> {
    const o = await this.gateOrder(number);
    const s = await this.latestShipment(o.id);
    const p = this.parcelOf(s?.merchantRef ?? null);
    const order = await this.g.db.order.findUniqueOrThrow({ where: { id: o.id }, select: { deliveryBand: { select: { key: true } } } });
    const cards = await this.g.db.courierRateCard.findMany({ where: { storeId: this.S, courierAccount: { archivedAt: null } }, select: { courierAccountId: true, zoneKey: true, weightFromGrams: true, weightToGrams: true, chargeMinor: true, returnChargeMinor: true, validFrom: true, validTo: true } });
    const zone = order.deliveryBand?.key ?? null;
    const w = this.data.weightCheckGrams;
    const now = new Date();
    const byAccount = [...new Set(cards.map((c) => c.courierAccountId))].map((id) => {
      const mine = cards.filter((c) => c.courierAccountId === id);
      const row = rateFor(mine, { zoneKey: zone, weightGrams: w, at: now });
      const kilo = rateFor(mine, { zoneKey: zone, weightGrams: Math.min(1000, w), at: now });
      return { slab: row ? { from: row.weightFromGrams, to: row.weightToGrams, chargeMinor: row.chargeMinor } : null, oneKilo: kilo ? { from: kilo.weightFromGrams, to: kilo.weightToGrams, chargeMinor: kilo.chargeMinor } : null };
    });
    return { weightSent: p?.weightGrams ?? s?.weightGrams ?? null, weightWanted: w, zone, rateCards: cards.length, accounts: byAccount };
  }

  /** A sign-in code for a test number, made by the shop's own account service and kept here (no SMS leaves the server). */
  async otp(phone: string): Promise<Json> {
    const kept = keptSms();
    const storeName = String(await this.setting('store.name'));
    const r = await requestCode(this.g.accounts(kept.sender), { storeId: this.S, phone, purpose: 'LOGIN', lang: 'en', storeName });
    const m = kept.sent[0];
    if (!m) return { known: false };
    const code = (m.text.match(new RegExp(`(?<!\\d)\\d{${r.length}}(?!\\d)`)) ?? [])[0] ?? null;
    return { known: true, code };
  }

  // ---- reports and the clean-up ----

  /** Cancelled test orders never count as sales (delivered only); the run's period shows no GATE TEST piece sold. */
  async sales(since: string, numbers: string[]): Promise<Json> {
    const period = { from: new Date(since), to: new Date() };
    const skus = await salesBySku(this.g.db, this.S, period, 500);
    const gate = skus.filter((s) => s.sku.startsWith(skuPrefix(this.data)));
    const rows = await this.g.db.order.findMany({ where: { storeId: this.S, number: { in: numbers.map(String) } }, select: { number: true, status: true } });
    const counted = rows.filter((r) => counts('sales', r.status));
    const k = await kpi(this.g.db, this.S, period);
    return { gateSkusSold: gate.length, countedAsSales: counted.map((r) => r.number), ordersInPeriod: k.ordered.orders ?? null };
  }

  /** One test order cancelled through the normal path (before booking: cancel; after: cancel after booking + the courier's yes). */
  async cancel(number: string, note: string): Promise<'cancelled' | 'closed'> {
    const o = await this.gateOrder(number);
    const full = await this.g.db.order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true, cancelPending: true } });
    if (CLOSED_ORDER.includes(full.status)) return 'closed';
    const text = `${this.data.marker}: ${note}`.slice(0, 500);
    const s = await this.g.db.shipment.findFirst({ where: { storeId: this.S, orderId: o.id, status: { in: [...OPEN_SHIPMENT] } }, orderBy: { attempt: 'desc' }, select: { status: true } });
    if (s) {
      if (!full.cancelPending || s.status !== 'CANCEL_REQUESTED') await cancelAfterBooking(this.g.orders, this.g.who, o.id, { reasonCode: 'OTHER', note: text });
      await recordCourierCancel(this.g.orders, this.g.who, o.id, 'confirmed', { courierRef: `${skuPrefix(this.data)}MOCK`, note: text });
    } else {
      await cancelOrder(this.g.orders, this.g.who, o.id, { reasonCode: 'OTHER', note: text });
    }
    return 'cancelled';
  }

  /**
   * The clean-up (nothing deleted): every open order that holds a GATE TEST piece (this run's or one an earlier run left)
   * is cancelled; the test products are taken off sale and archived, their colours, sizes and shelf archived, the run's
   * courier account archived. `withProducts` false: only the orders (the start of a run).
   */
  async cleanUp(withProducts: boolean): Promise<Json> {
    const prefix = skuPrefix(this.data);
    const orders = await this.g.db.order.findMany({ where: { storeId: this.S, items: { some: { sku: { startsWith: prefix } } } }, select: { id: true, number: true, status: true }, orderBy: { placedAt: 'asc' } });
    let cancelled = 0;
    let alreadyClosed = 0;
    const failed: string[] = [];
    for (const o of orders) {
      if (CLOSED_ORDER.includes(o.status)) {
        alreadyClosed += 1;
        continue;
      }
      try {
        if ((await this.cancel(o.number, `the go-live gate run ${this.runId} cancels its test order`)) === 'cancelled') cancelled += 1;
        else alreadyClosed += 1;
      } catch (e) {
        failed.push(`${o.number} (${errText(e)})`);
      }
    }
    const ids = orders.map((o) => o.id);
    const refunds = ids.length ? await this.g.db.refund.count({ where: { storeId: this.S, orderId: { in: ids }, status: 'REQUESTED' } }) : 0;
    const notes = ids.length ? await this.g.db.orderNote.count({ where: { storeId: this.S, orderId: { in: ids }, isInternal: true, body: { startsWith: this.data.marker } } }) : 0;
    const out: Json = { ok: failed.length === 0, orders: orders.length, cancelled, alreadyClosed, failed, refundRequests: refunds, tagged: `${notes} of ${orders.length} test orders carry an internal "${this.data.marker}" note (the order flags take only the owner's own list)` };
    if (!withProducts) return out;
    const archived = await archiveProducts(this.kit, this.data, this.runId);
    const { productsArchived, extrasArchived: extras } = archived;
    const productFails: string[] = [...archived.fails];
    let courierArchived = false;
    const name = courierName(this.data);
    const { couriers } = await listCouriers(this.g.shipping, this.g.who, { includeArchived: true });
    for (const c of couriers.filter((x) => x.name === name && !x.archived)) {
      try {
        await updateCourier(this.g.shipping, this.g.who, c.id, { enabled: false, archived: true });
        courierArchived = true;
        if (c.id === this.courierId) this.courierId = null; // a later booking in this process switches it on again
      } catch (e) {
        productFails.push(`courier account (${errText(e)})`);
      }
    }
    // the run's mock-payment grant closed and cash on delivery put back (the shell's trap runs the same again)
    const mockPay = await this.closeRun().catch((e: unknown) => ({ ok: false, closed: 0, codRestored: 0, notes: [`the run's grant: ${errText(e)}`] })); // hardcode-ok: a count, not a business number
    return { ...out, ok: failed.length === 0 && productFails.length === 0 && mockPay.ok === true, productsArchived, extrasArchived: extras, courierArchived, mockPay, notes: [...productFails.map((f) => `could not archive: ${f}`), ...mockPay.notes], courierProvider: this.courierProvider };
  }
}
