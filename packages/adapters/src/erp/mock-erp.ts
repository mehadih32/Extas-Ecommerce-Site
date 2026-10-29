// PR 498 — the practice ERP: an in-process stand-in for the ERP side of the API contract (docs/ERP-API-CONTRACT.md).
// The ERP adapter's MOCK mode talks to it through the real HTTP client (http-client.ts), so the shop runs the same
// code before and after the key arrives (A1.3). It behaves like the real ERP where it matters:
// - keys belong to one company each; the company comes from the key, never from the request;
// - each company has warehouses; stock is kept per SKU per warehouse (onHand, reserved, available = onHand − reserved),
//   variants per SKU with style, colour and size;
// - cursor paging and `updatedSince` filtering, in a stable order;
// - errors in the contract's shape (`{ error: { code, message, details } }`), a wrong key is a 401;
// - failures can be switched on (a status, a network failure, a slow answer, a broken body, or a lost answer after the
//   work was done) for the next N calls, so tests prove retries, timeouts and the error surface;
// - orders (PR 199, 200): `POST /orders` needs an Idempotency-Key, reserves stock with the ERP's own logic (or answers
//   409 with the short SKUs), `PATCH /orders/{externalOrderId}` changes the status (CANCELLED gives the reservation
//   back); the same key with the same body returns the first answer and changes nothing;
// - returns (PR 187): `POST /returns` takes the order's sellable pieces (`qc: good`) and puts them back on hand in the
//   warehouse the order took them from (the first warehouse for a SKU the order did not have);
// - webhooks (PR 196): it can send signed `stock.changed` / `variant.changed` events of its own state, with the
//   webhook secret a test or a developer gives it (never one of its own).
//
// - contract v6 (PR 607, CN-028; mock-erp-v6.ts): shop prices and grades on the variants, Return stock beside main
//   stock, v6 orders and their refusals, shipments that bill, delivery results, return lists, the owner's checks,
//   exchanges, the account and its hold, daily summaries, fixed costs and the cost of goods, every change an event
//   that goes out as a signed webhook and comes back in the pulls; after `v6(…).switched` the retired v5 calls answer 410.
//
// It starts with sample companies and warehouses and **no stock**: nothing it says can reach a real shop's stock
// unless someone puts stock into it (the tests, or a developer). Keys are random per process, never written down.
import { createHash, randomBytes } from 'node:crypto';
import { ERP_API_BASE_PATH, IDEMPOTENT_REPLAY_HEADER, type FetchLike } from './http-client';
import { PracticeErpV6, type V6Event } from './mock-erp-v6';
import type { ErpGrade } from './v6';
import { signedErpWebhook } from './webhook';

export interface MockWarehouse {
  id: string;
  name: string;
}

export interface MockCompanySpec {
  id: string;
  name: string;
  integrationName: string;
  warehouses: MockWarehouse[];
}

interface StockCell {
  onHand: number;
  reserved: number;
  /** PR 607: unchecked returned pieces in the ERP's Return stock (part of `available`, `fromReturnStock`). */
  ret: number;
  updatedAt: Date;
}

export interface MockVariant {
  sku: string;
  barcode?: string | null;
  styleCode?: string | null;
  styleName?: string | null;
  color?: string | null;
  size?: string | null;
  retailPrice?: string | null;
  avgCost?: string | null;
  /** PR 607 (v6): the shop price in whole taka (null: none yet, `409 NO_SHOP_PRICE`). */
  shopPrice?: number | null;
  grade?: ErpGrade;
  active?: boolean;
  updatedAt?: Date;
}

interface Company extends MockCompanySpec {
  stock: Map<string, Map<string, StockCell>>;
  variants: Map<string, Required<MockVariant>>;
  orders: Map<string, MockOrder>;
  /** PR 187: the returns the ERP has taken, in order. */
  returns: { erpReturnId: string; externalOrderId: string; items: { sku: string; quantity: number; warehouseId: string }[] }[];
  /** Idempotency-Key → the first answer (contract: "a repeat returns the first result"). */
  idempotency: Map<string, IdempotencyRecord>;
  /** PR 607: the company's v6 books. */
  v6: PracticeErpV6;
}

/** A failure for the next `times` calls whose path contains `path` (all calls when omitted). */
export interface MockFailure {
  path?: string;
  times?: number;
  /** Let this many matching calls through first (fail the second page, not the first). */
  skip?: number;
  /** Answer with this HTTP status and the contract's error body. */
  status?: number;
  /** Sent as Retry-After (seconds). */
  retryAfterSeconds?: number;
  /** Throw like a dropped connection instead of answering. */
  network?: boolean;
  /** Wait this long before answering (a slow ERP; the client's timeout aborts it). */
  delayMs?: number;
  /** Answer 200 with this raw text (a broken body). */
  rawBody?: string;
  /**
   * Do the work, then lose the answer (PR 200): the ERP has applied the document but the shop never hears back —
   * `network` drops the connection, `timeout` waits `delayMs` after the work so the client's timeout fires.
   */
  lose?: 'network' | 'timeout';
}

/** An order the practice ERP holds (contract: `POST /orders` makes a SalesOrder and reserves its stock). */
export interface MockOrder {
  erpOrderId: string;
  externalOrderId: string;
  status: string;
  items: { sku: string; quantity: number; warehouseId: string }[];
  body: unknown;
}

interface IdempotencyRecord {
  method: string;
  path: string;
  bodyHash: string;
  status: number;
  answer: unknown;
}

export interface MockCall {
  method: string;
  path: string;
  query: Record<string, string>;
  companyId: string | null;
  status: number;
}

/** The practice ERP's sample companies: plainly sample data, no owner data. */
export function sampleMockCompanies(): MockCompanySpec[] {
  return [
    {
      id: 'SAMPLE-CO-1',
      name: 'Sample company one',
      integrationName: 'Sample website',
      warehouses: [
        { id: 'SAMPLE-WH-1', name: 'Sample main warehouse' },
        { id: 'SAMPLE-WH-2', name: 'Sample showroom' },
      ],
    },
    {
      id: 'SAMPLE-CO-2',
      name: 'Sample company two',
      integrationName: 'Second sample website',
      warehouses: [{ id: 'SAMPLE-WH-3', name: 'Second sample warehouse' }],
    },
  ];
}

/** Largest page the practice ERP returns, whatever the shop asks for. */
const LARGEST_PAGE = 1000;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const problem = (status: number, code: string, message: string, details: unknown = null, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message, details } }, headers);

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('the request was aborted', 'AbortError'));
    });
  });
}

const encodeCursor = (offset: number) => Buffer.from(`o:${offset}`).toString('base64url');
function decodeCursor(c: string | null): number | null {
  if (!c) return 0;
  const m = /^o:(\d+)$/.exec(Buffer.from(c, 'base64url').toString());
  return m ? Number(m[1]) : null;
}

export class MockErpWorld {
  private companies = new Map<string, Company>();
  private keys = new Map<string, string>();
  /** CN-029 §16: which practice company each store uses on MOCK (one company per store). */
  private storeCompanies = new Map<number, string>();
  private failures: MockFailure[] = [];
  readonly calls: MockCall[] = [];
  now: () => Date = () => new Date();

  constructor(companies: MockCompanySpec[] = sampleMockCompanies()) {
    this.load(companies);
  }

  private load(companies: MockCompanySpec[]) {
    this.companies.clear();
    this.keys.clear();
    this.storeCompanies.clear();
    for (const c of companies) this.addCompany(c);
  }

  /** One more practice company, with a fresh key of its own. */
  private addCompany(c: MockCompanySpec): void {
    const company = { ...c, warehouses: c.warehouses.map((w) => ({ ...w })), stock: new Map(), variants: new Map(), orders: new Map(), returns: [], idempotency: new Map() } as unknown as Company;
    company.v6 = new PracticeErpV6({
      now: () => this.now(),
      warehouses: () => company.warehouses.map((w) => w.id),
      cell: (sku, wh) => {
        const cell = company.stock.get(sku)?.get(wh);
        return cell ? { main: cell.onHand - cell.reserved, ret: cell.ret } : null;
      },
      adjust: (sku, wh, d) => this.adjustStock(sku, wh, d, company.id),
      variant: (sku) => {
        const v = company.variants.get(sku);
        return v ? { shopPrice: v.shopPrice, grade: v.grade, styleCode: v.styleCode } : null;
      },
    });
    this.companies.set(c.id, company);
    this.keys.set(randomBytes(18).toString('base64url'), c.id);
  }

  /** Back to the sample companies with no stock, no failures and an empty call log. New keys. */
  reset(companies: MockCompanySpec[] = sampleMockCompanies()): void {
    this.load(companies);
    this.failures = [];
    this.calls.length = 0;
    this.now = () => new Date();
  }

  companyIds(): string[] {
    return [...this.companies.keys()];
  }

  company(id?: string): Company {
    const c = id ? this.companies.get(id) : this.companies.values().next().value;
    if (!c) throw new Error(`the practice ERP has no company ${id ?? '(none)'}`);
    return c;
  }

  /**
   * CN-029 §16: the practice company a store uses on MOCK — one per store, never shared, and fixed by the store's id
   * (`SAMPLE-CO-<storeId>`), so a restart or another order of asking never moves a store to another company. Store 1
   * is the first sample company, as before; a store with no sample company gets one of its own. Without a store
   * (installation level) it is the first company, as before. A test can tie a store elsewhere with `linkStore`.
   */
  companyForStore(storeId: number | null | undefined): string {
    if (storeId == null) return this.company().id;
    const tied = this.storeCompanies.get(storeId);
    if (tied && this.companies.has(tied)) return tied;
    const id = `SAMPLE-CO-${storeId}`;
    if (!this.companies.has(id)) {
      this.addCompany({ id, name: `Sample company ${storeId}`, integrationName: `Sample website ${storeId}`, warehouses: [{ id: `SAMPLE-WH-C${storeId}`, name: `Sample warehouse of company ${storeId}` }] });
    }
    return id;
  }

  /** Ties a store to a practice company (tests): its MOCK adapter then speaks for that company only. */
  linkStore(storeId: number, companyId: string): void {
    this.storeCompanies.set(storeId, this.company(companyId).id);
  }

  /** The key of a company (the first one when omitted). */
  keyFor(companyId?: string): string {
    const id = this.company(companyId).id;
    for (const [k, c] of this.keys) if (c === id) return k;
    throw new Error(`no key for ${id}`);
  }

  get defaultKey(): string {
    return this.keyFor();
  }

  /** Lets another key (e.g. one a test typed into the vault) act for a company. */
  acceptKey(key: string, companyId?: string): void {
    this.keys.set(key, this.company(companyId).id);
  }

  revokeKey(key: string): void {
    this.keys.delete(key);
  }

  setStock(sku: string, warehouseId: string, cell: { onHand: number; reserved?: number; returnStock?: number; updatedAt?: Date }, companyId?: string): void {
    const c = this.company(companyId);
    if (!c.warehouses.some((w) => w.id === warehouseId)) throw new Error(`company ${c.id} has no warehouse ${warehouseId}`);
    const bySku = c.stock.get(sku) ?? new Map<string, StockCell>();
    bySku.set(warehouseId, { onHand: cell.onHand, reserved: cell.reserved ?? 0, ret: cell.returnStock ?? bySku.get(warehouseId)?.ret ?? 0, updatedAt: cell.updatedAt ?? this.now() });
    c.stock.set(sku, bySku);
  }

  /** Moves stock like the ERP would (a sale, a receipt): onHand changes and `updatedAt` becomes now. */
  adjustStock(sku: string, warehouseId: string, delta: { onHand?: number; reserved?: number; ret?: number }, companyId?: string): void {
    const cur = this.company(companyId).stock.get(sku)?.get(warehouseId) ?? { onHand: 0, reserved: 0, ret: 0, updatedAt: this.now() };
    this.setStock(sku, warehouseId, { onHand: cur.onHand + (delta.onHand ?? 0), reserved: cur.reserved + (delta.reserved ?? 0), returnStock: cur.ret + (delta.ret ?? 0), updatedAt: this.now() }, companyId);
  }

  setVariant(v: MockVariant, companyId?: string): void {
    this.company(companyId).variants.set(v.sku, {
      sku: v.sku,
      barcode: v.barcode ?? null,
      styleCode: v.styleCode ?? null,
      styleName: v.styleName ?? null,
      color: v.color ?? null,
      size: v.size ?? null,
      retailPrice: v.retailPrice ?? null,
      avgCost: v.avgCost ?? null,
      shopPrice: v.shopPrice ?? null,
      grade: v.grade ?? 'A',
      active: v.active ?? true,
      updatedAt: v.updatedAt ?? this.now(),
    });
  }

  /** PR 607 — one company's v6 books (the first company when omitted). */
  v6(companyId?: string): PracticeErpV6 {
    return this.company(companyId).v6;
  }

  /** PR 607 — the owner changes a shop price in the ERP: the variant moves and `shop-price.changed` is sent. */
  setShopPrice(sku: string, shopPrice: number | null, companyId?: string): V6Event {
    const c = this.company(companyId);
    const v = c.variants.get(sku);
    if (!v) throw new Error(`the practice ERP has no variant ${sku}`);
    const previous = v.shopPrice;
    c.variants.set(sku, { ...v, shopPrice, updatedAt: this.now() });
    return c.v6.shopPriceChanged(sku, shopPrice ?? 0, previous);
  }

  /** PR 607 — a v6 event as a signed webhook (the event id also in `X-Extas-Delivery`, §2.8). */
  signV6(secret: string, ev: V6Event): { id: string; body: string; headers: Record<string, string> } {
    const w = signedErpWebhook(secret, { ...ev, id: ev.eventId } as unknown as { id: string; type: string; data: unknown }, this.now());
    return { id: ev.eventId, body: w.body, headers: { ...w.headers, 'x-extas-delivery': ev.eventId } };
  }

  /** PR 607 — every v6 event not yet taken, signed (a test delivers them, or drops some to prove the pull). */
  v6Webhooks(secret: string, companyId?: string): { id: string; type: string; body: string; headers: Record<string, string> }[] {
    return this.company(companyId).v6.takeEvents().map((ev) => ({ type: ev.type, ...this.signV6(secret, ev) }));
  }

  /** The orders a company holds (PR 199 tests). */
  orders(companyId?: string): MockOrder[] {
    return [...this.company(companyId).orders.values()];
  }

  /** One SKU's stock cell in a warehouse, or null. */
  stockOf(sku: string, warehouseId: string, companyId?: string): { onHand: number; reserved: number } | null {
    const cell = this.company(companyId).stock.get(sku)?.get(warehouseId);
    return cell ? { onHand: cell.onHand, reserved: cell.reserved } : null;
  }

  /**
   * PR 196 — a signed `stock.changed` webhook for one SKU in one warehouse, as the ERP sends it after a change: the
   * cell as it is now, signed with `secret` (the webhook secret the shop has in its vault) at the practice ERP's clock.
   */
  stockChangedWebhook(secret: string, sku: string, warehouseId: string, opts: { id?: string; companyId?: string } = {}): { id: string; body: string; headers: Record<string, string> } {
    const row = this.stockRows(this.company(opts.companyId), warehouseId).find((r) => r.sku === sku);
    if (!row) throw new Error(`the practice ERP has no stock for ${sku} in ${warehouseId}`);
    return this.webhook(secret, 'stock.changed', { ...row, updatedAt: row.updatedAt.toISOString() }, opts.id);
  }

  /** PR 196 — a signed `variant.changed` webhook for one variant, as it is now. */
  variantChangedWebhook(secret: string, sku: string, opts: { id?: string; companyId?: string } = {}): { id: string; body: string; headers: Record<string, string> } {
    const v = this.company(opts.companyId).variants.get(sku);
    if (!v) throw new Error(`the practice ERP has no variant ${sku}`);
    return this.webhook(secret, 'variant.changed', { ...v, updatedAt: v.updatedAt.toISOString() }, opts.id);
  }

  private webhook(secret: string, type: string, data: unknown, id = `evt_${randomBytes(8).toString('hex')}`) {
    const now = this.now();
    return { id, ...signedErpWebhook(secret, { id, type, occurredAt: now.toISOString(), data }, now) };
  }

  /** Switches a failure on for the next `times` matching calls (default 1). */
  failNext(f: MockFailure): void {
    this.failures.push({ times: 1, ...f });
  }

  private takeFailure(path: string): MockFailure | null {
    const list = this.failures;
    const i = list.findIndex((f) => !f.path || path.includes(f.path));
    if (i < 0) return null;
    const f = list[i]!;
    if (f.skip) {
      f.skip--;
      return null;
    }
    f.times = (f.times ?? 1) - 1;
    if (f.times <= 0) list.splice(i, 1);
    return f;
  }

  /** The practice ERP's HTTP side, as a fetch function. */
  readonly fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const path = url.pathname.startsWith(ERP_API_BASE_PATH) ? url.pathname.slice(ERP_API_BASE_PATH.length) : url.pathname;
    const query = Object.fromEntries(url.searchParams);
    const auth = new Headers(init.headers).get('authorization') ?? '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const companyId = this.keys.get(key) ?? null;
    const log = (status: number) => this.calls.push({ method, path, query, companyId, status });

    const f = this.takeFailure(path);
    if (f?.delayMs && !f.lose) await wait(f.delayMs, init.signal);
    if (f?.network) {
      log(0);
      throw new TypeError('fetch failed: connection reset by the practice ERP');
    }
    if (f?.rawBody !== undefined) {
      log(200);
      return new Response(f.rawBody, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (f?.status) {
      log(f.status);
      return problem(f.status, 'PRACTICE_FAILURE', `practice failure ${f.status}`, null, f.retryAfterSeconds !== undefined ? { 'retry-after': String(f.retryAfterSeconds) } : {});
    }

    if (!url.pathname.startsWith(ERP_API_BASE_PATH)) {
      log(404);
      return problem(404, 'NOT_FOUND', 'no such endpoint');
    }
    if (!companyId) {
      log(401);
      return problem(401, 'UNAUTHORIZED', 'the API key is not valid');
    }
    const c = this.company(companyId);
    let res: Response;
    if (method === 'GET') res = this.route(c, path, query);
    else if (method === 'POST' || method === 'PATCH' || method === 'PUT') res = this.write(c, method, path, init.body, new Headers(init.headers).get('idempotency-key'));
    else res = problem(405, 'METHOD_NOT_ALLOWED', 'the practice ERP does not answer this method');
    log(res.status);
    if (f?.lose === 'network') throw new TypeError('fetch failed: the practice ERP dropped the answer');
    if (f?.lose === 'timeout') await wait(f.delayMs ?? 0, init.signal);
    return res;
  };

  /** A write (PR 199, 200): Idempotency-Key required; a repeat with the same key and body returns the first answer. */
  private write(c: Company, method: string, path: string, raw: RequestInit['body'], key: string | null): Response {
    if (!key) return problem(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required on every write');
    let body: unknown;
    try {
      body = JSON.parse(typeof raw === 'string' ? raw : '');
    } catch {
      return problem(400, 'INVALID_JSON', 'the body is not JSON');
    }
    const bodyHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const prev = c.idempotency.get(key);
    if (prev) {
      if (prev.method !== method || prev.path !== path || prev.bodyHash !== bodyHash) return problem(422, 'IDEMPOTENCY_MISMATCH', 'this Idempotency-Key was used for another request');
      return json(prev.status, prev.answer, { [IDEMPOTENT_REPLAY_HEADER]: 'true' });
    }
    const out = this.applyWrite(c, method, path, body);
    if (out.status < 500) c.idempotency.set(key, { method, path, bodyHash, status: out.status, answer: out.answer });
    return json(out.status, out.answer);
  }

  private applyWrite(c: Company, method: string, path: string, body: unknown): { status: number; answer: unknown } {
    const err = (status: number, code: string, message: string, details: unknown = null) => ({ status, answer: { error: { code, message, details } } });
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const v6 = this.v6Write(c, method, path, b);
    if (v6) return v6;
    if (method === 'POST' && path === '/orders') {
      const ext = typeof b.externalOrderId === 'string' ? b.externalOrderId : '';
      const items = Array.isArray(b.items) ? (b.items as { sku?: unknown; quantity?: unknown }[]) : [];
      if (!ext || !items.length || items.some((i) => typeof i.sku !== 'string' || !Number.isInteger(i.quantity) || (i.quantity as number) < 1)) {
        return err(400, 'INVALID_ORDER', 'an order needs externalOrderId and items with sku and quantity');
      }
      const known = c.orders.get(ext);
      if (known) return err(409, 'DUPLICATE_EXTERNAL_ORDER', 'this externalOrderId is already an order', [known.erpOrderId]);
      // The ERP's own reservation: from the first warehouse with enough available, else 409 with the short SKUs.
      const picks: { sku: string; quantity: number; warehouseId: string }[] = [];
      const short: string[] = [];
      for (const i of items) {
        const sku = i.sku as string;
        const qty = i.quantity as number;
        const wh = c.warehouses.find((w) => {
          const cell = c.stock.get(sku)?.get(w.id);
          return cell && cell.onHand - cell.reserved >= qty;
        });
        if (wh) picks.push({ sku, quantity: qty, warehouseId: wh.id });
        else short.push(sku);
      }
      if (short.length) return err(409, 'STOCK_SHORT', 'not enough stock', short);
      for (const p of picks) this.adjustStock(p.sku, p.warehouseId, { reserved: p.quantity }, c.id);
      const order: MockOrder = { erpOrderId: `SAMPLE-SO-${c.orders.size + 1}`, externalOrderId: ext, status: 'CONFIRMED', items: picks, body };
      c.orders.set(ext, order);
      return { status: 201, answer: { erpOrderId: order.erpOrderId, externalOrderId: ext, status: order.status } };
    }
    const m = /^\/orders\/(.+)$/.exec(path);
    if (method === 'PATCH' && m) {
      const order = c.orders.get(decodeURIComponent(m[1]!));
      if (!order) return err(404, 'ORDER_NOT_FOUND', 'no such order');
      const status = typeof b.status === 'string' ? b.status : '';
      if (!['PROCESSING', 'PACKED', 'CANCELLED', 'DELIVERED', 'RETURNED'].includes(status)) return err(400, 'INVALID_STATUS', 'not a status the contract knows');
      const was = order.status;
      const open = was !== 'CANCELLED' && was !== 'DELIVERED' && was !== 'RETURNED';
      for (const p of order.items) {
        if (status === 'CANCELLED' && open) this.adjustStock(p.sku, p.warehouseId, { reserved: -p.quantity }, c.id);
        if (status === 'DELIVERED' && open) this.adjustStock(p.sku, p.warehouseId, { onHand: -p.quantity, reserved: -p.quantity }, c.id);
      }
      order.status = status;
      return { status: 200, answer: { erpOrderId: order.erpOrderId, externalOrderId: order.externalOrderId, status } };
    }
    if (method === 'POST' && path === '/returns') {
      const ext = typeof b.externalOrderId === 'string' ? b.externalOrderId : '';
      const items = Array.isArray(b.items) ? (b.items as { sku?: unknown; quantity?: unknown; qc?: unknown }[]) : [];
      if (!ext || !items.length || items.some((i) => typeof i.sku !== 'string' || !Number.isInteger(i.quantity) || (i.quantity as number) < 1 || i.qc !== 'good')) {
        return err(400, 'INVALID_RETURN', 'a return needs externalOrderId and items with sku, quantity and qc "good"');
      }
      const order = c.orders.get(ext);
      if (!order) return err(404, 'ORDER_NOT_FOUND', 'no such order');
      const back = items.map((i) => ({ sku: i.sku as string, quantity: i.quantity as number, warehouseId: order.items.find((p) => p.sku === i.sku)?.warehouseId ?? c.warehouses[0]!.id }));
      for (const p of back) this.adjustStock(p.sku, p.warehouseId, { onHand: p.quantity }, c.id);
      const erpReturnId = `SAMPLE-RT-${c.returns.length + 1}`;
      c.returns.push({ erpReturnId, externalOrderId: ext, items: back });
      return { status: 201, answer: { erpReturnId, externalOrderId: ext } };
    }
    return err(404, 'NOT_FOUND', 'the practice ERP does not take this document yet');
  }

  /** PR 607 — the v6 writes; null when the call is not a v6 one (the v5 handlers take it). */
  private v6Write(c: Company, method: string, path: string, b: Record<string, unknown>): { status: number; answer: unknown } | null {
    const v6 = c.v6;
    const gone = (code: string, message: string) => ({ status: 410, answer: { error: { code, message, details: null } } });
    if (v6.switched && method === 'POST' && (path === '/payments' || path === '/returns' || path === '/ad-spend' || /^\/shipments\/[^/]+\/events$/.test(path))) return gone('GONE', 'retired on the switch date');
    if (method === 'POST' && path === '/orders' && v6.isV6Order(b)) return v6.createOrder(b);
    if (method === 'POST' && path === '/shipments') return v6.shipment(b);
    if (method === 'POST' && path === '/return-lists') return v6.returnList(b);
    let m = /^\/orders\/([^/]+)\/delivery$/.exec(path);
    if (method === 'PUT' && m) return v6.delivery(decodeURIComponent(m[1]!), b);
    m = /^\/orders\/([^/]+)\/lines\/([^/]+)$/.exec(path);
    if (method === 'PATCH' && m) return v6.lineDecision(decodeURIComponent(m[1]!), decodeURIComponent(m[2]!), b);
    m = /^\/orders\/([^/]+)$/.exec(path);
    if (method === 'PATCH' && m) {
      const status = typeof b.status === 'string' ? b.status : '';
      if (v6.switched && (status === 'DELIVERED' || status === 'RETURNED')) return gone('USE_DELIVERY_RESULT', 'use PUT /orders/{id}/delivery');
      const o = v6.orders.get(decodeURIComponent(m[1]!));
      if (o) {
        const r = v6.status(o, status);
        if (r) return r;
        if (status) o.status = status;
        return { status: 200, answer: { erpOrderId: o.erpOrderId, externalOrderId: o.externalOrderId, status: o.status } };
      }
    }
    m = /^\/exchanges\/([^/]+)\/late-return$/.exec(path);
    if (method === 'POST' && m) return v6.lateReturn(decodeURIComponent(m[1]!), b);
    m = /^\/daily-summaries\/([^/]+)$/.exec(path);
    if (method === 'PUT' && m) return v6.putSummary(decodeURIComponent(m[1]!), b);
    m = /^\/fixed-costs\/([^/]+)$/.exec(path);
    if (method === 'PUT' && m) return v6.putFixedCosts(decodeURIComponent(m[1]!), b);
    return null;
  }

  /** PR 607 — the v6 reads; null when the path is not a v6 one. */
  private v6Route(c: Company, path: string, query: Record<string, string>): Response | null {
    const v6 = c.v6;
    const out = (a: { status: number; answer: unknown }) => json(a.status, a.answer);
    if (path === '/account') return out(v6.account(query));
    if (path === '/returns/summary') return out(v6.returnsSummary(query.date ?? ''));
    if (path === '/returns/claims') return out(v6.claims(query));
    if (path === '/daily-summaries') return out(v6.storedSummaries(query));
    if (path === '/fixed-costs') return out(v6.fixedCostMonths());
    if (path === '/cost-of-goods') return out(v6.costOfGoods(query));
    if (path === '/returns' || path === '/exchanges') {
      const since = query.updatedSince ? new Date(query.updatedSince) : null;
      if (since && Number.isNaN(since.getTime())) return problem(400, 'INVALID_QUERY', 'updatedSince is not a date');
      const offset = decodeCursor(query.cursor ?? null);
      if (offset === null) return problem(400, 'INVALID_CURSOR', 'the cursor is not valid');
      const size = Math.min(LARGEST_PAGE, Math.max(1, Number(query.limit) || LARGEST_PAGE));
      let list: Record<string, unknown>[];
      let extra: Record<string, unknown> = {};
      if (path === '/returns') list = v6.returnsSince(since);
      else {
        const all = [...v6.exchanges.values()].map((x) => v6.exchangeView(x));
        const pending = all.filter((x) => !['SETTLED', 'BILLED', 'CREDITED', 'CANCELLED'].includes(String(x.status)));
        list = (query.status === 'pending' ? pending : all).filter((x) => !since || new Date(String(x.updatedAt)).getTime() >= since.getTime());
        extra = { totalAtRisk: pending.reduce((s, x) => s + Number(x.atRisk), 0) };
      }
      const items = list.slice(offset, offset + size);
      return json(200, { items, nextCursor: offset + size < list.length ? encodeCursor(offset + size) : null, ...extra });
    }
    const m = /^\/orders\/([^/]+)$/.exec(path);
    if (m) return out(v6.getOrder(decodeURIComponent(m[1]!)));
    return null;
  }

  private route(c: Company, path: string, query: Record<string, string>): Response {
    const v6 = this.v6Route(c, path, query);
    if (v6) return v6;
    if (path === '/health') {
      return json(200, { companyId: c.id, companyName: c.name, integrationName: c.integrationName, warehouseId: c.warehouses[0]?.id ?? null });
    }
    if (path === '/stock' || path === '/catalog/variants') {
      const since = query.updatedSince ? new Date(query.updatedSince) : null;
      if (since && Number.isNaN(since.getTime())) return problem(400, 'INVALID_QUERY', 'updatedSince is not a date');
      const offset = decodeCursor(query.cursor ?? null);
      if (offset === null) return problem(400, 'INVALID_CURSOR', 'the cursor is not valid');
      const size = Math.min(LARGEST_PAGE, Math.max(1, Number(query.limit) || LARGEST_PAGE));
      const style = (query.styleCode ?? '').trim().toUpperCase();
      const all = path === '/stock' ? this.stockRows(c, query.warehouseId ?? null) : [...c.variants.values()].filter((v) => !style || (v.styleCode ?? '').toUpperCase() === style);
      const list = all
        .filter((r) => !since || r.updatedAt.getTime() >= since.getTime())
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || keyOf(a).localeCompare(keyOf(b)));
      const items = list.slice(offset, offset + size);
      const next = offset + size < list.length ? encodeCursor(offset + size) : null;
      return json(200, { items, nextCursor: next });
    }
    const m = /^\/stock\/(.+)$/.exec(path);
    if (m) {
      const sku = decodeURIComponent(m[1]!);
      const bySku = c.stock.get(sku);
      if (!bySku) return problem(404, 'SKU_NOT_FOUND', 'no such SKU', [sku]);
      return json(200, { sku, warehouses: this.stockRows(c, null).filter((r) => r.sku === sku).map(({ sku: _s, ...w }) => w) });
    }
    return problem(404, 'NOT_FOUND', 'no such endpoint');
  }

  private stockRows(c: Company, warehouseId: string | null) {
    const out: { sku: string; warehouseId: string; onHand: number; reserved: number; available: number; grade: ErpGrade; fromReturnStock: number; updatedAt: Date }[] = [];
    for (const [sku, byWh] of c.stock) {
      for (const [wh, cell] of byWh) {
        if (warehouseId && wh !== warehouseId) continue;
        out.push({ sku, warehouseId: wh, onHand: cell.onHand, reserved: cell.reserved, available: cell.onHand - cell.reserved + cell.ret, grade: c.variants.get(sku)?.grade ?? 'A', fromReturnStock: cell.ret, updatedAt: cell.updatedAt });
      }
    }
    return out;
  }
}

const keyOf = (r: { sku: string; warehouseId?: string }) => `${r.sku}\u0000${r.warehouseId ?? ''}`;

const holder = globalThis as unknown as { __practiceErp?: MockErpWorld };

/** The practice ERP of this process (the ERP adapter's MOCK mode uses it). */
export function mockErp(): MockErpWorld {
  holder.__practiceErp ??= new MockErpWorld();
  return holder.__practiceErp;
}
