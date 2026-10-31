// CN-028 · CN-029 Phase 2 · PR 621 — the ERP v6 acceptance checks (docs/erp/site-changes-v6.md §4), run through the
// adapter only, so the same list runs against the practice ERP in CI and against the demo ERP on the server:
//
// - `runErpAcceptance(api, opts)` runs every check in `ERP_ACCEPTANCE_CHECKS` and answers a report (each check PASS,
//   FAIL or SKIP with why). Nothing here reads the shop's database: the shop-side drills (the tie formula, a lost or
//   doubled webhook, an outage, a closed day that moves …) are the books drills of @extas/inventory's acceptance test.
// - A check of kind `read` only reads the ERP. A `write` check makes its own sample orders, deliveries, return lists,
//   summaries and fixed costs, with ids that start `ACC-<run>-`, so two runs never meet; it runs only with
//   `writes: true` (CI against the practice ERP; on the demo ERP only when `erp.acceptance.demoWrites` is on).
// - A `driver` check needs the ERP's own action (the owner deciding a returned piece, the night run after an exchange
//   deadline, a hold, the switch date). Only the practice ERP offers a driver; against the demo ERP these are SKIP
//   "needs the ERP's own action", never a failure and never faked.
// - The catalogue the checks use is found, not assumed: A-grade SKUs with a shop price and stock, and one B-grade SKU
//   (`findFixture`). With a driver the practice ERP is given its own sample style first. Every expected figure is
//   worked out from the shop prices the ERP itself reported, in whole minor units (no float sums).
// - Every call carries the run's time-out. The report says `keyRefused` when the ERP refuses the key on the first call
//   (health), and `unreachable` when the ERP could not be reached, so the caller can tell "down" or "the key is wrong"
//   (the owner's to fix) from "the ERP answers wrongly".
// - qa-gate B1: against the demo ERP (target `demo`) a time-out, a network error, a 5xx, a 429 or a 404 (a call the demo
//   ERP has not deployed yet) is an outage, never a failure: that check is SKIP "could not be reached" and the report
//   says `unreachable`, the same in every check (the first call, the catalogue read, a refusal a check waits for).
//   Only a wrong figure or an answer that breaks the contract (BAD_RESPONSE) fails the run. Against the practice ERP
//   in CI every error stays a FAIL: that run is the hard gate.
// - CN-033 (1): the ERP decided on 30 Oct 2026 not to build the switch-over list (`GET /switch-over`) nor
//   `GET /cost-of-goods`. With `switchOver: 'fresh-start'` (the shop's `erp.switchOver.mode` as it ships) those two
//   checks are SKIP "not built in the ERP" and never asked, on every target; `erp-list` (the default here, the
//   earlier way) reads them as before.
// - CN-033 (2): B-grade order lines answer 422 at the ERP until its own release, so `orders.billAtShipment` sends its
//   B-grade line only with `bGradeOpen: true` (the shop's `erp.orders.bGradeOpen`, off as it ships).
import { verifyErpRequest, signErpRequest } from './signature';
import { identifyPartial, type PracticeErpV6 } from './mock-erp-v6';
import type { MockErpWorld } from './mock-erp';
import { ErpError, toErpError, type ErpApi, type ErpErrorCode, type ErpDocument, type ErpPushResult, type ErpStockRow, type ErpVariantRow } from './contract';
import type { ErpOrderLineV6, ErpSalesOrderV6, ErpV6Reads } from './v6';

/** The vault name of the demo shop's key (installation-wide), typed by the owner on Settings → ERP link; never in Git. */
export const ERP_ACCEPTANCE_DEMO_KEY = 'erpAcceptance.demoApiKey';

export type AcceptanceKind = 'read' | 'write' | 'driver' | 'local';
export type AcceptanceStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface AcceptanceCheck {
  id: string;
  /** The §4 heading it belongs to. */
  area: string;
  kind: AcceptanceKind;
  title: string;
}

export interface AcceptanceResult extends AcceptanceCheck {
  status: AcceptanceStatus;
  /** Why it failed or was skipped, or a remark on a pass (never a key or a customer). */
  note: string | null;
  ms: number;
}

export interface AcceptanceReport {
  /** `practice` (the mock ERP) or `demo`. */
  target: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  /** The first call (health) could not reach the ERP (every check is SKIP), or, on the demo ERP, a later call hit an
   *  outage or a call the ERP does not have yet (those checks are SKIP; qa-gate B1). */
  unreachable: boolean;
  /** The ERP refused the key (401 / 403) on the first call: every check is SKIP; the owner types the key again. */
  keyRefused: boolean;
  writes: boolean;
  driver: boolean;
  passed: number;
  failed: number;
  skipped: number;
  results: AcceptanceResult[];
}

/** The ERP's own actions, offered only by the practice ERP. */
export interface AcceptanceDriver {
  world: MockErpWorld;
  v6: PracticeErpV6;
  /** Moves the ERP's clock on by whole days. */
  days(n: number): void;
}

export interface AcceptanceOptions {
  target: string;
  /** Prefix of every sample id this run makes (`ACC-<runId>-…`). */
  runId: string;
  writes: boolean;
  driver?: AcceptanceDriver | null;
  timeoutMs: number;
  /** Only these check ids (all when absent). */
  only?: readonly string[];
  now?: () => Date;
  /** How the shop switches (`erp.switchOver.mode`, CN-033): on a fresh start the ERP's switch-over reads are not
   *  built, so their checks are SKIP and never called. Absent: `erp-list` (the checks as first written). */
  switchOver?: 'fresh-start' | 'erp-list';
  /** B-grade order lines are open (`erp.orders.bGradeOpen`, CN-033): only then does an order check send a B line. */
  bGradeOpen?: boolean;
}

/** The test list, in the order of §4. */
export const ERP_ACCEPTANCE_CHECKS: readonly AcceptanceCheck[] = [
  { id: 'contract.health', area: 'contract', kind: 'read', title: 'The key is accepted and names its ERP company' },
  { id: 'catalog.styleImport', area: 'catalog', kind: 'read', title: 'Import by style code: every SKU with grade and shop price; no retailPrice or avgCost after the switch' },
  { id: 'orders.billAtShipment', area: 'orders', kind: 'write', title: 'An A + B order is quoted at the shop prices (erpTotal) and billed only when the shipment is recorded, once' },
  { id: 'orders.cancelNeverBilled', area: 'orders', kind: 'write', title: 'An order cancelled before its shipment is never billed' },
  { id: 'deliveries.partialGreen', area: 'partial deliveries', kind: 'write', title: '850 / 1190 / 980 with 1310 collected, and 1110 with a phone discount of 200, both GREEN with 1190 kept' },
  { id: 'returnLists.handBack', area: 'return lists', kind: 'write', title: 'Three parcels, one ORANGE: two to Return stock, one on Hold, balance unchanged; short count accepted; refusals; the same list twice changes nothing' },
  { id: 'checks.approveDecline', area: 'checks', kind: 'driver', title: 'Two pieces approved and one declined: credits once at the price paid; the returns summary agrees' },
  { id: 'returnStock.packingShort', area: 'return stock', kind: 'driver', title: 'A Return-stock piece fills an order; a failed packing check makes the line short; REPLACE and CANCEL' },
  { id: 'exchanges.watch', area: 'exchanges', kind: 'write', title: 'An exchange bills nothing and is watched with its amount at risk until 4 days after delivery; a second one on the same line is refused' },
  { id: 'exchanges.settled', area: 'exchanges', kind: 'driver', title: 'The old piece back on day 3 and approved: settled for the difference only' },
  { id: 'exchanges.neverBack', area: 'exchanges', kind: 'driver', title: 'The old piece never back: billed in full after the deadline; a late approved return credits it, net the difference' },
  { id: 'exchanges.refused', area: 'exchanges', kind: 'write', title: 'The customer refuses the exchange parcel: not billed and not cancelled, the new piece watched; on the practice ERP, billed in full after the deadline and credited after a late approved return' },
  { id: 'exchanges.chain', area: 'exchanges', kind: 'driver', title: 'An exchange of an exchange (650 → 700 → 720), both old pieces approved, ends at 720; short stock is refused, a new key goes through later' },
  { id: 'summaries.replace', area: 'daily summaries', kind: 'write', title: 'A summary with incomplete ads, then the full day again: a new version replaces it' },
  { id: 'fixedCosts.spread', area: 'fixed costs', kind: 'write', title: '71500 for a 30-day month is 2383.33 a day, and the month reads back whole' },
  { id: 'account.holdRelease', area: 'account', kind: 'driver', title: 'On hold new orders are refused (the shop queues them); after the release they go through' },
  { id: 'account.period', area: 'account', kind: 'read', title: "The month's statement adds up: opening + bills + exchanges + other − credits − payments = closing" },
  { id: 'oldCalls.gone', area: 'old calls', kind: 'driver', title: 'After the switch date the retired v5 calls answer 410' },
  { id: 'switchOver.read', area: 'switch-over', kind: 'read', title: "The switch-over list reads: a status, and once done the date, the moved orders and the one transfer" },
  { id: 'costOfGoods.read', area: 'switch-over', kind: 'read', title: 'The cost of goods by day and SKU reads, never negative' },
  { id: 'siteCalls.signature', area: 'calls to the site', kind: 'local', title: 'A call to the site with a bad signature, or more than 5 minutes old, is refused' },
];

class Skip extends Error {}
class Fail extends Error {}

/** qa-gate B1: the errors that mean "the demo ERP could not be reached" (or has no such call yet), never a wrong answer. */
const OUTAGE: ReadonlySet<ErpErrorCode> = new Set<ErpErrorCode>(['TIMEOUT', 'NETWORK', 'SERVER', 'RATE_LIMITED', 'NOT_FOUND']);
/** Only a real ERP error counts: a bug of ours (a TypeError …) is never hidden as an outage. */
export const isErpOutage = (e: unknown): e is ErpError => e instanceof ErpError && OUTAGE.has(e.code);
/** The target whose outages are SKIP; every other target (the practice ERP in CI) stays the hard gate. */
const SOFT_TARGET = 'demo';
/** CN-033: the checks of the switch-over reads the ERP does not build, and why they are SKIP on a fresh start. */
const NOT_BUILT_ON_FRESH_START: ReadonlySet<string> = new Set(['switchOver.read', 'costOfGoods.read']);
const NOT_BUILT_NOTE = 'not built in the ERP (decision 30 Oct 2026); this shop switches as a fresh start';
const outageNote = (x: ErpError) => `the demo ERP could not be reached or does not have this call yet (${x.code}${x.status ? ` ${x.status}` : ''})`;

const minor = (text: string | number | null | undefined): number => Math.round(Number(text ?? 0) * 100);
const day = (d: Date) => new Date(d.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function expectEq(what: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Fail(`${what}: got ${g}, expected ${w}`);
}
function expectTrue(what: string, ok: boolean): void {
  if (!ok) throw new Fail(what);
}

/** The SKUs the write checks use, found in the ERP's own catalogue. */
export interface AcceptanceFixture {
  styleCode: string;
  /** Three A-grade SKUs with a shop price and stock. */
  a: { sku: string; shopMinor: number }[];
  /** One B-grade SKU with a shop price and stock, when there is one. */
  b: { sku: string; shopMinor: number } | null;
}

const SAMPLE_STYLE = 'ACC-STYLE';

/** Gives the practice ERP its own sample style (prices of §4's examples), so the driver checks have known figures. */
export function seedAcceptanceStyle(d: Pick<AcceptanceDriver, 'world'>): void {
  const rows: [string, string, string, number, 'A' | 'B'][] = [
    ['ACC-STYLE-NAVY-M', 'NAVY', 'M', 650, 'A'],
    ['ACC-STYLE-NAVY-L', 'NAVY', 'L', 700, 'A'],
    ['ACC-STYLE-NAVY-XL', 'NAVY', 'XL', 720, 'A'],
    ['ACC-STYLE-NAVY-M-B', 'NAVY', 'M', 400, 'B'],
  ];
  const wh = d.world.company().warehouses[0]?.id ?? 'SAMPLE-WH-1';
  for (const [sku, color, size, shopPrice, grade] of rows) {
    d.world.setVariant({ sku, styleCode: SAMPLE_STYLE, styleName: 'Acceptance sample', color, size, shopPrice, grade });
    d.world.setStock(sku, wh, { onHand: 40 });
  }
}

/** Finds a style with three A-grade SKUs (shop price, stock) and, when there is one, a B-grade SKU. */
export async function findFixture(api: ErpApi, o: { timeoutMs: number; minStock: number; maxPages?: number }): Promise<AcceptanceFixture | null> {
  const byStyle = new Map<string, ErpVariantRow[]>();
  let cursor: string | null = null;
  for (let page = 0; page < (o.maxPages ?? 20); page++) {
    const p = await api.variants({ limit: 200, cursor }, { timeoutMs: o.timeoutMs }); // hardcode-ok: a page size of the acceptance read, not a business limit
    for (const v of p.items) if (v.active && v.styleCode && v.shopPrice != null && minor(v.shopPrice) > 0) byStyle.set(v.styleCode, [...(byStyle.get(v.styleCode) ?? []), v]);
    cursor = p.nextCursor;
    if (!cursor) break;
  }
  const avail = async (sku: string) => (await api.stockForSku(sku, { timeoutMs: o.timeoutMs })).reduce((s: number, r: ErpStockRow) => s + r.available, 0);
  const styles = [...byStyle.entries()].sort(([a], [b]) => (a === SAMPLE_STYLE ? -1 : b === SAMPLE_STYLE ? 1 : a.localeCompare(b)));
  for (const [styleCode, rows] of styles) {
    const a: AcceptanceFixture['a'] = [];
    // Cheapest first, so an exchange of the first for the second costs more (§4: 650 → 700 → 720).
    for (const v of rows.filter((r) => (r.grade ?? 'A') === 'A').sort((x, y) => minor(x.shopPrice) - minor(y.shopPrice) || x.sku.localeCompare(y.sku))) {
      if ((await avail(v.sku)) >= o.minStock) a.push({ sku: v.sku, shopMinor: minor(v.shopPrice) });
      if (a.length === 3) break;
    }
    if (a.length < 3) continue;
    let b: AcceptanceFixture['b'] = null;
    for (const v of rows.filter((r) => r.grade === 'B')) {
      if ((await avail(v.sku)) >= 1) {
        b = { sku: v.sku, shopMinor: minor(v.shopPrice) };
        break;
      }
    }
    return { styleCode, a, b };
  }
  return null;
}

interface Ctx {
  api: ErpApi & { v6: ErpV6Reads };
  o: AcceptanceOptions;
  d: AcceptanceDriver | null;
  fx: AcceptanceFixture | null;
  /** Why the catalogue read failed, when it did. */
  fxError: unknown;
  switched: boolean;
  seq: number;
}

const call = (c: Ctx) => ({ timeoutMs: c.o.timeoutMs });
const ext = (c: Ctx, name: string) => `ACC-${c.o.runId}-${name}`;
const today = (c: Ctx) => day(c.o.now?.() ?? new Date());
const push = (c: Ctx, doc: ErpDocument, key?: string): Promise<ErpPushResult> => c.api.push(doc, { idempotencyKey: key ?? `acc-${c.o.runId}-${++c.seq}`, timeoutMs: c.o.timeoutMs });
const line = (lineId: string, sku: string, customerPrice: number, extra: Partial<ErpOrderLineV6> = {}): ErpOrderLineV6 => ({ lineId, sku, quantity: 1, grade: 'A', unitPrice: `${customerPrice}.00`, discount: '0.00', customerPrice, comboId: null, ...extra });
const orderDoc = (id: string, items: ErpOrderLineV6[], extra: Partial<ErpSalesOrderV6> = {}): ErpDocument => ({
  type: 'order.create',
  body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: id, customerName: 'Acceptance sample', customerPhone: '01700000000', shippingAddress: 'Acceptance sample address', paymentMethod: 'COD', note: 'ERP acceptance check (sample)', items, deliveryCharge: 0, advancePaid: 0, ...extra }, // hardcode-ok: a made-up sample order of the acceptance check (no real customer)
});
const ship = (c: Ctx, id: string) => push(c, { type: 'shipment.create', body: { externalOrderId: id, courier: 'PATHAO', consignmentId: `C-${id}`, charge: '60.00', pickedUpAt: `${today(c)}T12:00:00+06:00` } });
const deliver = (c: Ctx, id: string, status: 'DELIVERED' | 'PARTIAL' | 'RETURNED', collected: number, mark?: { keptLines: string[]; discountGiven: number }) =>
  push(c, { type: 'order.delivery', externalOrderId: id, body: { status, courier: 'PATHAO', consignmentId: `C-${id}`, collected, at: `${today(c)}T15:40:00+06:00`, ...(mark ? { mark: { ...mark, phoneConfirmed: true, note: null } } : {}) } });
const handBack = (c: Ctx, listId: string, parcels: { externalOrderId: string; receivedCount?: number }[]) =>
  push(c, { type: 'returnList.create', body: { returnListId: listId, courier: 'PATHAO', handedBackAt: today(c), parcels: parcels.map((p) => ({ consignmentId: `C-${p.externalOrderId}`, ...p })) } });
const balance = async (c: Ctx) => minor((await c.api.v6.account(undefined, call(c))).balance);
async function refused(p: Promise<unknown>): Promise<ErpError> {
  try {
    await p;
  } catch (e) {
    // An outage is not the refusal the check waits for: it goes up to the runner (SKIP on the demo ERP, FAIL in CI).
    if (e instanceof ErpError && !isErpOutage(e)) return e;
    throw e;
  }
  throw new Fail('the ERP took what it should have refused');
}
const fixture = (c: Ctx): AcceptanceFixture => {
  if (c.fxError) throw c.fxError; // the catalogue read itself failed: the runner decides (an outage on the demo ERP is SKIP)
  if (!c.fx) throw new Skip("the ERP's catalogue has no style with three A-grade SKUs that have a shop price and stock");
  return c.fx;
};
/** Takes every piece of a SKU out of the practice ERP's stock (main and Return stock); answers how to put them back. */
function emptyStock(d: AcceptanceDriver, sku: string, keepReturns = false): () => void {
  const wh = d.world.company().warehouses[0]!.id;
  const prev = d.world.company().stock.get(sku)?.get(wh);
  d.world.setStock(sku, wh, { onHand: 0, reserved: 0, ...(keepReturns ? {} : { returnStock: 0 }) });
  return () => d.world.setStock(sku, wh, { onHand: prev?.onHand ?? 0, reserved: prev?.reserved ?? 0, returnStock: keepReturns ? undefined : (prev?.ret ?? 0) });
}
const drv = (c: Ctx): AcceptanceDriver => {
  if (!c.d) throw new Skip("needs the ERP's own action");
  return c.d;
};
/** Places, ships and delivers a one-piece order (the start of every exchange). */
async function delivered(c: Ctx, id: string, sku: string, price: number): Promise<void> {
  await push(c, orderDoc(id, [line(`${id}-1`, sku, price)]));
  await ship(c, id);
  await deliver(c, id, 'DELIVERED', price);
}
const exchangeDoc = (id: string, of: string, sku: string) => orderDoc(id, [line(`${id}-1`, sku, 0, { replacesLineId: `${of}-1` })], { exchange: { ofExternalOrderId: of, note: `Exchange of ${of}, line 1` } });

const CHECKS: Record<string, (c: Ctx) => Promise<string | null | void>> = {
  async 'contract.health'(c) {
    const h = await c.api.health(call(c));
    expectTrue('the ERP names its company', Boolean(h.companyName));
    return h.companyId ? `company ${h.companyId}` : null;
  },

  async 'catalog.styleImport'(c) {
    const fx = fixture(c);
    const rows = await c.api.v6.variantsByStyle(fx.styleCode, call(c));
    expectTrue('the style has SKUs', rows.length > 0);
    expectTrue('every SKU of the style, and only it', rows.every((r) => r.styleCode === fx.styleCode));
    expectTrue('every SKU has its grade and shop price', rows.every((r) => (r.grade === 'A' || r.grade === 'B' || r.grade === undefined) && r.shopPrice != null));
    if (c.switched) expectTrue('no retailPrice or avgCost after the switch', rows.every((r) => r.retailPrice == null && r.avgCost == null));
    else return 'the shop has not switched: retailPrice and avgCost are not checked yet';
  },

  async 'orders.billAtShipment'(c) {
    const fx = fixture(c);
    const [a1] = fx.a;
    // CN-033: a B-grade line only while B grade is open (the ERP answers 422 until its own release).
    const b = c.o.bGradeOpen ? fx.b : null;
    const id = ext(c, 'BILL');
    const before = await balance(c);
    const items = [line(`${id}-1`, a1!.sku, 1190), ...(b ? [line(`${id}-2`, b.sku, 600, { grade: 'B' })] : [])];
    const r = await push(c, orderDoc(id, items));
    const body = r.body as { erpTotal?: number | string; billedAt?: unknown; lines?: { shopPrice: number | string }[] };
    const want = a1!.shopMinor + (b?.shopMinor ?? 0);
    expectEq('erpTotal at the shop prices', minor(body.erpTotal), want);
    expectEq('not billed before the shipment', body.billedAt ?? null, null);
    expectEq('the balance before the shipment', await balance(c), before);
    await ship(c, id);
    await ship(c, id);
    expectEq('billed once at erpTotal when the shipment is recorded', await balance(c), before + want);
    const back = await c.api.v6.order(id, call(c));
    expectTrue('the order reads back billed', back.billedAt != null);
    if (b) return null;
    return c.o.bGradeOpen ? 'no B-grade SKU with stock: the order had one A-grade line' : 'B grade is closed (erp.orders.bGradeOpen off): the order had one A-grade line';
  },

  async 'orders.cancelNeverBilled'(c) {
    const fx = fixture(c);
    const id = ext(c, 'CANCEL');
    const before = await balance(c);
    await push(c, orderDoc(id, [line(`${id}-1`, fx.a[1]!.sku, 1290)]));
    await push(c, { type: 'order.status', externalOrderId: id, body: { status: 'CANCELLED' } });
    expectEq('the balance', await balance(c), before);
    expectEq('never billed', (await c.api.v6.order(id, call(c))).billedAt ?? null, null);
  },

  async 'deliveries.partialGreen'(c) {
    const fx = fixture(c);
    // The ERP identifies the kept piece from the shop's own customer prices; the example's numbers are the shop's.
    const lines = (id: string) => [line(`${id}-1`, fx.a[0]!.sku, 850), line(`${id}-2`, fx.a[1]!.sku, 1190), line(`${id}-3`, fx.a[2]!.sku, 980)];
    const one = ext(c, 'PART1');
    await push(c, orderDoc(one, lines(one)));
    await ship(c, one);
    const r1 = (await deliver(c, one, 'PARTIAL', 1310)).body as { identification?: string; keptLines?: string[] };
    expectEq('1310 collected', [r1.identification, r1.keptLines], ['GREEN', [`${one}-2`]]);
    const two = ext(c, 'PART2');
    await push(c, orderDoc(two, lines(two)));
    await ship(c, two);
    const r2 = (await deliver(c, two, 'PARTIAL', 1110, { keptLines: [], discountGiven: 200 })).body as { identification?: string; keptLines?: string[] }; // hardcode-ok: sample figures of the acceptance check, sent only to a test ERP
    expectEq('1110 with a phone discount of 200', [r2.identification, r2.keptLines], ['GREEN', [`${two}-2`]]);
    // The shop's own reading agrees with the ERP's.
    expectEq("the shop's own reading", identifyPartial(lines(two).map((l) => ({ lineId: l.lineId, sku: l.sku, customerPrice: l.customerPrice, quantity: 1 })), 1110, { advancePaid: 0, discount: 200 }).keptLines, [`${two}-2`]); // hardcode-ok: sample figures of the acceptance check, sent only to a test ERP
  },

  async 'returnLists.handBack'(c) {
    const fx = fixture(c);
    const ids = ['RL1', 'RL2', 'RL3'].map((n) => ext(c, n));
    for (const id of ids) {
      await push(c, orderDoc(id, [line(`${id}-1`, fx.a[0]!.sku, 850), line(`${id}-2`, fx.a[1]!.sku, 1190), line(`${id}-3`, fx.a[2]!.sku, 980)]));
      await ship(c, id);
    }
    await deliver(c, ids[0]!, 'RETURNED', 0);
    await deliver(c, ids[1]!, 'PARTIAL', 1310);
    await deliver(c, ids[2]!, 'PARTIAL', 2500);
    const full = ext(c, 'RL4');
    await push(c, orderDoc(full, [line(`${full}-1`, fx.a[2]!.sku, 1300)]));
    await ship(c, full);
    await deliver(c, full, 'DELIVERED', 1300);
    const before = await balance(c);
    const listId = ext(c, 'LIST');
    const doc: ErpDocument = {
      type: 'returnList.create',
      body: {
        returnListId: listId,
        courier: 'PATHAO',
        handedBackAt: today(c),
        parcels: [
          { consignmentId: `C-${ids[0]}`, externalOrderId: ids[0]!, receivedCount: 2 },
          { consignmentId: `C-${ids[1]}`, externalOrderId: ids[1]! },
          { consignmentId: `C-${ids[2]}`, externalOrderId: ids[2]! },
          { consignmentId: null, externalOrderId: full },
          { consignmentId: null, externalOrderId: ext(c, 'NOT-OURS') },
        ],
      },
    };
    const first = await push(c, doc, `${listId}-key`);
    const rows = (first.body as { parcels?: { externalOrderId: string; result: string; reason: string | null; expectedCount: number | null }[] }).parcels ?? [];
    expectEq(
      'each parcel',
      rows.map((r) => [r.result, r.reason]),
      [
        ['IN_RETURN_STOCK', null],
        ['IN_RETURN_STOCK', null],
        ['HOLD', null],
        ['REFUSED', 'NOT_RETURNED'],
        ['REFUSED', 'NOT_OUR_ORDER'],
      ],
    );
    expectEq('a short count is accepted and shown with what was expected', rows[0]?.expectedCount, 3);
    expectEq("Retail's balance does not change", await balance(c), before);
    const again = await push(c, doc, `${listId}-key`);
    expectEq('the same list twice', JSON.stringify(again.body), JSON.stringify(first.body));
  },

  async 'checks.approveDecline'(c) {
    const d = drv(c);
    const fx = fixture(c);
    const id = ext(c, 'CHECK');
    await push(c, orderDoc(id, [line(`${id}-1`, fx.a[0]!.sku, 850), line(`${id}-2`, fx.a[1]!.sku, 1190), line(`${id}-3`, fx.a[2]!.sku, 980)]));
    await ship(c, id);
    await deliver(c, id, 'RETURNED', 0);
    await handBack(c, ext(c, 'CHECK-RL'), [{ externalOrderId: id, receivedCount: 3 }]);
    const before = await balance(c);
    const [a] = d.v6.decidePiece(id, `${id}-1`, 'APPROVED');
    d.v6.decidePiece(id, `${id}-2`, 'APPROVED');
    const [x] = d.v6.decidePiece(id, `${id}-3`, 'DECLINED', 'B_GRADE');
    expectEq('an approved piece is credited at the shop price', minor((a?.data as { credit?: number }).credit), fx.a[0]!.shopMinor);
    expectEq('a declined piece is credited nothing', minor((x?.data as { credit?: number }).credit), 0);
    expectEq('the balance falls by both credits', await balance(c), before - fx.a[0]!.shopMinor - fx.a[1]!.shopMinor);
    const s = await c.api.v6.returnsSummary(today(c), call(c));
    expectTrue('the returns summary counts them', s.approved >= 2 && s.declined >= 1);
    const pulled = await c.api.v6.returns({ limit: 200 }, call(c)); // hardcode-ok: a page size of the acceptance read, not a business limit
    const ids = pulled.items.flatMap((i) => i.events.map((e) => e.eventId));
    expectTrue('the pull carries the same event ids as the webhooks', ids.includes(a!.eventId) && ids.includes(x!.eventId));
  },

  async 'returnStock.packingShort'(c) {
    const d = drv(c);
    const fx = fixture(c);
    const [p0, p1, p2] = fx.a;
    const back = ext(c, 'RS0');
    await push(c, orderDoc(back, [line(`${back}-1`, p2!.sku, 1300)]));
    await ship(c, back);
    await deliver(c, back, 'RETURNED', 0);
    await handBack(c, ext(c, 'RS-RL'), [{ externalOrderId: back }]);
    const restore = emptyStock(d, p2!.sku, true);
    try {
      const stock = await c.api.stockForSku(p2!.sku, call(c));
      expectTrue('main stock out, one piece in Return stock: still shown', stock.some((s) => s.available >= 1 && (s.fromReturnStock ?? 0) >= 1));
      const id = ext(c, 'RS1');
      const r = await push(c, orderDoc(id, [line(`${id}-1`, p2!.sku, 1300), line(`${id}-2`, p0!.sku, 1190)]));
      expectEq('filled from Return stock', (r.body as { lines: { fromReturnStock: boolean }[] }).lines.map((l) => l.fromReturnStock), [true, false]);
      const evs = d.v6.failPackingCheck(id, `${id}-1`);
      expectEq('a failed packing check', evs.map((e) => e.type), ['return.piece.decided', 'order.line.short']);
      const rep = await push(c, { type: 'order.line', externalOrderId: id, lineId: `${id}-1`, body: { action: 'REPLACE', sku: p1!.sku, grade: 'A' } });
      expectEq('REPLACE gives a new erpTotal', minor((rep.body as { erpTotal: number }).erpTotal), p1!.shopMinor + p0!.shopMinor);
      const can = await push(c, { type: 'order.line', externalOrderId: id, lineId: `${id}-2`, body: { action: 'CANCEL', reason: 'customer agreed' } });
      expectEq('CANCEL drops the line with no bill', minor((can.body as { erpTotal: number }).erpTotal), p1!.shopMinor);
    } finally {
      restore();
    }
  },

  async 'exchanges.watch'(c) {
    const fx = fixture(c);
    const [p0, p1, p2] = fx.a;
    const of = ext(c, 'XW');
    await delivered(c, of, p0!.sku, 1190);
    const before = await balance(c);
    const id = `${of}-X1`;
    const x = await push(c, exchangeDoc(id, of, p1!.sku));
    const body = x.body as { erpTotal?: number; atRisk?: number };
    expectEq('an exchange bills nothing', minor(body.erpTotal), 0);
    expectEq('the new piece is at risk at its shop price', minor(body.atRisk), p1!.shopMinor);
    expectEq('a second exchange on the same line is refused', (await refused(push(c, exchangeDoc(`${of}-X2`, of, p2!.sku)))).erpCode, 'EXCHANGE_OPEN');
    await ship(c, id);
    await deliver(c, id, 'DELIVERED', 0);
    const pending = await c.api.v6.exchanges({ status: 'pending', limit: 200 }, call(c)); // hardcode-ok: a page size of the acceptance read, not a business limit
    const row = pending.items.find((i) => i.externalOrderId === id);
    expectTrue('the exchange is watched', Boolean(row));
    expectEq('the deadline is 4 days after delivery', row!.deadline, row!.deliveredAt ? addDays(row!.deliveredAt, 4) : null);
    expectEq('nothing billed yet', await balance(c), before);
  },

  async 'exchanges.settled'(c) {
    const d = drv(c);
    const fx = fixture(c);
    const of = ext(c, 'XS');
    await delivered(c, of, fx.a[0]!.sku, 1190);
    const id = `${of}-X1`;
    await push(c, exchangeDoc(id, of, fx.a[1]!.sku));
    await ship(c, id);
    await deliver(c, id, 'DELIVERED', 0);
    d.days(3);
    await handBack(c, ext(c, 'XS-RL'), [{ externalOrderId: id }]);
    const evs = d.v6.decidePiece(of, `${of}-1`, 'APPROVED');
    const settled = evs.find((e) => e.type === 'exchange.settled');
    expectTrue('exchange.settled arrives', Boolean(settled));
    expectEq('for the difference only', minor((settled!.data as { amount: number }).amount), Math.abs(fx.a[1]!.shopMinor - fx.a[0]!.shopMinor));
  },

  async 'exchanges.neverBack'(c) {
    const d = drv(c);
    const fx = fixture(c);
    const of = ext(c, 'XN');
    await delivered(c, of, fx.a[0]!.sku, 1190);
    const id = `${of}-X1`;
    await push(c, exchangeDoc(id, of, fx.a[1]!.sku));
    await deliver(c, id, 'DELIVERED', 0);
    d.days(5);
    const night = d.v6.runNight().filter((e) => e.type === 'exchange.billed' && (e.data as { externalOrderId?: string }).externalOrderId === id);
    expectEq('billed in full the night after the deadline', night.map((e) => minor((e.data as { amount: number }).amount)), [fx.a[1]!.shopMinor]);
    const all = await c.api.v6.exchanges({ status: 'all', limit: 500 }, call(c)); // hardcode-ok: a page size of the acceptance read, not a business limit
    const x = all.items.find((i) => i.externalOrderId === id);
    expectTrue('the exchange is listed', Boolean(x));
    await push(c, { type: 'exchange.lateReturn', exchangeId: x!.exchangeId, body: { handedBackAt: today(c), courier: 'PATHAO', returnListId: ext(c, 'XN-RL'), consignmentId: null, note: 'came back late' } });
    const credited = d.v6.decidePiece(of, `${of}-1`, 'APPROVED').find((e) => e.type === 'exchange.credited');
    expectEq('a late approved return is credited at the old price', minor((credited?.data as { amount?: number } | undefined)?.amount), fx.a[0]!.shopMinor);
    const net = d.v6.ledger.filter((r) => r.externalOrderId === id).reduce((s, r) => s + minor(r.amount), 0);
    expectEq('net, the difference', net, fx.a[1]!.shopMinor - fx.a[0]!.shopMinor);
  },

  async 'exchanges.refused'(c) {
    const fx = fixture(c);
    const of = ext(c, 'XR');
    await delivered(c, of, fx.a[0]!.sku, 1190);
    const before = await balance(c);
    const id = `${of}-X1`;
    await push(c, exchangeDoc(id, of, fx.a[1]!.sku));
    await deliver(c, id, 'RETURNED', 0);
    // CN-033 (the ERP's retail loss rule of 30 Oct 2026): the new piece is the shop's until it is back and approved.
    const read = async () => (await c.api.v6.exchanges({ status: 'all', limit: 500 }, call(c))).items.find((i) => i.externalOrderId === id); // hardcode-ok: a page size of the acceptance read, not a business limit
    const x = await read();
    expectTrue('the exchange is listed', Boolean(x));
    expectEq('not cancelled: it waits for the new piece', x!.status, 'WAITING_RETURN');
    expectEq('no delivery day (the parcel was refused)', x!.deliveredAt ?? null, null);
    expectTrue('the new piece has a deadline', Boolean(x!.deadline));
    expectEq('the new piece is at risk at its shop price', minor(x!.atRisk), fx.a[1]!.shopMinor);
    expectEq('no bill yet', await balance(c), before);
    if (!c.d) return "the bill after the deadline and the late credit need the ERP's own action (practice ERP only)";
    const d = c.d;
    d.days(5);
    const night = d.v6.runNight().filter((e) => e.type === 'exchange.billed' && (e.data as { externalOrderId?: string }).externalOrderId === id);
    expectEq('the new piece not back is billed in full the night after the deadline', night.map((e) => [(e.data as { reason?: string }).reason, minor((e.data as { amount: number }).amount)]), [['DEADLINE_PASSED', fx.a[1]!.shopMinor]]);
    expectEq('billed', await balance(c), before + fx.a[1]!.shopMinor);
    await handBack(c, ext(c, 'XR-RL'), [{ externalOrderId: id }]);
    const credited = d.v6.decidePiece(id, `${id}-1`, 'APPROVED').find((e) => e.type === 'exchange.credited');
    expectEq('back late and approved: credited in full', minor((credited?.data as { amount?: number } | undefined)?.amount), fx.a[1]!.shopMinor);
    expectEq('net, nothing', await balance(c), before);
    expectEq('credited', (await read())?.status, 'CREDITED');
  },

  async 'exchanges.chain'(c) {
    const d = drv(c);
    const fx = fixture(c);
    const [p0, p1, p2] = fx.a;
    const of = ext(c, 'XC');
    const before = await balance(c);
    await push(c, orderDoc(of, [line(`${of}-1`, p0!.sku, 1190)]));
    await ship(c, of);
    await deliver(c, of, 'DELIVERED', 1190);
    const x1 = `${of}-X1`;
    await push(c, exchangeDoc(x1, of, p1!.sku));
    await deliver(c, x1, 'DELIVERED', 0);
    const restore = emptyStock(d, p2!.sku);
    const x2 = `${of}-X2`;
    const doc = orderDoc(x2, [line(`${x2}-1`, p2!.sku, 0, { replacesLineId: `${x1}-1` })], { exchange: { ofExternalOrderId: x1, note: 'size again' } });
    expectEq('short stock is refused', (await refused(push(c, doc, `${x2}-a`))).erpCode, 'INSUFFICIENT_STOCK');
    restore();
    expectEq('the old key keeps its refusal', (await refused(push(c, doc, `${x2}-a`))).erpCode, 'INSUFFICIENT_STOCK');
    expectEq('a new key goes through', (await push(c, doc, `${x2}-b`)).status, 201);
    await deliver(c, x2, 'DELIVERED', 0);
    await handBack(c, ext(c, 'XC-RL1'), [{ externalOrderId: x1 }]);
    await handBack(c, ext(c, 'XC-RL2'), [{ externalOrderId: x2 }]);
    d.v6.decidePiece(of, `${of}-1`, 'APPROVED');
    d.v6.decidePiece(x1, `${x1}-1`, 'APPROVED');
    expectEq('ends at the last piece in all', (await balance(c)) - before, p2!.shopMinor);
  },

  async 'summaries.replace'(c) {
    const date = addDays(today(c), -1);
    const body = {
      date,
      orders: { count: 0, pieces: 0 },
      sales: { gross: 0, discounts: 0, customerReturns: 0, net: 0 }, // hardcode-ok: an empty sample summary of the acceptance check
      income: { deliveryCharges: 0 }, // hardcode-ok: an empty sample summary of the acceptance check
      deliveries: { delivered: 0, failed: 0, returned: 0, codPending: 0 }, // hardcode-ok: an empty sample summary of the acceptance check
      costs: { goods: 0, returnLosses: 0, packaging: 0, delivery: 0, paymentFees: 0, accessories: 0, ads: { facebook: 0, instagram: 0, google: 0, tiktok: 0, other: 0 }, other: 0 }, // hardcode-ok: an empty sample summary of the acceptance check
      returns: { handedBackPieces: 0, approvedCredit: 0, waitingCheckValue: 0 },
      customers: { new: 0, returning: 0 },
      incomplete: ['ads' as const],
      netProfit: 0,
    };
    const v1 = (await push(c, { type: 'dailySummary.put', date, body })).body as { version?: number };
    const v2 = (await push(c, { type: 'dailySummary.put', date, body: { ...body, incomplete: [] } })).body as { version?: number };
    expectTrue('the second sending is a newer version', Number(v2.version) > Number(v1.version));
    const stored = (await c.api.v6.dailySummaries({ from: date, to: date }, call(c))).find((s) => s.date === date);
    expectTrue('the day is stored', Boolean(stored));
    expectEq('the newer version replaced the ads gap', stored!.incomplete, []);
  },

  async 'fixedCosts.spread'(c) {
    // A month of 30 days far ahead, so a real month of the shop is never touched.
    const year = Number(today(c).slice(0, 4)) + 5;
    const month = `${year}-11`;
    const costs = { salary: 45000, rent: 20000, utilities: 4500, other: 2000 };
    await push(c, { type: 'fixedCosts.put', month, body: { month, costs, note: 'ERP acceptance check (sample)' } });
    const back = (await c.api.v6.fixedCosts(call(c))).find((m) => m.month === month);
    expectTrue('the month reads back', Boolean(back));
    const total = Object.values(back!.costs).reduce((s: number, v) => s + minor(v as string), 0);
    expectEq('in all', total, 7_150_000);
    expectEq('a day of a 30-day month', Math.floor(total / 30), 238_333);
  },

  async 'account.holdRelease'(c) {
    const d = drv(c);
    const fx = fixture(c);
    d.v6.hold('No payment for 31 days');
    const id = ext(c, 'HOLD');
    try {
      const r = await refused(push(c, orderDoc(id, [line(`${id}-1`, fx.a[0]!.sku, 1190)])));
      expectEq('a new order is refused while on hold', r.erpCode, 'ACCOUNT_ON_HOLD');
      const acc = await c.api.v6.account(undefined, call(c));
      expectTrue('the account says it is on hold', acc.hold.onHold);
    } finally {
      d.v6.release();
    }
    expectEq('after the release it goes through', (await push(c, orderDoc(id, [line(`${id}-1`, fx.a[0]!.sku, 1190)]))).status, 201);
  },

  async 'account.period'(c) {
    const to = today(c);
    const from = `${to.slice(0, 7)}-01`;
    const acc = await c.api.v6.account({ from, to }, call(c));
    const p = acc.period;
    if (!p) throw new Fail('the account has no period for from/to');
    const sum = minor(p.openingBalance) + minor(p.ordersTotal) + minor(p.exchangesTotal) + minor(p.otherCharges) - minor(p.creditsTotal) - minor(p.paymentsTotal);
    expectEq('opening + bills + exchanges + other − credits − payments', sum, minor(p.closingBalance));
    const rows = acc.statement.reduce((s, r) => s + minor(r.amount), 0);
    expectEq('the statement rows add up to the movement', rows, minor(p.closingBalance) - minor(p.openingBalance));
  },

  async 'oldCalls.gone'(c) {
    const d = c.d;
    if (!d && !c.switched) throw new Skip('the shop has not switched yet: the old calls still answer');
    if (!c.o.writes) throw new Skip('writes are off');
    const fx = fixture(c);
    const id = ext(c, 'OLD');
    await push(c, orderDoc(id, [line(`${id}-1`, fx.a[0]!.sku, 1190)]));
    const was = d?.v6.switched;
    if (d) d.v6.switched = true;
    try {
      const st = await refused(push(c, { type: 'order.status', externalOrderId: id, body: { status: 'DELIVERED' } }));
      expectEq('PATCH with DELIVERED', st.status, 410);
      const rt = await refused(push(c, { type: 'return.create', body: { externalOrderId: id, reason: 'size', items: [{ sku: fx.a[0]!.sku, quantity: 1, qc: 'good' }] } }));
      expectEq('POST /returns', rt.status, 410);
    } finally {
      if (d) d.v6.switched = was ?? false;
    }
  },

  async 'switchOver.read'(c) {
    const s = await c.api.v6.switchOver(call(c));
    if (s.status === 'DONE') {
      expectTrue('a done switch has its date', Boolean(s.switchDate));
      for (const o of s.orders) expectTrue(`${o.kind} has its amount`, o.amount != null);
    }
    return `status ${s.status}`;
  },

  async 'costOfGoods.read'(c) {
    const to = today(c);
    const rows = await c.api.v6.costOfGoods({ from: addDays(to, -6), to }, call(c));
    expectTrue('never negative', rows.every((r) => r.pieces >= 0 && minor(r.value) >= 0));
    return `${rows.length} row(s)`;
  },

  async 'siteCalls.signature'(c) {
    const secret = `acceptance-${c.o.runId}`;
    const now = (c.o.now?.() ?? new Date()).getTime();
    const ts = String(Math.floor(now / 1000));
    const path = '/erp-api/customers?page=1&pageSize=50';
    const good = signErpRequest(secret, 'GET', path, ts);
    expectEq('a good signature', verifyErpRequest({ secret, method: 'GET', pathAndQuery: path, signature: good, timestamp: ts, maxAgeSeconds: 300, now }).ok, true);
    const bad = verifyErpRequest({ secret: `${secret}-other`, method: 'GET', pathAndQuery: path, signature: good, timestamp: ts, maxAgeSeconds: 300, now });
    expectEq('a bad signature', bad.ok ? 'ok' : bad.reason, 'mismatch');
    const oldTs = String(Math.floor(now / 1000) - 6 * 60);
    const old = verifyErpRequest({ secret, method: 'GET', pathAndQuery: path, signature: signErpRequest(secret, 'GET', path, oldTs), timestamp: oldTs, maxAgeSeconds: 300, now });
    expectEq('six minutes old', old.ok ? 'ok' : old.reason, 'stale');
  },
};

/** Runs the acceptance checks against one ERP and answers the report (never throws for a check). */
export async function runErpAcceptance(api: ErpApi, opts: AcceptanceOptions): Promise<AcceptanceReport> {
  const startedAt = new Date().toISOString();
  const results: AcceptanceResult[] = [];
  const list = ERP_ACCEPTANCE_CHECKS.filter((ch) => !opts.only || opts.only.includes(ch.id));
  const done = (ch: AcceptanceCheck, status: AcceptanceStatus, note: string | null, ms = 0) => results.push({ ...ch, status, note, ms });
  const report = (unreachable: boolean, keyRefused = false): AcceptanceReport => ({
    target: opts.target,
    runId: opts.runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    unreachable,
    keyRefused,
    writes: opts.writes,
    driver: Boolean(opts.driver),
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    skipped: results.filter((r) => r.status === 'SKIP').length,
    results,
  });
  if (!api.v6) {
    for (const ch of list) done(ch, ch.kind === 'local' ? 'SKIP' : 'FAIL', 'the adapter does not speak ERP contract v6');
    return report(false);
  }
  const soft = opts.target === SOFT_TARGET;
  let outage = false;
  const c: Ctx = { api: api as Ctx['api'], o: opts, d: opts.driver ?? null, fx: null, fxError: null, switched: false, seq: 0 };
  try {
    await api.health({ timeoutMs: opts.timeoutMs });
  } catch (e) {
    const x = toErpError(e);
    const refused = x.code === 'AUTH' || x.code === 'FORBIDDEN';
    if (x.code === 'BAD_RESPONSE') {
      // The ERP answered, but not what the contract says: a failure, not an outage.
      for (const ch of list) done(ch, ch.id === 'contract.health' ? 'FAIL' : 'SKIP', ch.id === 'contract.health' ? `${x.code}: ${x.message}`.slice(0, 500) : 'the first call answered wrongly');
      return report(false);
    }
    for (const ch of list) done(ch, 'SKIP', refused ? `the ERP refused the key (${x.code})` : `the ERP could not be reached (${x.code})`);
    return report(!refused, refused);
  }
  if (c.d) seedAcceptanceStyle(c.d);
  const fresh = opts.switchOver === 'fresh-start';
  try {
    // A fresh start never asks for the switch-over list (CN-033): only the practice ERP's own switch counts.
    c.switched = (!fresh && (await c.api.v6.switchOver({ timeoutMs: opts.timeoutMs })).status === 'DONE') || Boolean(c.d?.v6.switched);
  } catch {
    c.switched = false;
  }
  try {
    c.fx = await findFixture(api, { timeoutMs: opts.timeoutMs, minStock: 6 });
  } catch (e) {
    c.fx = null;
    c.fxError = e;
  }
  for (const ch of list) {
    if (fresh && NOT_BUILT_ON_FRESH_START.has(ch.id)) {
      done(ch, 'SKIP', NOT_BUILT_NOTE);
      continue;
    }
    if (ch.kind === 'write' && !opts.writes) {
      done(ch, 'SKIP', 'writes to this ERP are off');
      continue;
    }
    if (ch.kind === 'driver' && !c.d) {
      done(ch, 'SKIP', "needs the ERP's own action");
      continue;
    }
    const t0 = Date.now();
    try {
      const note = await CHECKS[ch.id]!(c);
      done(ch, 'PASS', note ?? null, Date.now() - t0);
    } catch (e) {
      if (e instanceof Skip) done(ch, 'SKIP', e.message, Date.now() - t0);
      else if (e instanceof Fail) done(ch, 'FAIL', e.message.slice(0, 500), Date.now() - t0);
      else if (soft && isErpOutage(e)) {
        outage = true;
        done(ch, 'SKIP', outageNote(e), Date.now() - t0);
      } else {
        const x = toErpError(e);
        done(ch, 'FAIL', `${x.code}${x.erpCode ? ` ${x.erpCode}` : ''}: ${x.message}`.slice(0, 500), Date.now() - t0);
      }
    }
  }
  return report(outage);
}

/** The report as a short Markdown page (the workflow commits it; no key, no customer). */
export function acceptanceMarkdown(r: AcceptanceReport, title: string): string {
  const head = [
    `# ${title}`,
    '',
    `- Target: ${r.target} · run ${r.runId}`,
    `- From ${r.startedAt} to ${r.finishedAt}`,
    `- ${r.passed} passed · ${r.failed} failed · ${r.skipped} skipped${r.unreachable ? ' · **the ERP could not be reached**' : ''}${r.keyRefused ? ' · **the ERP refused the key**' : ''}`,
    `- Writes ${r.writes ? 'on' : 'off'} · the ERP's own actions ${r.driver ? 'driven (practice ERP)' : 'not available'}`,
    '',
    '| Check | Area | Result | Note |',
    '|---|---|---|---|',
  ];
  const rows = r.results.map((x) => `| ${x.title} (\`${x.id}\`) | ${x.area} | ${x.status} | ${(x.note ?? '').replace(/\|/g, '/')} |`);
  return [...head, ...rows, ''].join('\n');
}
