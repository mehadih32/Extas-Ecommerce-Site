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
// - webhooks (PR 196): it can send signed `stock.changed` / `variant.changed` events of its own state, with the
//   webhook secret a test or a developer gives it (never one of its own).
//
// It starts with sample companies and warehouses and **no stock**: nothing it says can reach a real shop's stock
// unless someone puts stock into it (the tests, or a developer). Keys are random per process, never written down.
import { createHash, randomBytes } from 'node:crypto';
import { ERP_API_BASE_PATH, IDEMPOTENT_REPLAY_HEADER, type FetchLike } from './http-client';
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
  active?: boolean;
  updatedAt?: Date;
}

interface Company extends MockCompanySpec {
  stock: Map<string, Map<string, StockCell>>;
  variants: Map<string, Required<MockVariant>>;
  orders: Map<string, MockOrder>;
  /** Idempotency-Key → the first answer (contract: "a repeat returns the first result"). */
  idempotency: Map<string, IdempotencyRecord>;
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
  private failures: MockFailure[] = [];
  readonly calls: MockCall[] = [];
  now: () => Date = () => new Date();

  constructor(companies: MockCompanySpec[] = sampleMockCompanies()) {
    this.load(companies);
  }

  private load(companies: MockCompanySpec[]) {
    this.companies.clear();
    this.keys.clear();
    for (const c of companies) {
      this.companies.set(c.id, { ...c, warehouses: c.warehouses.map((w) => ({ ...w })), stock: new Map(), variants: new Map(), orders: new Map(), idempotency: new Map() });
      this.keys.set(randomBytes(18).toString('base64url'), c.id);
    }
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

  setStock(sku: string, warehouseId: string, cell: { onHand: number; reserved?: number; updatedAt?: Date }, companyId?: string): void {
    const c = this.company(companyId);
    if (!c.warehouses.some((w) => w.id === warehouseId)) throw new Error(`company ${c.id} has no warehouse ${warehouseId}`);
    const bySku = c.stock.get(sku) ?? new Map<string, StockCell>();
    bySku.set(warehouseId, { onHand: cell.onHand, reserved: cell.reserved ?? 0, updatedAt: cell.updatedAt ?? this.now() });
    c.stock.set(sku, bySku);
  }

  /** Moves stock like the ERP would (a sale, a receipt): onHand changes and `updatedAt` becomes now. */
  adjustStock(sku: string, warehouseId: string, delta: { onHand?: number; reserved?: number }, companyId?: string): void {
    const cur = this.company(companyId).stock.get(sku)?.get(warehouseId) ?? { onHand: 0, reserved: 0, updatedAt: this.now() };
    this.setStock(sku, warehouseId, { onHand: cur.onHand + (delta.onHand ?? 0), reserved: cur.reserved + (delta.reserved ?? 0), updatedAt: this.now() }, companyId);
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
      active: v.active ?? true,
      updatedAt: v.updatedAt ?? this.now(),
    });
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
    else if (method === 'POST' || method === 'PATCH') res = this.write(c, method, path, init.body, new Headers(init.headers).get('idempotency-key'));
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
    return err(404, 'NOT_FOUND', 'the practice ERP does not take this document yet');
  }

  private route(c: Company, path: string, query: Record<string, string>): Response {
    if (path === '/health') {
      return json(200, { companyId: c.id, companyName: c.name, integrationName: c.integrationName, warehouseId: c.warehouses[0]?.id ?? null });
    }
    if (path === '/stock' || path === '/catalog/variants') {
      const since = query.updatedSince ? new Date(query.updatedSince) : null;
      if (since && Number.isNaN(since.getTime())) return problem(400, 'INVALID_QUERY', 'updatedSince is not a date');
      const offset = decodeCursor(query.cursor ?? null);
      if (offset === null) return problem(400, 'INVALID_CURSOR', 'the cursor is not valid');
      const size = Math.min(LARGEST_PAGE, Math.max(1, Number(query.limit) || LARGEST_PAGE));
      const all = path === '/stock' ? this.stockRows(c, query.warehouseId ?? null) : [...c.variants.values()];
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
    const out: { sku: string; warehouseId: string; onHand: number; reserved: number; available: number; updatedAt: Date }[] = [];
    for (const [sku, byWh] of c.stock) {
      for (const [wh, cell] of byWh) {
        if (warehouseId && wh !== warehouseId) continue;
        out.push({ sku, warehouseId: wh, onHand: cell.onHand, reserved: cell.reserved, available: cell.onHand - cell.reserved, updatedAt: cell.updatedAt });
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
