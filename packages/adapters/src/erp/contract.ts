// PR 498 — the generic ERP adapter contract (Blueprint A3, V2 block "the ERP becomes optional"). Every ERP the shop can
// talk to is one adapter of kind ERP that answers this interface, in mock, sandbox and live mode. The shop's inventory
// code (@extas/inventory) only ever sees `ErpApi`, so a second ERP is a new adapter next to `extasErp`, not a rewrite.
//
// The shape follows the ERP ↔ shop API contract (docs/ERP-API-CONTRACT.md, CN-005): the ERP is the master for
// variants and stock; the company is decided by the key on the ERP side, never sent by the shop; stock comes per SKU
// per ERP warehouse. Business documents (PR 199, 200) go out through `push`, each with its Idempotency-Key.
import { AdapterError } from '../define';

/** Who the key belongs to, from the ERP's `/health`. */
export interface ErpHealth {
  /** The ERP company the key is bound to; null when the ERP does not report it. */
  companyId: string | null;
  companyName: string;
  integrationName: string;
  /** The ERP warehouse the integration is set up with, when the ERP reports it. */
  warehouseId: string | null;
}

/**
 * One ERP variant (style → colour / size → SKU). `retailPrice` and `avgCost` are the ERP's decimal text in its own
 * currency unit, kept as text: the shop converts them with the store's currency when it uses them (PR 204), so no
 * rounding happens on the way in.
 */
export interface ErpVariantRow {
  sku: string;
  barcode: string | null;
  styleCode: string | null;
  styleName: string | null;
  color: string | null;
  size: string | null;
  retailPrice: string | null;
  avgCost: string | null;
  active: boolean;
  updatedAt: Date;
}

/** Stock of one SKU in one ERP warehouse (the ERP's StockBalance). */
export interface ErpStockRow {
  sku: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
  available: number;
  updatedAt: Date;
}

export interface ErpPage<T> {
  items: T[];
  /** Pass back to get the next page; null on the last page. */
  nextCursor: string | null;
  /** Rows that broke the contract (position in the page and why); the good rows of the page still count. */
  rejected: { index: number; reason: string }[];
}

export interface ErpListQuery {
  updatedSince?: Date | null;
  cursor?: string | null;
  limit: number;
}

export interface ErpStockQuery extends ErpListQuery {
  warehouseId?: string | null;
}

/** Per call: how long to wait for the ERP. The sync layer passes it from settings (`erp.sync.requestTimeoutSeconds`). */
export interface ErpCallOptions {
  timeoutMs?: number;
}

// ---- PR 199, 200 · business documents the shop sends (A3.5 rule 1: documents, never journal lines) ----------------

/** The channel and first status of every order the shop sends (contract: `POST /orders`). Contract values, like routes. */
export const ERP_ORDER_CHANNEL = 'WEBSITE';
export const ERP_ORDER_CONFIRMED = 'CONFIRMED';
/** Status changes the contract accepts on `PATCH /orders/{externalOrderId}`. */
export const ERP_ORDER_STATUSES = ['PROCESSING', 'PACKED', 'CANCELLED', 'DELIVERED', 'RETURNED'] as const;
export type ErpOrderStatus = (typeof ERP_ORDER_STATUSES)[number];

/** One order line, by the ERP's SKU. Amounts are decimal text in the store's currency unit (no rounding on the way). */
export interface ErpOrderLine {
  sku: string;
  quantity: number;
  unitPrice: string;
  discount: string;
}

/** A SalesOrder as the contract's `POST /orders` takes it. The ERP's own logic reserves the stock and posts the books. */
export interface ErpSalesOrder {
  channel: typeof ERP_ORDER_CHANNEL;
  status: typeof ERP_ORDER_CONFIRMED;
  externalOrderId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  items: ErpOrderLine[];
  shippingFee: string;
  codAmount: string;
  paymentMethod: string;
  note: string | null;
}

/**
 * Every document the shop can send. Each later stage adds its own kind here (payment S07, shipment S08, return S08,
 * ad spend S13) with its contract path in the HTTP client. There is deliberately no kind for journal lines.
 */
/**
 * PR 187 (S08; BACKEND-ARCHITECTURE §6.5.4, decision D4) — a return as the contract's `POST /returns` takes it: the
 * order, why it came back, and the pieces by the SKU **scanned at QC** (SIM-F-022). Only sellable pieces are sent, as
 * `good`: an unsellable piece stays a loss in the shop's records and is never sent to ERP stock.
 */
export const ERP_RETURN_QC_GOOD = 'good';
export interface ErpReturnLine {
  sku: string;
  quantity: number;
  qc: typeof ERP_RETURN_QC_GOOD;
}
export interface ErpReturn {
  externalOrderId: string;
  reason: string;
  items: ErpReturnLine[];
}

export type ErpDocument =
  | { type: 'order.create'; body: ErpSalesOrder }
  | { type: 'order.status'; externalOrderId: string; body: { status: ErpOrderStatus } }
  | { type: 'return.create'; body: ErpReturn };

export type ErpDocumentType = ErpDocument['type'];

/** Sending a document: the Idempotency-Key is required (contract); the same key always means the same document. */
export interface ErpPushOptions extends ErpCallOptions {
  idempotencyKey: string;
}

export interface ErpPushResult {
  /** The ERP's id for what it made (`erpOrderId` for an order), when it says. */
  erpId: string | null;
  status: number;
  /** The ERP's answer, kept on the ErpPush row (never carries a key). */
  body: unknown;
  /** The ERP answered from its idempotency record: it had this document already and changed nothing. */
  replayed: boolean;
}

/** What every ERP adapter offers the shop. */
export interface ErpApi {
  /** The adapter's provider key (`extasErp`, …). */
  readonly provider: string;
  health(o?: ErpCallOptions): Promise<ErpHealth>;
  variants(q: ErpListQuery, o?: ErpCallOptions): Promise<ErpPage<ErpVariantRow>>;
  stock(q: ErpStockQuery, o?: ErpCallOptions): Promise<ErpPage<ErpStockRow>>;
  /** Live stock of one SKU in every warehouse (the checkout's final check). */
  stockForSku(sku: string, o?: ErpCallOptions): Promise<ErpStockRow[]>;
  /**
   * Sends one business document (PR 199). One call is one request: trying again is the outbox relay's job, always with
   * the same Idempotency-Key, so a document the ERP already has is never applied twice (PR 200).
   */
  push(doc: ErpDocument, o: ErpPushOptions): Promise<ErpPushResult>;
}

/**
 * Why an ERP call failed. Stable codes: the sync layer decides on them whether to try again, the health panel (PR 205)
 * shows them, and the admin screens turn them into text.
 */
export type ErpErrorCode =
  /** The key was refused (401). */
  | 'AUTH'
  /** The key is valid but may not do this (403), e.g. an IP allow-list on the ERP side. */
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  /** 409 — for an order push: stock is short (details name the SKUs). */
  | 'CONFLICT'
  /** 429 — too many calls; `retryAfterMs` says when to come back. */
  | 'RATE_LIMITED'
  /** Any other 4xx: the request itself is wrong; trying again does not help. */
  | 'INVALID_REQUEST'
  /** 5xx — the ERP failed; worth another try. */
  | 'SERVER'
  | 'TIMEOUT'
  /** The ERP could not be reached (DNS, refused, reset). */
  | 'NETWORK'
  /** The answer is not what the contract says. */
  | 'BAD_RESPONSE'
  /** The adapter is missing its address or key. */
  | 'NOT_CONFIGURED';

const RETRYABLE: ReadonlySet<ErpErrorCode> = new Set(['RATE_LIMITED', 'SERVER', 'TIMEOUT', 'NETWORK']);

export class ErpError extends AdapterError {
  readonly code: ErpErrorCode;
  /** HTTP status from the ERP, when there was an answer. */
  readonly status: number | null;
  /** The ERP's own error code from `{ error: { code } }`, when it sent one. */
  readonly erpCode: string | null;
  readonly details: string[];
  readonly retryAfterMs: number | null;

  constructor(code: ErpErrorCode, message: string, extra: { status?: number | null; erpCode?: string | null; details?: string[]; retryAfterMs?: number | null } = {}) {
    super(`${code}: ${message}`);
    this.name = 'ErpError';
    this.code = code;
    this.status = extra.status ?? null;
    this.erpCode = extra.erpCode ?? null;
    this.details = extra.details ?? [];
    this.retryAfterMs = extra.retryAfterMs ?? null;
  }

  /** Another try may succeed (rate limit, ERP error, timeout, network). */
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

export const isErpError = (e: unknown): e is ErpError => e instanceof ErpError;

/** The error code for an HTTP status the ERP answered with. */
export function erpCodeForStatus(status: number): ErpErrorCode {
  if (status === 401) return 'AUTH';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER';
  return 'INVALID_REQUEST';
}

/** Turns any failure into an ErpError (a missing key → NOT_CONFIGURED; anything unknown → NETWORK). */
export function toErpError(e: unknown): ErpError {
  if (e instanceof ErpError) return e;
  if (e instanceof AdapterError) return new ErpError('NOT_CONFIGURED', e.message);
  return new ErpError('NETWORK', e instanceof Error ? e.message : String(e));
}
