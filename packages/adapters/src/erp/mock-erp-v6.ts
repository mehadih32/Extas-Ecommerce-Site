// PR 607 (CN-028) — the practice ERP speaks contract v6 (docs/erp/site-changes-v6.md): one company's v6 books, kept
// beside its v5 stock and variants in mock-erp.ts. It behaves like the ERP where the shop's books depend on it:
// - orders fix their `erpTotal` at the shop price when placed and are billed when the parcel leaves (`POST /shipments`),
//   or at the delivery result when no shipment came; a cancelled order that never left is never billed;
// - refusals: `409 ACCOUNT_ON_HOLD` (not for exchanges), `409 NO_SHOP_PRICE`, `409 INSUFFICIENT_STOCK` with
//   `details.shortSkus`, `409 LINE_NOT_DELIVERED`, `409 EXCHANGE_OPEN`, `404` for another shop's order;
// - CN-033: until the ERP's own B-grade release, a B-grade order line (and a REPLACE with grade B) answers
//   `422 VALIDATION` with `details.bGradeSkus` (the ERP's decision of 30 Oct 2026); `bGradeOpen = true` is the earlier
//   behaviour, kept for the tests of an ERP that has opened B grade;
// - main stock first, then Return stock (`fromReturnStock: true`); a piece that fails the packing check is declined
//   once (on its earlier return) and its new line waits (`order.line.short`) for WAIT, REPLACE or CANCEL;
// - delivery results with the partial-delivery engine (GREEN, YELLOW, ORANGE), courier return lists (Return stock or
//   Hold, refusals), the owner's checks (approved credit at the price paid, declined = Retail's loss), courier claims;
// - exchanges: sent unbilled, a 4-day watch from the exchange parcel's delivery, settled by the difference, billed when
//   late or declined, credited when back after the bill, cancelled when the customer refuses the parcel;
// - the account: the ledger, the hold after `holdDays` without a payment while money is owed (warning from
//   `warnFromDays`), the period and its statement; daily summaries and fixed costs with every version kept; the cost
//   of goods by day and SKU;
// - every money or state change is an event with an id that is never used again; a correction is a new event that
//   `reverses` the old one. The events go out as signed webhooks (the test gives the secret) and come back in the pulls.
//
// Amounts are whole taka (numbers), as the contract's examples. The practice ERP's dates are Asia/Dhaka days of its
// own clock. Sample data only; it starts empty.
import { randomBytes } from 'node:crypto';
import type { ErpDeliveryStatus, ErpGrade, ErpIdentification } from './v6';

/** Asia/Dhaka is UTC+6 all year (no daylight saving): the ERP's business date of an instant. */
export const dhakaDate = (d: Date): string => new Date(d.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** What the v6 books need from the company's stock and variants (mock-erp.ts owns them). */
export interface V6StockHooks {
  now(): Date;
  warehouses(): string[];
  /** onHand − reserved (main stock) and the unchecked returned pieces (Return stock) of a SKU in a warehouse. */
  cell(sku: string, warehouseId: string): { main: number; ret: number } | null;
  adjust(sku: string, warehouseId: string, delta: { onHand?: number; reserved?: number; ret?: number }): void;
  variant(sku: string): { shopPrice: number | null; grade: ErpGrade; styleCode: string | null } | null;
}

export interface V6Event {
  eventId: string;
  type: string;
  occurredAt: string;
  date: string;
  reverses?: string;
  data: Record<string, unknown>;
}

type LineState = 'ACTIVE' | 'SHORT' | 'WAITING' | 'CANCELLED';

interface V6Line {
  lineId: string;
  sku: string;
  quantity: number;
  grade: ErpGrade;
  customerPrice: number;
  shopPrice: number;
  fromReturnStock: boolean;
  warehouseId: string;
  state: LineState;
  replacesLineId?: string;
  replacedShopPrice?: number;
  /** The line's pieces left the warehouse (a delivery result came). */
  out: boolean;
  /** Kept by the customer (delivered, or kept on a partial). */
  delivered: boolean;
  /** On its way back or back (returned or not kept). */
  returning: boolean;
}

interface V6Order {
  erpOrderId: string;
  externalOrderId: string;
  status: string;
  lines: V6Line[];
  deliveryCharge: number;
  advancePaid: number;
  billedAt: string | null;
  billedAmount: number;
  consignmentId: string | null;
  exchangeId: string | null;
  delivery: { status: ErpDeliveryStatus; collected: number; identification: ErpIdentification; keptLines: string[]; at: string } | null;
  handedBack: boolean;
}

type PieceStage = 'HOLD' | 'RETURN_STOCK' | 'APPROVED' | 'DECLINED' | 'SOLD_AGAIN';

interface V6Piece {
  id: string;
  externalOrderId: string;
  lineId: string;
  sku: string;
  warehouseId: string;
  /** What Retail paid the ERP for this piece (its line's shop price). */
  price: number;
  stage: PieceStage;
  returnListId: string | null;
  consignmentId: string | null;
  courier: string | null;
  handedBackAt: string;
  exchangeId: string | null;
  decidedAt: string | null;
  reason: string | null;
  decisionEventId: string | null;
}

interface V6Exchange {
  exchangeId: string;
  externalOrderId: string;
  ofExternalOrderId: string;
  status: string;
  lines: { lineId: string; replacesLineId: string; sku: string; shopPrice: number; replacedShopPrice: number }[];
  deliveredAt: string | null;
  deadline: string | null;
  billed: boolean;
  updatedAt: string;
  eventIds: string[];
}

interface LedgerRow {
  id: string;
  date: string;
  kind: 'BILL' | 'EXCHANGE' | 'CREDIT' | 'PAYMENT' | 'OTHER';
  amount: number;
  externalOrderId: string | null;
  reference: string | null;
  eventId: string | null;
}

interface ReturnRecord {
  key: string;
  externalOrderId: string;
  consignmentId: string | null;
  returnListId: string | null;
  stage: 'DELIVERY_RESULT' | 'HANDED_BACK' | 'HOLD_RESOLVED' | 'CHECKED' | 'CLOSED';
  handedBackAt: string | null;
  updatedAt: Date;
  eventIds: string[];
}

export interface V6Answer {
  status: number;
  answer: unknown;
}

const err = (status: number, code: string, message: string, details: unknown = null): V6Answer => ({ status, answer: { error: { code, message, details } } });
const ok = (status: number, answer: unknown): V6Answer => ({ status, answer });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const intOf = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);

/** The partial-delivery engine (§2.5.2): which sets of kept lines fit `collected`. */
export function identifyPartial(
  lines: { lineId: string; customerPrice: number; quantity: number; sku: string }[],
  collected: number,
  opts: { advancePaid: number; discount: number; maxDeliveryCharge?: number; rounding?: number },
): { identification: ErpIdentification; keptLines: string[] } {
  const maxDc = opts.maxDeliveryCharge ?? 200;
  const round = opts.rounding ?? 20;
  const value = (l: (typeof lines)[number]) => l.customerPrice * l.quantity;
  const cheapest = Math.min(...lines.map((l) => l.customerPrice));
  // A partial below the cheapest piece and within the delivery charge is a full return: only the charge was paid.
  if (lines.length && collected < cheapest && collected <= maxDc) return { identification: 'GREEN', keptLines: [] };
  const fits: string[][] = [];
  const n = Math.min(lines.length, 16);
  for (let mask = 1; mask < 1 << n; mask++) {
    const kept = lines.filter((_, i) => mask & (1 << i));
    const gap = collected + opts.advancePaid + opts.discount - kept.reduce((s, l) => s + value(l), 0);
    if (gap >= -round && gap <= maxDc + round) fits.push(kept.map((l) => l.lineId));
  }
  if (fits.length === 1) return { identification: 'GREEN', keptLines: fits[0]! };
  if (fits.length > 1) {
    const sig = (ids: string[]) => {
      const ls = lines.filter((l) => ids.includes(l.lineId));
      return `${ls.reduce((s, l) => s + l.quantity, 0)}:${ls.reduce((s, l) => s + value(l), 0)}`;
    };
    if (new Set(fits.map(sig)).size === 1) return { identification: 'YELLOW', keptLines: fits[0]! };
  }
  return { identification: 'ORANGE', keptLines: [] };
}

/** One company's v6 books in the practice ERP. */
export class PracticeErpV6 {
  readonly orders = new Map<string, V6Order>();
  readonly pieces: V6Piece[] = [];
  readonly exchanges = new Map<string, V6Exchange>();
  readonly ledger: LedgerRow[] = [];
  readonly events: V6Event[] = [];
  /** Events not yet taken by a test as webhooks (`takeEvents`). */
  private outbox: V6Event[] = [];
  readonly returnRecords = new Map<string, ReturnRecord>();
  readonly summaries = new Map<string, { versions: unknown[]; receivedAt: Date }>();
  readonly fixedCosts = new Map<string, unknown[]>();
  readonly returnLists = new Set<string>();
  /** Rows given by a test for days before the switch (`GET /cost-of-goods`). */
  readonly seededCostOfGoods: { date: string; sku: string; pieces: number; value: number }[] = [];
  /** The switch date has passed: the retired v5 calls answer 410. */
  switched = false;
  /** CN-033: B-grade order lines are open at this ERP (off: 422 VALIDATION with `bGradeSkus`, as the real ERP today). */
  bGradeOpen = false;
  /** The ERP's hold rule (owner answer Q3: 30 days, a warning from day 15). */
  holdDays = 30;
  warnFromDays = 15;
  /** The exchange watch (§2.10.1 rule 5) and the owner's check window (Q4, shown only). */
  exchangeReturnDays = 4;
  private forcedHold: string | null = null;
  private seq = 0;

  constructor(private readonly hooks: V6StockHooks) {}

  private today(): string {
    return dhakaDate(this.hooks.now());
  }

  private nextId(prefix: string): string {
    this.seq++;
    return `${prefix}-${String(this.seq).padStart(5, '0')}`;
  }

  /** Records an event (unique id, never reused) and queues it as a webhook. */
  emit(type: string, data: Record<string, unknown>, opts: { reverses?: string; date?: string } = {}): V6Event {
    const ev: V6Event = { eventId: `evt_${randomBytes(12).toString('hex')}`, type, occurredAt: this.hooks.now().toISOString(), date: opts.date ?? this.today(), ...(opts.reverses ? { reverses: opts.reverses } : {}), data };
    this.events.push(ev);
    this.outbox.push(ev);
    return ev;
  }

  /** The events since the last call (a test signs them as webhooks, or drops them to prove the pull). */
  takeEvents(): V6Event[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  private book(kind: LedgerRow['kind'], amount: number, ref: { externalOrderId?: string | null; reference?: string | null; eventId?: string | null; date?: string }): void {
    if (!amount) return;
    this.ledger.push({ id: this.nextId('ST'), date: ref.date ?? this.today(), kind, amount, externalOrderId: ref.externalOrderId ?? null, reference: ref.reference ?? null, eventId: ref.eventId ?? null });
  }

  private record(externalOrderId: string, consignmentId: string | null, patch: Partial<ReturnRecord>, eventId?: string): void {
    const key = `${externalOrderId}|${consignmentId ?? ''}`;
    const cur = this.returnRecords.get(key) ?? { key, externalOrderId, consignmentId, returnListId: null, stage: 'DELIVERY_RESULT', handedBackAt: null, updatedAt: this.hooks.now(), eventIds: [] };
    Object.assign(cur, patch, { updatedAt: this.hooks.now() });
    if (eventId) cur.eventIds.push(eventId);
    this.returnRecords.set(key, cur);
  }

  private activeTotal(o: V6Order): number {
    return o.lines.filter((l) => l.state !== 'CANCELLED').reduce((s, l) => s + l.shopPrice * l.quantity, 0);
  }

  // ---- the account --------------------------------------------------------------------------------------------------

  balance(upTo?: string): number {
    return this.ledger.filter((r) => !upTo || r.date <= upTo).reduce((s, r) => s + r.amount, 0);
  }

  waitingCheck(): number {
    return this.pieces.filter((p) => p.stage === 'HOLD' || p.stage === 'RETURN_STOCK').filter((p) => !p.exchangeId).reduce((s, p) => s + p.price, 0);
  }

  exchangesAtRisk(): number {
    return [...this.exchanges.values()].filter((x) => !x.billed && ['WAITING_DELIVERY', 'WAITING_RETURN', 'RETURNED_WAITING_CHECK'].includes(x.status)).reduce((s, x) => s + x.lines.reduce((a, l) => a + l.shopPrice, 0), 0);
  }

  holdState(): { onHold: boolean; reason: string | null; lastPaymentAt: string | null; daysSinceLastPayment: number | null; holdsOn: string | null; warnFromDays: number } {
    const payments = this.ledger.filter((r) => r.kind === 'PAYMENT');
    const lastPaymentAt = payments.length ? payments.map((p) => p.date).sort().at(-1)! : null;
    const firstBill = this.ledger.filter((r) => r.kind === 'BILL').map((r) => r.date).sort()[0] ?? null;
    const from = lastPaymentAt ?? firstBill;
    const days = from ? daysBetween(from, this.today()) : null;
    const owes = this.balance() - this.waitingCheck() > 0;
    const holdsOn = from && owes ? addDays(from, this.holdDays) : null;
    const auto = owes && days !== null && days >= this.holdDays;
    const onHold = !!this.forcedHold || auto;
    const reason = this.forcedHold ?? (auto ? `No payment for ${days} days` : null);
    return { onHold, reason, lastPaymentAt, daysSinceLastPayment: lastPaymentAt ? days : null, holdsOn, warnFromDays: this.warnFromDays };
  }

  /** The owner's hold (or the rule's): `account.hold`. */
  hold(reason: string): V6Event {
    this.forcedHold = reason;
    return this.emit('account.hold', { reason, holdsOn: this.today() });
  }

  /** The hold lifted (the owner's PIN in the ERP, or a payment): `account.released`. */
  release(): V6Event {
    this.forcedHold = null;
    return this.emit('account.released', { releasedAt: this.today() });
  }

  /** The ERP's Accounts team records money received from Retail: `payment.recorded`. */
  recordPayment(amount: number, opts: { reference?: string; date?: string } = {}): V6Event {
    const ev = this.emit('payment.recorded', { amount, reference: opts.reference ?? null, method: 'BANK' }, { date: opts.date });
    this.book('PAYMENT', -amount, { reference: opts.reference ?? null, eventId: ev.eventId, date: ev.date });
    return ev;
  }

  account(q: Record<string, string>): V6Answer {
    const hold = this.holdState();
    const base = { balance: this.balance(), waitingCheck: this.waitingCheck(), exchangesAtRisk: this.exchangesAtRisk(), hold };
    if (!q.from || !q.to) return ok(200, { ...base, period: null, statement: [] });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from) || !/^\d{4}-\d{2}-\d{2}$/.test(q.to) || q.from > q.to) return err(400, 'INVALID_QUERY', 'from and to are days, from first');
    const rows = this.ledger.filter((r) => r.date >= q.from! && r.date <= q.to!);
    const sum = (k: LedgerRow['kind']) => rows.filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0);
    const openingBalance = this.balance(addDays(q.from, -1));
    const ordersTotal = sum('BILL');
    const exchangesTotal = sum('EXCHANGE');
    const otherCharges = sum('OTHER');
    const creditsTotal = -sum('CREDIT');
    const paymentsTotal = -sum('PAYMENT');
    return ok(200, {
      ...base,
      period: { from: q.from, to: q.to, openingBalance, ordersTotal, exchangesTotal, otherCharges, creditsTotal, paymentsTotal, closingBalance: openingBalance + ordersTotal + exchangesTotal + otherCharges - creditsTotal - paymentsTotal },
      statement: rows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, amount: r.amount, externalOrderId: r.externalOrderId, reference: r.reference, eventId: r.eventId })),
    });
  }

  /** The one-time switch transfer of old unpaid delivered orders, at the buying price (§3, owner answer ক). */
  switchTransfer(amount: number, reference: string, date?: string): void {
    this.book('OTHER', amount, { reference, date });
  }

  // ---- PR 619 · the switch-over (§3) ------------------------------------------------------------------------------------

  /** What `GET /switch-over` answers: nothing until the ERP announces a date, the final list once it has moved them. */
  switchOverState: {
    status: 'NONE' | 'ANNOUNCED' | 'DONE';
    switchDate: string | null;
    announcedAt: string | null;
    openingBalance: number | null;
    transfer: { amount: number; reference: string } | null;
    orders: { externalOrderId: string; kind: 'NOT_OUT' | 'OUT' | 'ADVANCE' | 'UNPAID'; amount: number; consignmentId: string | null; lines: { lineId: string; sku: string; quantity: number; shopPrice: number }[] }[];
  } = { status: 'NONE', switchDate: null, announcedAt: null, openingBalance: null, transfer: null, orders: [] };

  /** The ERP announces the store's switch date (step 1 of §3). */
  announceSwitch(switchDate: string): void {
    this.switchOverState = { ...this.switchOverState, status: 'ANNOUNCED', switchDate, announcedAt: this.hooks.now().toISOString() };
  }

  /**
   * The ERP's own part on the switch date (§3.3): the open old orders move to the new rules. A NOT_OUT order becomes a
   * v6 order billed when its parcel leaves; an OUT order is billed now at the shop prices of its lines; the ADVANCE and
   * UNPAID amounts are one transfer (an `otherCharges` row) on the switch date; the retired v5 calls answer 410 from now.
   */
  completeSwitch(moved: { externalOrderId: string; kind: 'NOT_OUT' | 'OUT' | 'ADVANCE' | 'UNPAID'; amount?: number; consignmentId?: string | null; lines?: { lineId: string; sku: string; quantity?: number; shopPrice: number }[] }[]): void {
    const date = this.switchOverState.switchDate ?? this.today();
    const openingBalance = this.balance(addDays(date, -1));
    const warehouse = this.hooks.warehouses()[0] ?? 'SAMPLE-WH';
    const orders: (typeof this.switchOverState)['orders'] = [];
    let transfer = 0;
    for (const m of moved) {
      const lines = (m.lines ?? []).map((l) => ({ lineId: l.lineId, sku: l.sku, quantity: l.quantity ?? 1, shopPrice: l.shopPrice }));
      const total = lines.reduce((s, l) => s + l.shopPrice * l.quantity, 0);
      const amount = m.kind === 'OUT' || m.kind === 'NOT_OUT' ? total : Math.abs(m.amount ?? 0);
      if ((m.kind === 'OUT' || m.kind === 'NOT_OUT') && !this.orders.has(m.externalOrderId)) {
        const o: V6Order = {
          erpOrderId: this.nextId('SAMPLE-SO'),
          externalOrderId: m.externalOrderId,
          status: 'CONFIRMED',
          lines: lines.map((l) => ({ lineId: l.lineId, sku: l.sku, quantity: l.quantity, grade: 'A', customerPrice: l.shopPrice, shopPrice: l.shopPrice, fromReturnStock: false, warehouseId: warehouse, state: 'ACTIVE', out: m.kind === 'OUT', delivered: false, returning: false })),
          deliveryCharge: 0, // hardcode-ok: the practice ERP: a moved order carries no delivery charge
          advancePaid: 0,
          billedAt: null,
          billedAmount: 0,
          consignmentId: m.consignmentId ?? null,
          exchangeId: null,
          delivery: null,
          handedBack: false,
        };
        this.orders.set(m.externalOrderId, o);
        if (m.kind === 'OUT') {
          o.billedAt = date;
          o.billedAmount = total;
          this.book('BILL', total, { externalOrderId: o.externalOrderId, reference: o.consignmentId, date });
        }
      }
      if (m.kind === 'ADVANCE') transfer -= amount;
      if (m.kind === 'UNPAID') transfer += amount;
      orders.push({ externalOrderId: m.externalOrderId, kind: m.kind, amount: m.kind === 'ADVANCE' ? -amount : amount, consignmentId: m.consignmentId ?? null, lines });
    }
    const reference = `SWITCH-${date}`;
    if (transfer) this.switchTransfer(transfer, reference, date);
    this.switched = true;
    this.switchOverState = { status: 'DONE', switchDate: date, announcedAt: this.switchOverState.announcedAt ?? this.hooks.now().toISOString(), openingBalance, transfer: transfer ? { amount: transfer, reference } : null, orders };
  }

  switchOverAnswer(): V6Answer {
    return ok(200, this.switchOverState);
  }

  // ---- orders ---------------------------------------------------------------------------------------------------------

  /** Main stock first, then Return stock, from the first warehouse that has the pieces. */
  private pick(sku: string, qty: number): { warehouseId: string; fromReturn: boolean } | null {
    for (const w of this.hooks.warehouses()) {
      const c = this.hooks.cell(sku, w);
      if (c && c.main >= qty) return { warehouseId: w, fromReturn: false };
    }
    for (const w of this.hooks.warehouses()) {
      const c = this.hooks.cell(sku, w);
      if (c && c.ret >= qty) return { warehouseId: w, fromReturn: true };
    }
    return null;
  }

  private available(sku: string): number {
    return this.hooks.warehouses().reduce((s, w) => {
      const c = this.hooks.cell(sku, w);
      return s + (c ? c.main + c.ret : 0);
    }, 0);
  }

  private take(sku: string, qty: number, p: { warehouseId: string; fromReturn: boolean }): void {
    if (p.fromReturn) {
      this.hooks.adjust(sku, p.warehouseId, { ret: -qty, onHand: qty, reserved: qty });
      // The unchecked returned piece goes out on a new order: it is checked at packing.
      const piece = this.pieces.find((x) => x.sku === sku && x.stage === 'RETURN_STOCK' && x.warehouseId === p.warehouseId);
      if (piece) piece.stage = 'SOLD_AGAIN';
    } else this.hooks.adjust(sku, p.warehouseId, { reserved: qty });
  }

  isV6Order(b: Record<string, unknown>): boolean {
    const items = Array.isArray(b.items) ? b.items : [];
    return 'deliveryCharge' in b || 'exchange' in b || items.some((i) => isObj(i) && 'lineId' in i);
  }

  createOrder(b: Record<string, unknown>): V6Answer {
    const ext = typeof b.externalOrderId === 'string' ? b.externalOrderId : '';
    const items = (Array.isArray(b.items) ? b.items : []).filter(isObj);
    if (!ext || !items.length) return err(400, 'INVALID_ORDER', 'an order needs externalOrderId and items');
    for (const i of items) {
      if (typeof i.lineId !== 'string' || typeof i.sku !== 'string' || !Number.isInteger(i.quantity) || (i.quantity as number) < 1) return err(400, 'INVALID_ORDER', 'every line needs lineId, sku and quantity');
      if (i.customerPrice !== undefined && !Number.isInteger(i.customerPrice)) return err(400, 'INVALID_ORDER', 'customerPrice is whole taka');
    }
    if (this.orders.has(ext)) return err(409, 'DUPLICATE_EXTERNAL_ORDER', 'this externalOrderId is already an order', [this.orders.get(ext)!.erpOrderId]);
    const bGrade = [...new Set(items.filter((i) => i.grade === 'B').map((i) => i.sku as string))];
    if (bGrade.length && !this.bGradeOpen) return err(422, 'VALIDATION', 'B-grade order lines are not open yet', { bGradeSkus: bGrade });
    const ex = isObj(b.exchange) ? b.exchange : null;
    let of: V6Order | null = null;
    if (ex) {
      of = this.orders.get(String(ex.ofExternalOrderId ?? '')) ?? null;
      if (!of) return err(404, 'ORDER_NOT_FOUND', 'the old order is not this shop\'s');
      for (const i of items) {
        const old = of.lines.find((l) => l.lineId === i.replacesLineId);
        if (!old || !old.delivered || old.returning) return err(409, 'LINE_NOT_DELIVERED', 'the line was never delivered or has come back', [String(i.replacesLineId ?? '')]);
        const open = [...this.exchanges.values()].some((x) => !['SETTLED', 'BILLED', 'CREDITED', 'CANCELLED'].includes(x.status) && x.lines.some((l) => l.replacesLineId === old.lineId));
        if (open) return err(409, 'EXCHANGE_OPEN', 'that line already has an exchange that is not settled', [old.lineId]);
        if ((i.quantity as number) > old.quantity) return err(400, 'INVALID_ORDER', 'more than the customer still has on that line');
      }
    } else {
      // Owner answer Q8: exchange orders still go through a hold; new sales do not.
      const h = this.holdState();
      if (h.onHold) return err(409, 'ACCOUNT_ON_HOLD', 'orders to the ERP are on hold', { reason: h.reason, holdsOn: h.holdsOn });
    }
    const noPrice = [...new Set(items.map((i) => i.sku as string).filter((sku) => this.hooks.variant(sku)?.shopPrice == null))];
    if (noPrice.length) return err(409, 'NO_SHOP_PRICE', 'a SKU has no shop price yet', { skus: noPrice });
    const want = new Map<string, number>();
    for (const i of items) want.set(i.sku as string, (want.get(i.sku as string) ?? 0) + (i.quantity as number));
    const short = [...want].filter(([sku, n]) => this.available(sku) < n).map(([sku, wanted]) => ({ sku, wanted, available: this.available(sku) }));
    if (short.length) return err(409, 'INSUFFICIENT_STOCK', 'not enough stock', { shortSkus: short });
    const lines: V6Line[] = [];
    for (const i of items) {
      const sku = i.sku as string;
      const qty = i.quantity as number;
      const p = this.pick(sku, qty);
      if (!p) return err(409, 'INSUFFICIENT_STOCK', 'not enough stock in one warehouse', { shortSkus: [{ sku, wanted: qty, available: this.available(sku) }] });
      this.take(sku, qty, p);
      const v = this.hooks.variant(sku)!;
      const old = of?.lines.find((l) => l.lineId === i.replacesLineId);
      lines.push({
        lineId: i.lineId as string,
        sku,
        quantity: qty,
        grade: i.grade === 'B' ? 'B' : 'A',
        customerPrice: intOf(i.customerPrice),
        shopPrice: v.shopPrice!,
        fromReturnStock: p.fromReturn,
        warehouseId: p.warehouseId,
        state: 'ACTIVE',
        out: false,
        delivered: false,
        returning: false,
        ...(old ? { replacesLineId: old.lineId, replacedShopPrice: old.shopPrice } : {}),
      });
    }
    const order: V6Order = { erpOrderId: this.nextId('SAMPLE-SO'), externalOrderId: ext, status: 'CONFIRMED', lines, deliveryCharge: intOf(b.deliveryCharge), advancePaid: intOf(b.advancePaid), billedAt: null, billedAmount: 0, consignmentId: null, exchangeId: null, delivery: null, handedBack: false };
    if (of) {
      const x: V6Exchange = {
        exchangeId: this.nextId('EXG'),
        externalOrderId: ext,
        ofExternalOrderId: of.externalOrderId,
        status: 'WAITING_DELIVERY',
        lines: lines.map((l) => ({ lineId: l.lineId, replacesLineId: l.replacesLineId!, sku: l.sku, shopPrice: l.shopPrice, replacedShopPrice: l.replacedShopPrice! })),
        deliveredAt: null,
        deadline: null,
        billed: false,
        updatedAt: this.hooks.now().toISOString(),
        eventIds: [],
      };
      this.exchanges.set(x.exchangeId, x);
      order.exchangeId = x.exchangeId;
    }
    this.orders.set(ext, order);
    return ok(201, this.orderAnswer(order));
  }

  orderAnswer(o: V6Order): Record<string, unknown> {
    const x = o.exchangeId ? this.exchanges.get(o.exchangeId) : null;
    return {
      erpOrderId: o.erpOrderId,
      externalOrderId: o.externalOrderId,
      status: o.status,
      erpTotal: o.exchangeId ? 0 : this.activeTotal(o),
      billedAt: o.billedAt,
      lines: o.lines.map((l) => ({ lineId: l.lineId, sku: l.sku, quantity: l.quantity, grade: l.grade, shopPrice: l.shopPrice, fromReturnStock: l.fromReturnStock, state: l.state, ...(l.replacesLineId ? { replacesLineId: l.replacesLineId, replacedShopPrice: l.replacedShopPrice } : {}) })),
      ...(x ? { exchangeId: x.exchangeId, atRisk: x.lines.reduce((s, l) => s + l.shopPrice, 0) } : {}),
    };
  }

  getOrder(ext: string): V6Answer {
    const o = this.orders.get(ext);
    return o ? ok(200, this.orderAnswer(o)) : err(404, 'ORDER_NOT_FOUND', 'no such order');
  }

  /** Bills an order once (never an exchange order, never a cancelled one). */
  private bill(o: V6Order): void {
    if (o.billedAt || o.exchangeId || o.status === 'CANCELLED') return;
    o.billedAt = this.today();
    o.billedAmount = this.activeTotal(o);
    this.book('BILL', o.billedAmount, { externalOrderId: o.externalOrderId, reference: o.consignmentId });
  }

  shipment(b: Record<string, unknown>): V6Answer {
    const o = this.orders.get(String(b.externalOrderId ?? ''));
    if (!o) return err(404, 'ORDER_NOT_FOUND', 'no such order');
    if (o.status === 'CANCELLED') return err(409, 'ORDER_CANCELLED', 'a cancelled order cannot leave');
    if (o.lines.some((l) => l.state === 'SHORT' || l.state === 'WAITING')) return err(409, 'LINE_WAITING', 'a line of this order is waiting');
    o.consignmentId = typeof b.consignmentId === 'string' ? b.consignmentId : o.consignmentId;
    this.bill(o);
    return ok(201, { externalOrderId: o.externalOrderId, consignmentId: o.consignmentId, billedAt: o.billedAt, erpTotal: o.exchangeId ? 0 : this.activeTotal(o) });
  }

  status(o: V6Order, status: string): V6Answer | null {
    if (this.switched && (status === 'DELIVERED' || status === 'RETURNED')) return err(410, 'USE_DELIVERY_RESULT', 'use PUT /orders/{id}/delivery');
    if (status === 'CANCELLED' && !o.billedAt) {
      for (const l of o.lines) if (l.state !== 'CANCELLED' && !l.out) this.hooks.adjust(l.sku, l.warehouseId, { reserved: -l.quantity });
      o.status = 'CANCELLED';
      return ok(200, { erpOrderId: o.erpOrderId, externalOrderId: o.externalOrderId, status: o.status });
    }
    return null;
  }

  delivery(ext: string, b: Record<string, unknown>): V6Answer {
    const o = this.orders.get(ext);
    if (!o) return err(404, 'ORDER_NOT_FOUND', 'no such order');
    const status = b.status;
    if (status !== 'DELIVERED' && status !== 'PARTIAL' && status !== 'RETURNED') return err(400, 'INVALID_STATUS', 'status is DELIVERED, PARTIAL or RETURNED');
    if (o.handedBack) return err(409, 'ALREADY_HANDED_BACK', 'the parcel is already back');
    const collected = intOf(b.collected);
    const live = o.lines.filter((l) => l.state === 'ACTIVE');
    // An order that reaches a delivery result with no shipment is billed now (§2.3).
    this.bill(o);
    for (const l of live) {
      if (!l.out) this.hooks.adjust(l.sku, l.warehouseId, { onHand: -l.quantity, reserved: -l.quantity });
      l.out = true;
    }
    let identification: ErpIdentification = 'GREEN';
    let kept: string[] = [];
    if (status === 'DELIVERED') kept = live.map((l) => l.lineId);
    else if (status === 'PARTIAL') {
      const mark = isObj(b.mark) ? b.mark : null;
      const marked = mark && Array.isArray(mark.keptLines) ? (mark.keptLines as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      if (marked.length) kept = marked.filter((id) => live.some((l) => l.lineId === id));
      else {
        const r = identifyPartial(live, collected, { advancePaid: o.advancePaid, discount: intOf(mark?.discountGiven) });
        identification = r.identification;
        kept = r.keptLines;
      }
    }
    for (const l of live) {
      l.delivered = kept.includes(l.lineId);
      l.returning = !l.delivered && identification !== 'ORANGE';
    }
    if (identification === 'ORANGE') for (const l of live) l.returning = true;
    o.delivery = { status, collected, identification, keptLines: kept, at: typeof b.at === 'string' ? b.at : this.hooks.now().toISOString() };
    o.status = status === 'DELIVERED' ? 'DELIVERED' : status === 'RETURNED' ? 'RETURNED' : 'PARTIAL';
    if (typeof b.consignmentId === 'string') o.consignmentId = b.consignmentId;
    const returnedLines = live.filter((l) => !kept.includes(l.lineId)).map((l) => l.lineId);
    const ev = this.emit('delivery.identified', { externalOrderId: ext, status, identification, keptLines: kept, returnedLines });
    if (status !== 'DELIVERED') this.record(ext, o.consignmentId, { stage: 'DELIVERY_RESULT' }, ev.eventId);
    // An exchange parcel: delivered starts the watch; refused cancels the exchange (§2.10.3).
    const x = o.exchangeId ? this.exchanges.get(o.exchangeId) : null;
    if (x) {
      if (status === 'RETURNED' || (status === 'PARTIAL' && !kept.length)) {
        x.status = 'CANCELLED';
        const c = this.emit('exchange.cancelled', { exchangeId: x.exchangeId, externalOrderId: ext, amount: 0 });
        x.eventIds.push(c.eventId);
      } else {
        x.status = 'WAITING_RETURN';
        x.deliveredAt = this.today();
        x.deadline = addDays(x.deliveredAt, this.exchangeReturnDays);
        x.lines = x.lines.filter((l) => kept.includes(l.lineId));
      }
      x.updatedAt = this.hooks.now().toISOString();
    }
    return ok(200, { externalOrderId: ext, status, identification: status === 'PARTIAL' ? identification : null, keptLines: kept, returnedLines, billedAt: o.billedAt });
  }

  lineDecision(ext: string, lineId: string, b: Record<string, unknown>): V6Answer {
    const o = this.orders.get(ext);
    if (!o) return err(404, 'ORDER_NOT_FOUND', 'no such order');
    const l = o.lines.find((x) => x.lineId === lineId);
    if (!l) return err(404, 'LINE_NOT_FOUND', 'no such line');
    if (l.out) return err(409, 'LINE_GONE', 'the line already left');
    if (b.action === 'WAIT') {
      if (l.state === 'SHORT') l.state = 'WAITING';
      this.fillWaiting();
    } else if (b.action === 'REPLACE') {
      const sku = typeof b.sku === 'string' ? b.sku : '';
      const v = this.hooks.variant(sku);
      if (!v) return err(404, 'SKU_NOT_FOUND', 'no such SKU', [sku]);
      if (b.grade === 'B' && !this.bGradeOpen) return err(422, 'VALIDATION', 'B-grade order lines are not open yet', { bGradeSkus: [sku] });
      if (v.shopPrice == null) return err(409, 'NO_SHOP_PRICE', 'a SKU has no shop price yet', { skus: [sku] });
      const p = this.pick(sku, l.quantity);
      if (!p) return err(409, 'INSUFFICIENT_STOCK', 'not enough stock', { shortSkus: [{ sku, wanted: l.quantity, available: this.available(sku) }] });
      if (l.state === 'ACTIVE') this.hooks.adjust(l.sku, l.warehouseId, { reserved: -l.quantity });
      this.take(sku, l.quantity, p);
      Object.assign(l, { sku, grade: b.grade === 'B' ? 'B' : 'A', shopPrice: v.shopPrice, fromReturnStock: p.fromReturn, warehouseId: p.warehouseId, state: 'ACTIVE' as LineState });
    } else if (b.action === 'CANCEL') {
      if (l.state === 'ACTIVE') this.hooks.adjust(l.sku, l.warehouseId, { reserved: -l.quantity });
      l.state = 'CANCELLED';
    } else return err(400, 'INVALID_ACTION', 'action is WAIT, REPLACE or CANCEL');
    return ok(200, this.orderAnswer(o));
  }

  /** The owner fails a Return-stock piece at packing (§2.3): declined once, its line waits. */
  failPackingCheck(ext: string, lineId: string): V6Event[] {
    const o = this.orders.get(ext);
    const l = o?.lines.find((x) => x.lineId === lineId);
    if (!o || !l || !l.fromReturnStock) throw new Error(`no return-stock line ${lineId} on ${ext}`);
    const out: V6Event[] = [];
    const piece = this.pieces.find((p) => p.sku === l.sku && p.stage === 'SOLD_AGAIN');
    if (piece) {
      piece.stage = 'DECLINED';
      piece.reason = 'STAIN_OR_DAMAGE';
      piece.decidedAt = this.today();
      out.push(this.decisionEvent(piece, 'DECLINED', 0));
    }
    this.hooks.adjust(l.sku, l.warehouseId, { onHand: -l.quantity, reserved: -l.quantity });
    l.state = 'SHORT';
    out.push(this.emit('order.line.short', { externalOrderId: ext, lineId, sku: l.sku, reason: 'RETURN_PIECE_FAILED_CHECK' }));
    return out;
  }

  /** The owner passes a Return-stock piece at packing: the earlier return is approved (`APPROVED_AT_PACKING`). */
  passPackingCheck(sku: string): V6Event | null {
    const piece = this.pieces.find((p) => p.sku === sku && p.stage === 'SOLD_AGAIN');
    if (!piece) return null;
    piece.stage = 'APPROVED';
    piece.decidedAt = this.today();
    const credit = piece.exchangeId ? 0 : piece.price;
    const ev = this.decisionEvent(piece, 'APPROVED_AT_PACKING', credit);
    this.book('CREDIT', -credit, { externalOrderId: piece.externalOrderId, reference: piece.lineId, eventId: ev.eventId });
    return ev;
  }

  /** Lines waiting for stock are filled when it is there (`order.line.filled`). */
  fillWaiting(): V6Event[] {
    const out: V6Event[] = [];
    for (const o of this.orders.values()) {
      for (const l of o.lines) {
        if (l.state !== 'WAITING') continue;
        const p = this.pick(l.sku, l.quantity);
        if (!p) continue;
        this.take(l.sku, l.quantity, p);
        Object.assign(l, { state: 'ACTIVE' as LineState, fromReturnStock: p.fromReturn, warehouseId: p.warehouseId });
        out.push(this.emit('order.line.filled', { externalOrderId: o.externalOrderId, lineId: l.lineId, sku: l.sku }));
      }
    }
    return out;
  }

  // ---- returns ----------------------------------------------------------------------------------------------------------

  returnList(b: Record<string, unknown>): V6Answer {
    const id = typeof b.returnListId === 'string' ? b.returnListId : '';
    const parcels = (Array.isArray(b.parcels) ? b.parcels : []).filter(isObj);
    const handedBackAt = typeof b.handedBackAt === 'string' ? b.handedBackAt.slice(0, 10) : '';
    if (!id || !parcels.length || !/^\d{4}-\d{2}-\d{2}$/.test(handedBackAt)) return err(400, 'INVALID_RETURN_LIST', 'a return list needs returnListId, handedBackAt and parcels');
    const courier = typeof b.courier === 'string' ? b.courier : 'HAND';
    const rows: unknown[] = [];
    for (const p of parcels) {
      const ext = String(p.externalOrderId ?? '');
      const consignmentId = typeof p.consignmentId === 'string' ? p.consignmentId : null;
      const o = this.orders.get(ext);
      const row = (result: string, reason: string | null, pieces: V6Piece[] = [], expected: number | null = null) => rows.push({ consignmentId, externalOrderId: ext, result, reason, pieces: pieces.map((x) => ({ lineId: x.lineId, sku: x.sku })), expectedCount: expected });
      if (!o) {
        row('REFUSED', 'NOT_OUR_ORDER');
        continue;
      }
      if (o.handedBack) {
        row('REFUSED', 'ALREADY_HANDED_BACK');
        continue;
      }
      // An exchange parcel names the exchange order: the old pieces come back on it (§2.10.3).
      const x = o.exchangeId ? this.exchanges.get(o.exchangeId) : null;
      let back: { lineId: string; sku: string; price: number; warehouseId: string; ext: string }[] = [];
      if (x && x.status !== 'CANCELLED') {
        const of = this.orders.get(x.ofExternalOrderId)!;
        back = x.lines.map((l) => {
          const old = of.lines.find((ol) => ol.lineId === l.replacesLineId)!;
          old.returning = true;
          return { lineId: old.lineId, sku: old.sku, price: old.shopPrice, warehouseId: old.warehouseId, ext: of.externalOrderId };
        });
      } else {
        back = o.lines.filter((l) => l.returning).map((l) => ({ lineId: l.lineId, sku: l.sku, price: l.shopPrice, warehouseId: l.warehouseId, ext }));
      }
      if (!back.length) {
        row('REFUSED', 'NOT_RETURNED');
        continue;
      }
      o.handedBack = true;
      const hold = !x && o.delivery?.identification === 'ORANGE';
      const made = back.map((l) => {
        const piece: V6Piece = { id: this.nextId('PC'), externalOrderId: l.ext, lineId: l.lineId, sku: l.sku, warehouseId: l.warehouseId, price: l.price, stage: hold ? 'HOLD' : 'RETURN_STOCK', returnListId: id, consignmentId, courier, handedBackAt, exchangeId: x?.exchangeId ?? null, decidedAt: null, reason: null, decisionEventId: null };
        this.pieces.push(piece);
        if (!hold && !x) this.hooks.adjust(l.sku, l.warehouseId, { ret: 1 });
        return piece;
      });
      if (x) {
        x.status = 'RETURNED_WAITING_CHECK';
        x.updatedAt = this.hooks.now().toISOString();
      }
      this.record(ext, consignmentId, { stage: 'HANDED_BACK', returnListId: id, handedBackAt });
      row(hold ? 'HOLD' : 'IN_RETURN_STOCK', null, hold ? [] : made, back.length);
    }
    this.returnLists.add(id);
    return ok(201, { returnListId: id, parcels: rows });
  }

  /** The owner ticks a Hold parcel: `return.parcel.resolved` with the pieces that came back, or PARCEL_MISSING. */
  resolveHold(ext: string, lineIds: string[] | 'PARCEL_MISSING'): V6Event {
    const held = this.pieces.filter((p) => p.externalOrderId === ext && p.stage === 'HOLD');
    if (!held.length) throw new Error(`no held parcel for ${ext}`);
    const o = this.orders.get(ext)!;
    if (lineIds === 'PARCEL_MISSING') {
      for (const p of held) {
        p.stage = 'DECLINED';
        p.reason = 'PARCEL_MISSING';
        p.decidedAt = this.today();
      }
    } else {
      for (const p of held) {
        if (lineIds.includes(p.lineId)) {
          p.stage = 'RETURN_STOCK';
          this.hooks.adjust(p.sku, p.warehouseId, { ret: 1 });
        } else {
          // The customer kept it after all: the line was delivered.
          p.stage = 'DECLINED';
          p.reason = 'NOT_RETURNED';
          const l = o.lines.find((x) => x.lineId === p.lineId);
          if (l) Object.assign(l, { delivered: true, returning: false });
        }
      }
    }
    const back = lineIds === 'PARCEL_MISSING' ? [] : held.filter((p) => lineIds.includes(p.lineId));
    const ev = this.emit('return.parcel.resolved', { externalOrderId: ext, consignmentId: held[0]!.consignmentId, returnListId: held[0]!.returnListId, result: lineIds === 'PARCEL_MISSING' ? 'PARCEL_MISSING' : 'RESOLVED', pieces: back.map((p) => ({ lineId: p.lineId, sku: p.sku })) });
    this.record(ext, held[0]!.consignmentId, { stage: 'HOLD_RESOLVED' }, ev.eventId);
    return ev;
  }

  private decisionEvent(p: V6Piece, decision: string, credit: number, reverses?: string): V6Event {
    const ev = this.emit(
      'return.piece.decided',
      { externalOrderId: p.externalOrderId, lineId: p.lineId, sku: p.sku, decision, ...(p.reason && decision === 'DECLINED' ? { reason: p.reason } : {}), credit, exchangeId: p.exchangeId, returnListId: p.returnListId, consignmentId: p.consignmentId, courier: p.courier, handedBackAt: p.handedBackAt, decidedAt: p.decidedAt },
      reverses ? { reverses } : {},
    );
    p.decisionEventId = ev.eventId;
    this.record(p.externalOrderId, p.consignmentId, { stage: 'CHECKED' }, ev.eventId);
    return ev;
  }

  /** The owner checks a returned piece in the ERP (§2.5.4). Approved: credit at the price paid; declined: no money. */
  decidePiece(ext: string, lineId: string, decision: 'APPROVED' | 'DECLINED', reason = 'B_GRADE'): V6Event[] {
    const p = this.pieces.find((x) => x.externalOrderId === ext && x.lineId === lineId && (x.stage === 'RETURN_STOCK' || x.stage === 'HOLD'));
    if (!p) throw new Error(`no piece ${lineId} of ${ext} waiting for a check`);
    const out: V6Event[] = [];
    p.decidedAt = this.today();
    if (p.stage === 'RETURN_STOCK' && !p.exchangeId) this.hooks.adjust(p.sku, p.warehouseId, { ret: -1, ...(decision === 'APPROVED' ? { onHand: 1 } : {}) });
    else if (decision === 'APPROVED' && p.exchangeId) this.hooks.adjust(p.sku, p.warehouseId, { onHand: 1 });
    p.stage = decision;
    p.reason = decision === 'DECLINED' ? reason : null;
    // A piece returned on an exchange carries credit 0: its money comes only through the exchange.* events.
    const credit = decision !== 'APPROVED' || p.exchangeId ? 0 : p.price;
    const ev = this.decisionEvent(p, decision, credit);
    out.push(ev);
    if (credit) this.book('CREDIT', -credit, { externalOrderId: ext, reference: lineId, eventId: ev.eventId });
    if (p.exchangeId) out.push(...this.settleExchange(p.exchangeId, decision, p));
    return out;
  }

  /** The owner reverses a decision: a new event with `reverses`, the old effect undone and the new one applied. */
  reverseDecision(eventId: string, decision: 'APPROVED' | 'DECLINED', reason = 'OTHER'): V6Event {
    const p = this.pieces.find((x) => x.decisionEventId === eventId);
    if (!p) throw new Error(`no decision ${eventId}`);
    const was = this.events.find((e) => e.eventId === eventId)!;
    const oldCredit = intOf(was.data.credit);
    if (oldCredit) this.book('CREDIT', oldCredit, { externalOrderId: p.externalOrderId, reference: p.lineId });
    p.stage = decision;
    p.reason = decision === 'DECLINED' ? reason : null;
    const credit = decision !== 'APPROVED' || p.exchangeId ? 0 : p.price;
    const ev = this.decisionEvent(p, decision, credit, eventId);
    if (credit) this.book('CREDIT', -credit, { externalOrderId: p.externalOrderId, reference: p.lineId, eventId: ev.eventId });
    return ev;
  }

  // ---- exchanges --------------------------------------------------------------------------------------------------------

  private settleExchange(exchangeId: string, decision: 'APPROVED' | 'DECLINED', piece: V6Piece): V6Event[] {
    const x = this.exchanges.get(exchangeId)!;
    const line = x.lines.find((l) => l.replacesLineId === piece.lineId);
    if (!line) return [];
    const out: V6Event[] = [];
    if (x.billed) {
      // Back after the bill: approved → the old piece is credited at the price paid; declined → the bill stands.
      if (decision === 'APPROVED') {
        const ev = this.emit('exchange.credited', { exchangeId, externalOrderId: x.externalOrderId, amount: line.replacedShopPrice });
        this.book('EXCHANGE', -line.replacedShopPrice, { externalOrderId: x.externalOrderId, reference: exchangeId, eventId: ev.eventId });
        x.status = 'CREDITED';
        x.eventIds.push(ev.eventId);
        out.push(ev);
      }
    } else if (decision === 'APPROVED') {
      const diff = line.shopPrice - line.replacedShopPrice;
      const kind = diff > 0 ? 'EXTRA' : diff < 0 ? 'ADJUSTMENT' : 'EVEN';
      const ev = this.emit('exchange.settled', { exchangeId, externalOrderId: x.externalOrderId, kind, amount: Math.abs(diff) });
      this.book('EXCHANGE', diff, { externalOrderId: x.externalOrderId, reference: exchangeId, eventId: ev.eventId });
      x.status = 'SETTLED';
      x.eventIds.push(ev.eventId);
      out.push(ev);
    } else {
      const ev = this.emit('exchange.billed', { exchangeId, externalOrderId: x.externalOrderId, reason: 'OLD_PIECE_DECLINED', amount: line.shopPrice });
      this.book('EXCHANGE', line.shopPrice, { externalOrderId: x.externalOrderId, reference: exchangeId, eventId: ev.eventId });
      x.status = 'BILLED';
      x.billed = true;
      x.eventIds.push(ev.eventId);
      out.push(ev);
    }
    x.updatedAt = this.hooks.now().toISOString();
    return out;
  }

  lateReturn(exchangeId: string, b: Record<string, unknown>): V6Answer {
    const x = this.exchanges.get(exchangeId);
    if (!x) return err(404, 'EXCHANGE_NOT_FOUND', 'no such exchange');
    const handedBackAt = typeof b.handedBackAt === 'string' ? b.handedBackAt.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(handedBackAt)) return err(400, 'INVALID_LATE_RETURN', 'handedBackAt is a day');
    const of = this.orders.get(x.ofExternalOrderId)!;
    for (const l of x.lines) {
      const old = of.lines.find((ol) => ol.lineId === l.replacesLineId)!;
      this.pieces.push({ id: this.nextId('PC'), externalOrderId: of.externalOrderId, lineId: old.lineId, sku: old.sku, warehouseId: old.warehouseId, price: old.shopPrice, stage: 'HOLD', returnListId: typeof b.returnListId === 'string' ? b.returnListId : null, consignmentId: typeof b.consignmentId === 'string' ? b.consignmentId : null, courier: typeof b.courier === 'string' ? b.courier : null, handedBackAt, exchangeId, decidedAt: null, reason: null, decisionEventId: null });
    }
    if (!x.billed) x.status = 'RETURNED_WAITING_CHECK';
    x.updatedAt = this.hooks.now().toISOString();
    return ok(201, { exchangeId, result: 'HOLD' });
  }

  /** The ERP's night (01:00): exchanges past their deadline are billed (`exchange.billed`, DEADLINE_PASSED). */
  runNight(): V6Event[] {
    const out: V6Event[] = [];
    const today = this.today();
    for (const x of this.exchanges.values()) {
      if (x.status !== 'WAITING_RETURN' || !x.deadline || today <= x.deadline) continue;
      for (const l of x.lines) {
        const ev = this.emit('exchange.billed', { exchangeId: x.exchangeId, externalOrderId: x.externalOrderId, reason: 'DEADLINE_PASSED', amount: l.shopPrice });
        this.book('EXCHANGE', l.shopPrice, { externalOrderId: x.externalOrderId, reference: x.exchangeId, eventId: ev.eventId });
        x.eventIds.push(ev.eventId);
        out.push(ev);
      }
      x.billed = true;
      x.status = 'BILLED';
      x.updatedAt = this.hooks.now().toISOString();
    }
    return out;
  }

  exchangeView(x: V6Exchange): Record<string, unknown> {
    return {
      exchangeId: x.exchangeId,
      externalOrderId: x.externalOrderId,
      ofExternalOrderId: x.ofExternalOrderId,
      status: x.status,
      lines: x.lines,
      atRisk: x.billed || ['SETTLED', 'CREDITED', 'CANCELLED'].includes(x.status) ? 0 : x.lines.reduce((s, l) => s + l.shopPrice, 0),
      deliveredAt: x.deliveredAt,
      deadline: x.deadline,
      updatedAt: x.updatedAt,
      events: this.events.filter((e) => x.eventIds.includes(e.eventId)),
    };
  }

  // ---- prices, summaries, fixed costs, cost of goods --------------------------------------------------------------------

  /** A shop price set or changed by the owner in the ERP: `shop-price.changed`. */
  shopPriceChanged(sku: string, shopPrice: number, previous: number | null): V6Event {
    return this.emit('shop-price.changed', { sku, shopPrice, previous });
  }

  putSummary(date: string, b: Record<string, unknown>): V6Answer {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || b.date !== date) return err(400, 'INVALID_SUMMARY', 'the date in the path and the body must be the same day');
    const incomplete = Array.isArray(b.incomplete) ? b.incomplete : [];
    const allowed = ['orders', 'sales', 'income', 'deliveries', 'goods', 'returnLosses', 'packaging', 'delivery', 'paymentFees', 'accessories', 'ads', 'other', 'customers'];
    const bad = incomplete.filter((k) => typeof k !== 'string' || !allowed.includes(k));
    if (bad.length) return err(400, 'INVALID_SUMMARY', 'an incomplete key is not allowed', bad);
    const cur = this.summaries.get(date) ?? { versions: [], receivedAt: this.hooks.now() };
    cur.versions.push(b);
    cur.receivedAt = this.hooks.now();
    this.summaries.set(date, cur);
    return ok(200, { date, version: cur.versions.length, accepted: true });
  }

  /** The ERP's 01:00 check: the days since `from` it has no summary for (`summary.missing`). */
  missingSummaries(from: string): V6Event | null {
    const dates: string[] = [];
    for (let d = from; d < this.today(); d = addDays(d, 1)) if (!this.summaries.has(d)) dates.push(d);
    return dates.length ? this.emit('summary.missing', { dates }) : null;
  }

  storedSummaries(q: Record<string, string>): V6Answer {
    const from = q.from ?? '0000-01-01';
    const to = q.to ?? '9999-12-31';
    const days = [...this.summaries]
      .filter(([d]) => d >= from && d <= to)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => {
        const last = s.versions.at(-1) as { netProfit?: unknown; incomplete?: unknown };
        return { date, receivedAt: s.receivedAt.toISOString(), versions: s.versions.length, netProfit: typeof last.netProfit === 'number' ? last.netProfit : null, incomplete: Array.isArray(last.incomplete) ? last.incomplete : [] };
      });
    return ok(200, { days });
  }

  putFixedCosts(month: string, b: Record<string, unknown>): V6Answer {
    if (!/^\d{4}-\d{2}$/.test(month) || b.month !== month || !isObj(b.costs)) return err(400, 'INVALID_FIXED_COSTS', 'the month in the path and the body must be the same, with costs');
    const extra = Object.keys(b.costs).filter((k) => !['salary', 'rent', 'utilities', 'other'].includes(k));
    if (extra.length) return err(400, 'INVALID_FIXED_COSTS', 'only salary, rent, utilities and other', extra);
    const list = this.fixedCosts.get(month) ?? [];
    list.push(b);
    this.fixedCosts.set(month, list);
    return ok(200, { month, version: list.length, accepted: true });
  }

  fixedCostMonths(): V6Answer {
    const months = [...this.fixedCosts].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => {
      const last = v.at(-1) as { costs: Record<string, number>; note?: unknown };
      return { month, costs: { salary: last.costs.salary ?? 0, rent: last.costs.rent ?? 0, utilities: last.costs.utilities ?? 0, other: last.costs.other ?? 0 }, note: typeof last.note === 'string' ? last.note : null };
    });
    return ok(200, { months });
  }

  costOfGoods(q: Record<string, string>): V6Answer {
    if (!q.from || !q.to) return err(400, 'INVALID_QUERY', 'from and to are needed');
    const rows = new Map<string, { date: string; sku: string; pieces: number; value: number }>();
    const add = (date: string, sku: string, pieces: number, value: number) => {
      const k = `${date}|${sku}`;
      const r = rows.get(k) ?? { date, sku, pieces: 0, value: 0 };
      r.pieces += pieces;
      r.value += value;
      rows.set(k, r);
    };
    for (const r of this.seededCostOfGoods) add(r.date, r.sku, r.pieces, r.value);
    for (const o of this.orders.values()) {
      if (!o.delivery || o.exchangeId) continue;
      const date = dhakaDate(new Date(o.delivery.at));
      for (const l of o.lines) if (l.delivered) add(date, l.sku, l.quantity, l.shopPrice * l.quantity);
    }
    return ok(200, { rows: [...rows.values()].filter((r) => r.date >= q.from! && r.date <= q.to!).sort((a, b) => a.date.localeCompare(b.date) || a.sku.localeCompare(b.sku)) });
  }

  // ---- pulls ------------------------------------------------------------------------------------------------------------

  returnsSince(since: Date | null): Record<string, unknown>[] {
    return [...this.returnRecords.values()]
      .filter((r) => !since || r.updatedAt.getTime() >= since.getTime())
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.key.localeCompare(b.key))
      .map((r) => ({ externalOrderId: r.externalOrderId, consignmentId: r.consignmentId, returnListId: r.returnListId, stage: r.stage, handedBackAt: r.handedBackAt, updatedAt: r.updatedAt.toISOString(), events: this.events.filter((e) => r.eventIds.includes(e.eventId)) }));
  }

  returnsSummary(date: string): V6Answer {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err(400, 'INVALID_QUERY', 'date is a day');
    const decided = (d: string) => this.pieces.filter((p) => p.decidedAt === date && p.stage === d);
    const approved = decided('APPROVED');
    return ok(200, {
      date,
      handedBack: this.pieces.filter((p) => p.handedBackAt === date).length,
      onHold: this.pieces.filter((p) => p.stage === 'HOLD').length,
      inReturnStock: this.pieces.filter((p) => p.stage === 'RETURN_STOCK').length,
      approved: approved.length,
      approvedCredit: approved.filter((p) => !p.exchangeId).reduce((s, p) => s + p.price, 0),
      declined: decided('DECLINED').length,
      waitingCheck: this.waitingCheck(),
    });
  }

  claims(q: Record<string, string>): V6Answer {
    const from = q.from ?? '0000-01-01';
    const to = q.to ?? '9999-12-31';
    const claims = this.pieces
      .filter((p) => p.stage === 'DECLINED' && ['PARCEL_MISSING', 'PIECE_MISSING', 'STAIN_OR_DAMAGE'].includes(p.reason ?? '') && p.decidedAt && p.decidedAt >= from && p.decidedAt <= to)
      .map((p) => ({ externalOrderId: p.externalOrderId, lineId: p.lineId, sku: p.sku, reason: p.reason, returnListId: p.returnListId, consignmentId: p.consignmentId, courier: p.courier, handedBackAt: p.handedBackAt, decidedAt: p.decidedAt, value: p.price }));
    return ok(200, { claims });
  }
}
