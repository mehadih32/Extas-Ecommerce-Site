// PR 498 — the generic ERP adapter contract (Blueprint A3, V2 block "the ERP becomes optional"). Every ERP the shop can
// talk to is one adapter of kind ERP that answers this interface, in mock, sandbox and live mode. The shop's inventory
// code (@extas/inventory) only ever sees `ErpApi`, so a second ERP is a new adapter next to `extasErp`, not a rewrite.
//
// The shape follows the ERP ↔ shop API contract (docs/ERP-API-CONTRACT.md, CN-005): the ERP is the master for
// variants and stock; the company is decided by the key on the ERP side, never sent by the shop; stock comes per SKU
// per ERP warehouse. Order and document pushes (PR 199, 200) extend this interface when they are built.
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

/** What every ERP adapter offers the shop. */
export interface ErpApi {
  /** The adapter's provider key (`extasErp`, …). */
  readonly provider: string;
  health(o?: ErpCallOptions): Promise<ErpHealth>;
  variants(q: ErpListQuery, o?: ErpCallOptions): Promise<ErpPage<ErpVariantRow>>;
  stock(q: ErpStockQuery, o?: ErpCallOptions): Promise<ErpPage<ErpStockRow>>;
  /** Live stock of one SKU in every warehouse (the checkout's final check). */
  stockForSku(sku: string, o?: ErpCallOptions): Promise<ErpStockRow[]>;
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
