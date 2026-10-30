// CN-028 · PR 607 (CN-029 Phase 0) — ERP contract v6 on the wire: the typed calls and answers of
// docs/erp/site-changes-v6.md. To the ERP, Extas Retail is a separate buyer that buys at the ERP's shop price
// (`shopPrice`); the ERP keeps only which pieces it gave, which it took back, what it was paid and what is still owed. The
// shop keeps its own profit and loss.
//
// What is here (moved from packages/adapters/src/erp/v6.ts so every lane writes against one copy; the adapter re-exports
// it unchanged):
// - the v6 shapes the shop sends (the v6 order with line ids and whole-taka customer prices, a shipment, a delivery
//   result, a line decision, a courier return list, a late exchange return, a daily summary, the fixed costs);
// - the v6 answers the shop reads (an order's `erpTotal` and line `shopPrice`, the account, returns and their summary
//   and claims, exchanges, the stored daily summaries and fixed costs, the cost of goods), each checked by a schema so a
//   broken answer is a BAD_RESPONSE, never a silent zero;
// - the list of v5 calls that are retired on the switch date (`ERP_V6_RETIRED`): from then they are never sent;
// - the v6 events (PR 608) and the one parser both the webhook and the pull use.
//
// Money: the ERP speaks BDT. Amounts the ERP sends are kept as decimal text (like v5, no rounding on the way in); the
// shop converts them with the store's currency. Amounts the shop sends in v6 are whole taka where the contract says so
// (`customerPrice`, `deliveryCharge`, `advancePaid`). Field names may still be renamed in the final `openapi.yaml`;
// every name is in this one file so a rename is one change.
import { z } from 'zod';

/** The setting `erp.model`: `v5` until the ERP's switch date, then `v6` (PR 619 switches it, after a dry run). */
export const ERP_MODELS = ['v5', 'v6'] as const;
export type ErpModel = (typeof ERP_MODELS)[number];

/** A SKU's grade: the factory's own B-grade lines are separate SKUs with their own shop price and stock. */
export const ERP_GRADES = ['A', 'B'] as const;
export type ErpGrade = (typeof ERP_GRADES)[number];

// ---- what the shop sends ----------------------------------------------------------------------------------------------

/** One v6 order line: the shop's own line id, the customer's whole-taka price for each piece, the grade. */
export interface ErpOrderLineV6 {
  lineId: string;
  sku: string;
  quantity: number;
  grade: ErpGrade;
  /** The customer's price and discount, kept by the ERP for Retail's reports only (decimal text, as v5). */
  unitPrice: string;
  discount: string;
  /** The customer's price of one piece after the combo split and discounts, in whole taka. */
  customerPrice: number;
  comboId: string | null;
  /** An exchange order's line names the line it replaces. */
  replacesLineId?: string;
}

/** The exchange part of an exchange order (`POST /orders`, §2.10.2). */
export interface ErpExchangeRef {
  ofExternalOrderId: string;
  note: string;
}

/** A v6 SalesOrder (`POST /orders`, §2.3, §2.5.1, §2.10.2). */
export interface ErpSalesOrderV6 {
  channel: 'WEBSITE';
  status: 'CONFIRMED';
  externalOrderId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  paymentMethod: string;
  note: string | null;
  items: ErpOrderLineV6[];
  /** What the customer was to pay for delivery, whole taka; 0 for free delivery. */
  deliveryCharge: number;
  /** bKash or another advance the customer paid, whole taka. */
  advancePaid: number;
  exchange?: ErpExchangeRef;
}

/** `POST /shipments` (§2.3): from v6 it also bills the order. Sent when the courier confirms pickup (RETAIL-ERP-MODEL §13.1). */
export interface ErpShipmentV6 {
  externalOrderId: string;
  courier: string;
  consignmentId: string;
  /** The courier's charge, kept by the ERP for reference (decimal text). */
  charge: string | null;
  pickedUpAt: string;
}

export const ERP_DELIVERY_STATUSES = ['DELIVERED', 'PARTIAL', 'RETURNED'] as const;
export type ErpDeliveryStatus = (typeof ERP_DELIVERY_STATUSES)[number];

/** `PUT /orders/{externalOrderId}/delivery` (§2.5.2): every courier result. */
export interface ErpDeliveryResult {
  status: ErpDeliveryStatus;
  courier: string;
  consignmentId: string | null;
  /** What the courier collected, whole taka. */
  collected: number;
  at: string;
  /** The staff's "Partial delivery" mark: the lines kept, any discount promised by phone. */
  mark?: { keptLines: string[]; discountGiven: number; phoneConfirmed: boolean; note: string | null };
}

export const ERP_LINE_ACTIONS = ['WAIT', 'REPLACE', 'CANCEL'] as const;
export type ErpLineAction = (typeof ERP_LINE_ACTIONS)[number];

/** `PATCH /orders/{externalOrderId}/lines/{lineId}` (§2.3): what to do with a line the ERP could not fill. */
export type ErpLineDecision = { action: 'WAIT' } | { action: 'REPLACE'; sku: string; grade: ErpGrade } | { action: 'CANCEL'; reason: string };

/** `POST /return-lists` (§2.5.3): the courier's hand-back, parcels only (the ERP knows the pieces). */
export interface ErpReturnList {
  returnListId: string;
  /** A courier, or `HAND` for a return handed in at a showroom. */
  courier: string;
  /** The courier's own date the parcels reached the shop (YYYY-MM-DD). */
  handedBackAt: string;
  parcels: { consignmentId: string | null; externalOrderId: string; receivedCount?: number; note?: string }[];
}

/** `POST /exchanges/{exchangeId}/late-return` (§2.10.3). */
export interface ErpLateReturn {
  handedBackAt: string;
  courier: string;
  returnListId: string | null;
  consignmentId: string | null;
  note: string | null;
}

/** The categories a daily summary may mark as not known yet (§2.6): never sent as 0. */
export const ERP_SUMMARY_INCOMPLETE_KEYS = ['orders', 'sales', 'income', 'deliveries', 'goods', 'returnLosses', 'packaging', 'delivery', 'paymentFees', 'accessories', 'ads', 'other', 'customers'] as const;
export type ErpSummaryIncompleteKey = (typeof ERP_SUMMARY_INCOMPLETE_KEYS)[number];

/** `PUT /daily-summaries/{date}` (§2.6): the shop's own figures of one day (Asia/Dhaka), in BDT. */
export interface ErpDailySummary {
  date: string;
  orders: { count: number; pieces: number };
  sales: { gross: number; discounts: number; customerReturns: number; net: number };
  income: { deliveryCharges: number };
  deliveries: { delivered: number; failed: number; returned: number; codPending: number };
  costs: {
    goods: number;
    returnLosses: number;
    packaging: number;
    delivery: number;
    paymentFees: number;
    accessories: number;
    ads: { facebook: number; instagram: number; google: number; tiktok: number; other: number };
    other: number;
  };
  returns: { handedBackPieces: number; approvedCredit: number; waitingCheckValue: number };
  customers: { new: number; returning: number };
  incomplete: ErpSummaryIncompleteKey[];
  netProfit: number;
}

/** `netProfit` = sales.net + income.deliveryCharges − every cost line (§2.6). The ERP checks the same sum. */
export function summaryNetProfit(s: Pick<ErpDailySummary, 'sales' | 'income' | 'costs'>): number {
  const c = s.costs;
  const ads = c.ads.facebook + c.ads.instagram + c.ads.google + c.ads.tiktok + c.ads.other;
  return s.sales.net + s.income.deliveryCharges - (c.goods + c.returnLosses + c.packaging + c.delivery + c.paymentFees + c.accessories + ads + c.other);
}

export const ERP_FIXED_COST_LINES = ['salary', 'rent', 'utilities', 'other'] as const;

/** `PUT /fixed-costs/{month}` (§2.11). */
export interface ErpFixedCosts {
  month: string;
  costs: { salary: number; rent: number; utilities: number; other: number };
  note: string | null;
}

// ---- the v5 calls retired on the switch date (§2.12) ----------------------------------------------------------------

/**
 * From the switch date (`erp.model` = v6) the shop never sends these: the ERP answers them `410 GONE` (or
 * `410 USE_DELIVERY_RESULT` for a delivered or returned status). Customer payments, ad spend and shipment events are not
 * built as documents yet (S07, S13); they are listed so the day they are, the guard already stops them.
 */
export const ERP_V6_RETIRED = {
  documents: ['return.create', 'payment.create', 'adSpend.create', 'shipment.event'] as const,
  /** `PATCH /orders/{id}` keeps PROCESSING, PACKED and CANCELLED; these two go by `PUT /orders/{id}/delivery`. */
  orderStatuses: ['DELIVERED', 'RETURNED'] as const,
};

/** Is this document one of the calls v6 retires? */
export function retiredInV6(doc: { type: string; body?: unknown }): boolean {
  if ((ERP_V6_RETIRED.documents as readonly string[]).includes(doc.type)) return true;
  if (doc.type === 'order.status') {
    const status = (doc.body as { status?: unknown } | undefined)?.status;
    return typeof status === 'string' && (ERP_V6_RETIRED.orderStatuses as readonly string[]).includes(status);
  }
  return false;
}

/** The ERP's refusal codes the shop acts on (§2.3, §2.10.2). */
export const ERP_V6_REFUSALS = ['ACCOUNT_ON_HOLD', 'NO_SHOP_PRICE', 'INSUFFICIENT_STOCK', 'LINE_NOT_DELIVERED', 'EXCHANGE_OPEN', 'USE_DELIVERY_RESULT', 'GONE'] as const;
export type ErpV6Refusal = (typeof ERP_V6_REFUSALS)[number];

// ---- what the ERP answers -----------------------------------------------------------------------------------------------

const decimal = z.union([z.string().regex(/^-?\d+(\.\d+)?$/), z.number()]).transform(String);
const optDecimal = decimal.nullish().transform((v) => v ?? null);
const optText = z.string().nullish().transform((v) => v ?? null);
const grade = z.enum(ERP_GRADES).default('A');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, { message: 'not a date' });
const optIsoDate = isoDate.nullish().transform((v) => (v ? v.slice(0, 10) : null));
const stamp = z
  .union([z.string(), z.date()])
  .transform((v, c) => {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      c.addIssue({ code: 'custom', message: 'not a date' });
      return z.NEVER;
    }
    return d;
  });
const count = z.int().min(0);

/** One line of the answer to `POST /orders` (and of `GET /orders/{id}`). */
export const erpOrderLineAnswerSchema = z.object({
  lineId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.int().min(1).optional(),
  grade,
  shopPrice: optDecimal,
  fromReturnStock: z.boolean().default(false),
  replacesLineId: optText,
  replacedShopPrice: optDecimal,
  state: optText,
});
export type ErpOrderLineAnswer = z.output<typeof erpOrderLineAnswerSchema>;

/** The answer to a v6 `POST /orders`: what Retail will owe for it (fixed now, billed when the parcel leaves). */
export const erpOrderAnswerSchema = z.object({
  erpOrderId: z.union([z.string().min(1), z.number()]).transform(String).nullish().transform((v) => v ?? null),
  externalOrderId: z.string().min(1),
  status: optText,
  erpTotal: decimal,
  billedAt: stamp.nullish().transform((v) => v ?? null),
  lines: z.array(erpOrderLineAnswerSchema).default([]),
  exchangeId: optText,
  atRisk: optDecimal,
});
export type ErpOrderAnswer = z.output<typeof erpOrderAnswerSchema>;

/** The answer to `POST /shipments`: the order is billed now. */
export const erpShipmentAnswerSchema = z.object({ externalOrderId: z.string().min(1), consignmentId: optText, billedAt: stamp.nullish().transform((v) => v ?? null), erpTotal: optDecimal });
export type ErpShipmentAnswer = z.output<typeof erpShipmentAnswerSchema>;

export const ERP_IDENTIFICATIONS = ['GREEN', 'YELLOW', 'ORANGE'] as const;
export type ErpIdentification = (typeof ERP_IDENTIFICATIONS)[number];

/** The answer to `PUT /orders/{id}/delivery`: the ERP's identification of a partial delivery. */
export const erpDeliveryAnswerSchema = z.object({
  externalOrderId: z.string().min(1),
  status: z.enum(ERP_DELIVERY_STATUSES),
  identification: z.enum(ERP_IDENTIFICATIONS).nullish().transform((v) => v ?? null),
  keptLines: z.array(z.string()).default([]),
  returnedLines: z.array(z.string()).default([]),
  billedAt: stamp.nullish().transform((v) => v ?? null),
});
export type ErpDeliveryAnswer = z.output<typeof erpDeliveryAnswerSchema>;

export const ERP_PARCEL_RESULTS = ['IN_RETURN_STOCK', 'HOLD', 'REFUSED'] as const;
/** The answer to `POST /return-lists`: one row per parcel. */
export const erpReturnListAnswerSchema = z.object({
  returnListId: z.string().min(1),
  parcels: z.array(
    z.object({
      consignmentId: optText,
      externalOrderId: z.string().min(1),
      result: z.enum(ERP_PARCEL_RESULTS),
      reason: optText,
      pieces: z.array(z.object({ lineId: z.string().min(1), sku: z.string().min(1) })).default([]),
      expectedCount: count.nullish().transform((v) => v ?? null),
    }),
  ),
});
export type ErpReturnListAnswer = z.output<typeof erpReturnListAnswerSchema>;

/** One ERP event as it comes inside a pull (`GET /returns`, `GET /exchanges`): the same id as its webhook. */
export const erpPulledEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  occurredAt: stamp.nullish().transform((v) => v ?? null),
  date: optIsoDate,
  reverses: z.string().min(1).max(200).nullish().transform((v) => v ?? null),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type ErpPulledEvent = z.output<typeof erpPulledEventSchema>;

export const ERP_RETURN_STAGES = ['DELIVERY_RESULT', 'HANDED_BACK', 'HOLD_RESOLVED', 'CHECKED', 'CLOSED'] as const;
/** One returned parcel in `GET /returns?updatedSince=`, with the events that made it what it is. */
export const erpReturnItemSchema = z.object({
  externalOrderId: z.string().min(1),
  consignmentId: optText,
  returnListId: optText,
  stage: z.enum(ERP_RETURN_STAGES),
  handedBackAt: optIsoDate,
  updatedAt: stamp,
  events: z.array(erpPulledEventSchema).default([]),
});
export type ErpReturnItem = z.output<typeof erpReturnItemSchema>;

/** `GET /returns/summary?date=` (§2.9): the ERP's counts of one day. */
export const erpReturnsSummarySchema = z.object({
  date: isoDate.transform((v) => v.slice(0, 10)),
  handedBack: count,
  onHold: count,
  inReturnStock: count,
  approved: count,
  approvedCredit: decimal,
  declined: count,
  waitingCheck: decimal.default('0'),
});
export type ErpReturnsSummary = z.output<typeof erpReturnsSummarySchema>;

/** One courier claim in `GET /returns/claims?from&to` (§2.5.4): missing or damaged, ready to send to the courier. */
export const erpClaimSchema = z.object({
  externalOrderId: z.string().min(1),
  lineId: optText,
  sku: optText,
  reason: z.string().min(1),
  returnListId: optText,
  consignmentId: optText,
  courier: optText,
  handedBackAt: optIsoDate,
  decidedAt: optIsoDate,
  value: optDecimal,
});
export type ErpClaim = z.output<typeof erpClaimSchema>;

export const ERP_EXCHANGE_STATUSES = ['WAITING_STOCK', 'WAITING_DELIVERY', 'WAITING_RETURN', 'RETURNED_WAITING_CHECK', 'SETTLED', 'BILLED', 'CREDITED', 'CANCELLED'] as const;
export type ErpExchangeStatus = (typeof ERP_EXCHANGE_STATUSES)[number];

/** One exchange in `GET /exchanges` (§2.10.5). */
export const erpExchangeSchema = z.object({
  exchangeId: z.string().min(1),
  externalOrderId: z.string().min(1),
  ofExternalOrderId: z.string().min(1),
  status: z.enum(ERP_EXCHANGE_STATUSES),
  lines: z.array(z.object({ lineId: z.string().min(1), replacesLineId: z.string().min(1), sku: z.string().min(1), shopPrice: decimal, replacedShopPrice: decimal })).default([]),
  atRisk: decimal.default('0'),
  deliveredAt: optIsoDate,
  deadline: optIsoDate,
  updatedAt: stamp.nullish().transform((v) => v ?? null),
  events: z.array(erpPulledEventSchema).default([]),
});
export type ErpExchange = z.output<typeof erpExchangeSchema>;

/** `GET /account` (§2.4): what Retail owes, the hold and (with `from` and `to`) the period and its statement. */
export const erpAccountSchema = z.object({
  balance: decimal,
  waitingCheck: decimal.default('0'),
  exchangesAtRisk: decimal.default('0'),
  hold: z.object({
    onHold: z.boolean(),
    reason: optText,
    lastPaymentAt: optIsoDate,
    daysSinceLastPayment: z.int().min(0).nullish().transform((v) => v ?? null),
    holdsOn: optIsoDate,
    warnFromDays: z.int().min(0).nullish().transform((v) => v ?? null),
  }),
  period: z
    .object({
      from: isoDate,
      to: isoDate,
      openingBalance: decimal,
      ordersTotal: decimal,
      exchangesTotal: decimal,
      otherCharges: decimal,
      creditsTotal: decimal,
      paymentsTotal: decimal,
      closingBalance: decimal,
    })
    .nullish()
    .transform((v) => v ?? null),
  statement: z
    .array(z.object({ id: optText, date: isoDate.transform((v) => v.slice(0, 10)), kind: z.string().min(1), amount: decimal, externalOrderId: optText, reference: optText, eventId: optText }))
    .default([]),
});
export type ErpAccount = z.output<typeof erpAccountSchema>;

/** One stored day in `GET /daily-summaries?from&to`. */
export const erpStoredSummarySchema = z.object({
  date: isoDate.transform((v) => v.slice(0, 10)),
  receivedAt: stamp.nullish().transform((v) => v ?? null),
  versions: z.int().min(1).default(1),
  netProfit: decimal.nullish().transform((v) => v ?? null),
  incomplete: z.array(z.string()).default([]),
  bodyHash: optText,
});
export type ErpStoredSummary = z.output<typeof erpStoredSummarySchema>;

/** One month in `GET /fixed-costs`. */
export const erpFixedCostMonthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), costs: z.object({ salary: decimal, rent: decimal, utilities: decimal, other: decimal }), note: optText });
export type ErpFixedCostMonth = z.output<typeof erpFixedCostMonthSchema>;

/** One day × SKU in `GET /cost-of-goods?from&to` (§3.5): pieces delivered and their value at that day's shop price. */
export const erpCostOfGoodsSchema = z.object({ date: isoDate.transform((v) => v.slice(0, 10)), sku: z.string().min(1), pieces: z.int(), value: decimal });
export type ErpCostOfGoodsRow = z.output<typeof erpCostOfGoodsSchema>;

// ---- PR 619 · the switch-over (§3; docs/RETAIL-ERP-MODEL.md §9) -------------------------------------------------------
//
// The ERP announces a store's switch date and, on that date, moves the store's open old orders to the new rules and
// sends the list of every order it moved, with the amount (§3.3). The final `openapi.yaml` has not named the call yet:
// the shop reads it as `GET /switch-over` with the names below (a rename is one change here, follow-up 571).
// - `NOT_OUT`  confirmed, processing or packed: billed at `shopPrice` when the parcel leaves, like any new order;
// - `OUT`      out with the courier: billed at `shopPrice` on the switch date (the lines carry the shop prices);
// - `ADVANCE`  a customer advance the ERP recorded on such an order, moved to Retail's account as a credit;
// - `UNPAID`   delivered before the switch, the customer's money still unpaid: the unpaid amount moved to Retail at the
//              buying price (owner's answer "ক").
// `transfer` is the one entry the ERP books for ADVANCE and UNPAID together (`otherCharges` in `GET /account`; signed: +
// Retail owes more). `openingBalance` is what Retail owed the ERP before the switch date (the account's balance at the
// end of the day before). `status` is DONE once the ERP has moved everything and the list is final.

export const ERP_SWITCH_ORDER_KINDS = ['NOT_OUT', 'OUT', 'ADVANCE', 'UNPAID'] as const;
export type ErpSwitchOrderKind = (typeof ERP_SWITCH_ORDER_KINDS)[number];
export const ERP_SWITCH_STATUSES = ['NONE', 'ANNOUNCED', 'DONE'] as const;
export type ErpSwitchStatus = (typeof ERP_SWITCH_STATUSES)[number];

/** One order the ERP moved at the switch. */
export const erpSwitchOrderSchema = z.object({
  externalOrderId: z.string().min(1).max(200),
  kind: z.enum(ERP_SWITCH_ORDER_KINDS),
  amount: decimal,
  consignmentId: optText,
  lines: z.array(z.object({ lineId: z.string().min(1).max(200), sku: z.string().min(1).max(200), quantity: z.int().min(1).default(1), shopPrice: decimal })).default([]),
});
export type ErpSwitchOrder = z.output<typeof erpSwitchOrderSchema>;

/** `GET /switch-over`: the store's switch date, the moved orders, the one transfer and the opening balance. */
export const erpSwitchOverSchema = z.object({
  status: z.enum(ERP_SWITCH_STATUSES),
  switchDate: optIsoDate,
  announcedAt: stamp.nullish().transform((v) => v ?? null),
  openingBalance: optDecimal,
  transfer: z.object({ amount: decimal, reference: z.string().min(1).max(200) }).nullish().transform((v) => v ?? null),
  orders: z.array(erpSwitchOrderSchema).default([]),
});
export type ErpSwitchOver = z.output<typeof erpSwitchOverSchema>;

// ---- PR 608 · the v6 events (webhook and pull) ------------------------------------------------------------------------
//
// Every v6 event has an `eventId` the ERP makes once and never uses again, the ERP's business `date`, and, for a
// correction, `reverses: <the eventId it undoes>` (§2.8). The same event comes by webhook (body `eventId` or `id`, also
// in the `X-Extas-Delivery` header, which is not signed: the body's id is the one read) and in the pulls (`GET /returns`, `GET /exchanges`): the shop's one ledger keeps it
// once. `stock.changed` and `variant.changed` stay on the PR 196 path (webhook.ts) with its 72-hour filter.

export const ERP_V6_EVENT_TYPES = [
  'delivery.identified',
  'return.parcel.resolved',
  'return.piece.decided',
  'order.line.short',
  'order.line.filled',
  'exchange.billed',
  'exchange.settled',
  'exchange.credited',
  'exchange.cancelled',
  'summary.missing',
  'account.hold',
  'account.released',
  'shop-price.changed',
  'payment.recorded',
] as const;
export type ErpV6EventType = (typeof ERP_V6_EVENT_TYPES)[number];
const V6_TYPES: ReadonlySet<string> = new Set(ERP_V6_EVENT_TYPES);
export const isErpV6EventType = (t: unknown): t is ErpV6EventType => typeof t === 'string' && V6_TYPES.has(t);

/** The header that repeats the event id on a v6 webhook. */
export const ERP_DELIVERY_HEADER = 'x-extas-delivery';

/** The owner's decision on a returned piece (§2.5.4). */
export const ERP_PIECE_DECISIONS = ['APPROVED', 'DECLINED', 'APPROVED_AT_PACKING', 'DIFFERENT_PIECE'] as const;
/** Declined reasons that may be the courier's fault: the shop can claim them from the courier (§2.5.4). */
export const ERP_CLAIM_REASONS = ['PARCEL_MISSING', 'PIECE_MISSING', 'STAIN_OR_DAMAGE'] as const;

const ref = z.string().min(1).max(200);
const lineRef = z.object({ lineId: ref, sku: ref.optional() }).loose();
/** A line by its id, or the line itself (id and SKU). */
const lineOrId = z.union([ref, lineRef]);
const amount = decimal;

/** What each v6 event carries (the fields the shop reads; anything else the ERP adds is kept as sent). */
const V6_DATA: Record<ErpV6EventType, z.ZodType<Record<string, unknown>>> = {
  'delivery.identified': z.object({ externalOrderId: ref, identification: z.enum(ERP_IDENTIFICATIONS), keptLines: z.array(lineOrId).default([]), returnedLines: z.array(lineOrId).default([]) }).loose(),
  'return.parcel.resolved': z.object({ externalOrderId: ref, result: z.enum(['RESOLVED', 'PARCEL_MISSING']), pieces: z.array(lineRef).default([]) }).loose(),
  'return.piece.decided': z
    .object({ externalOrderId: ref, lineId: ref, sku: ref.optional(), decision: z.enum(ERP_PIECE_DECISIONS), reason: z.string().max(100).nullish(), credit: amount.default('0'), exchangeId: ref.nullish() })
    .loose(),
  'order.line.short': z.object({ externalOrderId: ref, lineId: ref, sku: ref.optional(), reason: z.string().max(100).nullish() }).loose(),
  'order.line.filled': z.object({ externalOrderId: ref, lineId: ref, sku: ref.optional() }).loose(),
  'exchange.billed': z.object({ exchangeId: ref, externalOrderId: ref.nullish(), amount, reason: z.string().max(100).nullish() }).loose(),
  'exchange.settled': z.object({ exchangeId: ref, externalOrderId: ref.nullish(), amount, kind: z.enum(['EXTRA', 'ADJUSTMENT', 'EVEN']) }).loose(),
  'exchange.credited': z.object({ exchangeId: ref, externalOrderId: ref.nullish(), amount }).loose(),
  'exchange.cancelled': z.object({ exchangeId: ref, externalOrderId: ref.nullish(), amount: amount.default('0') }).loose(),
  'summary.missing': z.object({ dates: z.array(isoDate.transform((v) => v.slice(0, 10))).min(1) }).loose(),
  'account.hold': z.object({ reason: z.string().max(200).nullish(), holdsOn: optIsoDate }).loose(),
  'account.released': z.object({}).loose(),
  'shop-price.changed': z.object({ sku: ref, shopPrice: amount, previous: optDecimal }).loose(),
  'payment.recorded': z.object({ amount, reference: z.string().max(200).nullish() }).loose(),
};

export interface ErpV6Event {
  eventId: string;
  type: ErpV6EventType;
  occurredAt: Date | null;
  /** The ERP's business date of the event (Asia/Dhaka), `YYYY-MM-DD`. */
  date: string | null;
  reverses: string | null;
  data: Record<string, unknown>;
}

export type ErpV6EventParse =
  | { ok: true; event: ErpV6Event }
  /** Not a v6 event type (for example `stock.changed`): the PR 196 path reads it. */
  | { ok: false; reason: 'NOT_V6'; type: string | null }
  | { ok: false; reason: 'BAD_PAYLOAD'; eventId: string | null; type: string | null; detail: string };

const v6Envelope = z.object({
  eventId: ref.optional(),
  id: z.union([ref, z.number()]).transform(String).optional(),
  type: z.string().min(1).max(100),
  occurredAt: stamp.nullish().transform((v) => v ?? null),
  date: optIsoDate,
  reverses: ref.nullish().transform((v) => v ?? null),
  data: z.record(z.string(), z.unknown()).default({}),
});

const v6Issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(event)'}: ${i.message}`).join('; ').slice(0, 300);

/**
 * Reads one v6 event (a webhook body, or one event of a pull). Never throws. The eventId is the body's own (`eventId`,
 * or `id`): it is what the signature covers. `headerId` is `X-Extas-Delivery`, which is not signed: it may repeat the
 * body's id, never stand in for it, and one that differs makes the event BAD_PAYLOAD (p3 review: a captured signed body
 * replayed with a new header must never become a new ledger row).
 */
export function parseErpV6Event(body: unknown, headerId: string | null = null): ErpV6EventParse {
  const type = body && typeof body === 'object' && typeof (body as { type?: unknown }).type === 'string' ? (body as { type: string }).type : null;
  if (!isErpV6EventType(type)) return { ok: false, reason: 'NOT_V6', type };
  const env = v6Envelope.safeParse(body);
  if (!env.success) return { ok: false, reason: 'BAD_PAYLOAD', eventId: null, type, detail: v6Issues(env.error) };
  const eventId = env.data.eventId ?? env.data.id ?? null;
  if (!eventId) return { ok: false, reason: 'BAD_PAYLOAD', eventId: null, type, detail: 'eventId: missing' };
  const header = headerId?.trim();
  if (header && header !== eventId) return { ok: false, reason: 'BAD_PAYLOAD', eventId, type, detail: 'eventId: X-Extas-Delivery differs from the body' };
  const data = V6_DATA[type].safeParse(env.data.data);
  if (!data.success) return { ok: false, reason: 'BAD_PAYLOAD', eventId, type, detail: v6Issues(data.error) };
  return { ok: true, event: { eventId, type, occurredAt: env.data.occurredAt, date: env.data.date, reverses: env.data.reverses, data: data.data } };
}

/**
 * Does this event move money or credit? The contract asks for a permanent filter for these (§2.8): a piece approved
 * (or approved at packing), any correction, a payment and every exchange event. The shop's ledger keeps every v6 event
 * permanently; this flag marks the ones the books must never lose.
 */
export function movesMoney(ev: { type: string; reverses: string | null; data: Record<string, unknown> }): boolean {
  if (ev.reverses) return true;
  if (ev.type === 'payment.recorded' || ev.type.startsWith('exchange.')) return true;
  if (ev.type === 'return.piece.decided') return ev.data.decision === 'APPROVED' || ev.data.decision === 'APPROVED_AT_PACKING';
  return false;
}
