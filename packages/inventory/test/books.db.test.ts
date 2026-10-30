// CN-028 · PR 617 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the daily summary to the ERP and the Books status card. The ERP is the practice ERP behind
// LIVE connections (its fetch replaces the network); every key is made up here and every amount is a test value. The
// ledger and pipeline rows of PR 615 and the match rows of PR 616 are written straight into their tables (the Phase 0
// tables), the way those PRs will write them, so this lane is tested before they land.
//
// The sample store A, day 3 Nov 2026 (Asia/Dhaka):
//   P1 A-1/A-1-1  billed 2 Nov at 650, delivered 3 Nov (customer price 850 of a regular 1000, delivery charge 60)
//   P2 A-2/A-2-1  billed 1 Nov at 700, handed back 2 Nov, declined 3 Nov  → return loss 700
//   P3 A-2/A-2-2  billed 1 Nov at 400, handed back 2 Nov, approved 3 Nov  → credit 400
//   an exchange settled +50 on 3 Nov, Retail paid the ERP 1000 on 3 Nov, packaging 30 and courier 60 that day
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, mockErp } from '@extas/adapters';
import { SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { tieRemainder, type CostSummaryLine } from '@extas/erp-types';
import { registry, type Key, type Value } from '@extas/settings';
import { booksSummaryStatus, inventorySchedule, openErpLink, pendingVersions, recordErpEvent, summaryCheck, summaryLog, summaryTick, tieLinesOf, type InventoryDeps, type SettingsReader } from '../src';

const BASE = 'https://erp.example.test';
/** A moment on a Dhaka day: `hour` is the local (UTC+6) hour. */
const at = (ymd: string, hour = 12, minute = 0) => new Date(Date.parse(`${ymd}T00:00:00Z`) + ((hour - 6) * 60 + minute) * 60_000);
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const addDay = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!HAS_TEST_DB)('CN-028 · PR 617 on PostgreSQL: the daily summary to the ERP', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let C = 0;
  let clock = at('2026-11-04', 0, 40);
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vault = new Map<string, string>();
  let connections: ReturnType<typeof createConnections>;
  const deps = (): InventoryDeps => ({ db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5 });
  const world = mockErp();
  const realFetch = globalThis.fetch;
  /** While true the ERP answers every PUT /daily-summaries with 503. */
  let erpDown = false;
  /** The ERP refuses (422) the summary of this day while it is set. */
  let refuseDay: string | null = null;
  /** The Idempotency-Key of every PUT /daily-summaries/{date}, by date. */
  const putKeys = new Map<string, string[]>();
  const links: Record<number, string> = {};
  let n = 0;
  const seq: Record<string, number> = {};

  const entry = (storeId: number, kind: string, ymd: string, amount: number, extra: Record<string, unknown> = {}) => {
    const linkId = links[storeId]!;
    seq[linkId] = (seq[linkId] ?? 0) + 1;
    return t.prisma.erpAccountEntry.create({
      data: { storeId, linkId, seq: seq[linkId]!, kind: kind as never, eventId: `evt-${randomUUID()}`, businessDate: day(ymd), amountMinor: BigInt(amount), source: 'WEBHOOK', hash: randomBytes(16).toString('hex'), ...extra },
    });
  };
  const piece = async (storeId: number, ext: string, lineId: string, buying: number, path: [string | null, string, string][]) => {
    const linkId = links[storeId]!;
    const last = path.at(-1)!;
    const p = await t.prisma.erpPipelinePiece.create({ data: { storeId, linkId, externalOrderId: ext, lineId, sku: 'POLO-NAVY-M', buyingPriceMinor: buying, state: last[1] as never, billedOn: day(path[0]![2]), stateDate: day(last[2]) } });
    for (const [from, to, ymd] of path) {
      await t.prisma.erpPipelineMove.create({ data: { storeId, linkId, pieceId: p.id, fromState: (from ?? null) as never, toState: to as never, businessDate: day(ymd), buyingPriceMinor: buying, cause: `test:${to}:${ymd}` } });
    }
    return p;
  };
  const order = async (storeId: number, o: { placed: Date; delivery?: number; customerId?: string | null; phone?: string; lines?: { unit: number; q?: number }[] }) => {
    n += 1;
    const sub = (o.lines ?? []).reduce((s, l) => s + l.unit * (l.q ?? 1), 0);
    const row = await t.prisma.order.create({
      data: { storeId, number: `B617-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'PLACED', placedAt: o.placed, phone: o.phone ?? `0171000${String(n).padStart(4, '0')}`, subtotalMinor: sub, deliveryChargeMinor: o.delivery ?? 0, totalMinor: sub + (o.delivery ?? 0), idempotencyKey: `b617-${n}` },
    });
    const items = [];
    for (const [i, l] of (o.lines ?? []).entries()) {
      items.push(await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, sku: `B617-${n}-${i}`, productName: 'Sample polo', quantity: l.q ?? 1, unitPriceMinor: l.unit, lineTotalMinor: l.unit * (l.q ?? 1) } }));
    }
    return { order: row, items };
  };
  const cost = (storeId: number, line: CostSummaryLine, ymd: string, amount: number, currency = 'BDT') =>
    t.prisma.costEntry.create({ data: { storeId, service: 'books.manual', amountMinor: amount, currency, source: 'manual', occurredAt: at(ymd), summaryLine: line, costDate: day(ymd) } });
  const versions = (storeId: number, ymd: string) => t.prisma.erpDailySummary.findMany({ where: { storeId, date: day(ymd) }, orderBy: { version: 'asc' } });
  const sends = (storeId: number) => t.prisma.erpBooksSend.findMany({ where: { storeId, kind: 'DAILY_SUMMARY' }, orderBy: { createdAt: 'asc' } });
  const stored = (company: string, ymd: string) => world.v6(company).summaries.get(ymd);
  const allLines = (except: CostSummaryLine[] = []) => (['PACKAGING', 'ACCESSORIES', 'PAYMENT_FEES', 'DELIVERY', 'ADS_FACEBOOK', 'ADS_INSTAGRAM', 'ADS_GOOGLE', 'ADS_TIKTOK', 'ADS_OTHER', 'OTHER'] as CostSummaryLine[]).filter((l) => !except.includes(l));

  beforeAll(async () => {
    t = await createTestDatabase('books617');
    [A, B] = await seedSampleStores(t.prisma);
    C = (await t.prisma.store.create({ data: { slug: 'sample-v5-store', name: 'Sample v5 store', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string, scope?: { storeId?: number | null }) => vault.get(`${scope?.storeId ?? '-'}:${name}`) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    world.reset();
    world.now = () => clock;
    const fetchOf = world.fetch as typeof fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const put = /\/daily-summaries\/(\d{4}-\d{2}-\d{2})/.exec(url);
      if (put && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
        const key = new Headers(init?.headers).get('idempotency-key') ?? '';
        putKeys.set(put[1]!, [...(putKeys.get(put[1]!) ?? []), key]);
        if (erpDown) return new Response(JSON.stringify({ error: { code: 'DOWN', message: 'the practice ERP is down' } }), { status: 503, headers: { 'content-type': 'application/json' } });
        if (refuseDay === put[1]) return new Response(JSON.stringify({ error: { code: 'VALIDATION', message: 'the practice ERP refuses this day' } }), { status: 422, headers: { 'content-type': 'application/json' } });
      }
      return fetchOf(input, init);
    }) as typeof fetch;
    for (const [store, company] of [[A, 'SAMPLE-CO-1'], [B, 'SAMPLE-CO-2'], [C, 'SAMPLE-CO-1']] as const) {
      const key = randomBytes(16).toString('hex');
      vault.set(`${store}:extasErp.apiKey`, key);
      vault.set(`${store}:extasErp.webhookSecret`, randomBytes(24).toString('hex'));
      world.acceptKey(key, company);
      const integ = await t.prisma.integration.create({ data: { storeId: store, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
      if (store !== C) {
        overrides.set(`erp.model@${store}`, 'v6');
        links[store] = (await openErpLink(t.prisma, store, integ.id)).id;
        await t.prisma.erpStoreLink.update({ where: { id: links[store] }, data: { switchDate: day('2026-11-01') } });
      }
    }
    // Store A: the sample day (see the header).
    const o1 = await order(A, { placed: at('2026-11-02', 20), delivery: 6_000, lines: [{ unit: 100_000 }] });
    const eo1 = await t.prisma.erpOrder.create({ data: { storeId: A, linkId: links[A]!, orderId: o1.order.id, externalOrderId: 'A-1', erpTotalMinor: 65_000n } });
    await t.prisma.erpOrderLine.create({ data: { storeId: A, erpOrderId: eo1.id, orderItemId: o1.items[0]!.id, lineId: 'A-1-1', sku: 'POLO-NAVY-M', customerPriceMinor: 85_000, shopPriceMinor: 65_000 } });
    await t.prisma.erpDeliveryResult.create({ data: { storeId: A, erpOrderId: eo1.id, outcome: 'DELIVERED', courier: 'PATHAO', collectedMinor: 91_000n, at: at('2026-11-03', 15) } });
    await piece(A, 'A-1', 'A-1-1', 65_000, [[null, 'BILLED', '2026-11-02'], ['BILLED', 'DELIVERED', '2026-11-03']]);
    await piece(A, 'A-2', 'A-2-1', 70_000, [[null, 'BILLED', '2026-11-01'], ['BILLED', 'WAITING_CHECK', '2026-11-02'], ['WAITING_CHECK', 'DECLINED', '2026-11-03']]);
    await piece(A, 'A-2', 'A-2-2', 40_000, [[null, 'BILLED', '2026-11-01'], ['BILLED', 'WAITING_CHECK', '2026-11-02'], ['WAITING_CHECK', 'APPROVED', '2026-11-03']]);
    await entry(A, 'BILL', '2026-11-01', 110_000, { externalOrderId: 'A-2' });
    await entry(A, 'BILL', '2026-11-02', 65_000, { externalOrderId: 'A-1' });
    await entry(A, 'RETURN_CREDIT', '2026-11-03', -40_000, { externalOrderId: 'A-2', lineId: 'A-2-2' });
    await entry(A, 'EXCHANGE_EXTRA', '2026-11-03', 5_000, { exchangeId: 'X-1' });
    await entry(A, 'PAYMENT', '2026-11-03', -100_000, { paymentRef: 'BANK-1' });
    // Two orders placed on 3 Nov: a new customer (2 pieces) and one who ordered before (on 2 Nov, same phone).
    await order(A, { placed: at('2026-11-03', 10), lines: [{ unit: 50_000, q: 2 }] });
    await order(A, { placed: at('2026-11-03', 11), phone: o1.order.phone!, lines: [{ unit: 50_000 }] });
    // An exchange order placed on 3 Nov is not an order for the figures.
    const xo = await order(A, { placed: at('2026-11-03', 12), lines: [{ unit: 50_000 }] });
    await t.prisma.erpOrder.create({ data: { storeId: A, linkId: links[A]!, orderId: xo.order.id, externalOrderId: 'A-X', exchangeOfId: o1.order.id } });
    await cost(A, 'PACKAGING', '2026-11-03', 3_000);
    await cost(A, 'DELIVERY', '2026-11-03', 6_000);
    // A's other cost lines: nothing that day (a "none today" entry of 0), except the Facebook ads, not in yet.
    for (const l of allLines(['PACKAGING', 'DELIVERY', 'ADS_FACEBOOK'])) await cost(A, l, '2026-11-03', 0);
    // Store B's own day: a big cost on the same date that store A must never see.
    await cost(B, 'PACKAGING', '2026-11-03', 999_900);
    overrides.set(`erp.summary.noCostLines@${B}`, allLines());
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });
  beforeEach(() => {
    erpDown = false;
    refuseDay = null;
  });

  it('builds yesterday at the send time from the shop`s own records, every line from its source, and sends it', async () => {
    clock = at('2026-11-04', 0, 20);
    // Before 00:30 yesterday is not built yet; the days before it are (the link started on 1 Nov).
    await summaryTick(deps(), A);
    expect(await versions(A, '2026-11-03')).toHaveLength(0);
    expect((await versions(A, '2026-11-02')).length).toBe(1);
    clock = at('2026-11-04', 0, 31);
    const r = await summaryTick(deps(), A);
    expect(r).toMatchObject({ linked: true, built: 1, accepted: 1, failed: 0 });
    const [v1] = await versions(A, '2026-11-03');
    expect(v1).toMatchObject({ version: 1, reason: 'NIGHTLY', incomplete: ['ads'], netProfitMinor: -58_000n });
    const body = v1!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      date: '2026-11-03',
      orders: { count: 2, pieces: 3 },
      sales: { gross: 1000, discounts: 150, customerReturns: 0, net: 850 },
      income: { deliveryCharges: 60 },
      deliveries: { delivered: 1, failed: 0, returned: 0 },
      costs: { goods: 700, returnLosses: 700, packaging: 30, delivery: 60, paymentFees: 0, accessories: 0, ads: { facebook: 0, instagram: 0, google: 0, tiktok: 0, other: 0 }, other: 0 },
      returns: { handedBackPieces: 0, approvedCredit: 400, waitingCheckValue: 0 },
      customers: { new: 1, returning: 1 },
      incomplete: ['ads'],
      netProfit: -580,
    });
    // The ERP has it, accepted, and the send is logged with its answer.
    expect(stored('SAMPLE-CO-1', '2026-11-03')!.versions).toHaveLength(1);
    const log = await sends(A);
    expect(log.every((s) => s.accepted && s.httpStatus === 200)).toBe(true);
    // A quiet day goes too, with zeros and its unknown categories listed (never 0 for unknown).
    const [quiet] = await versions(A, '2026-11-01');
    expect((quiet!.body as { orders: unknown; incomplete: string[] }).orders).toEqual({ count: 0, pieces: 0 });
    expect(quiet!.incomplete).toEqual(['packaging', 'delivery', 'paymentFees', 'accessories', 'ads', 'other']);
  });

  const sumOf = async (where: object) => Number((await t.prisma.erpAccountEntry.aggregate({ where: { linkId: links[A], ...where }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n);
  const pipelineAt = async (ymd: string) => {
    const rows = await t.prisma.erpPipelineMove.findMany({ where: { linkId: links[A], businessDate: { lte: day(ymd) } }, select: { fromState: true, toState: true, buyingPriceMinor: true } });
    const inside = (s: string | null) => s === 'BILLED' || s === 'RETURNING' || s === 'WAITING_CHECK';
    return rows.reduce((s, m) => s + (inside(m.toState) ? m.buyingPriceMinor : 0) - (inside(m.fromState) ? m.buyingPriceMinor : 0), 0);
  };
  /** The day's tie as PR 616 builds it: goods and return losses from what it reads of the day's latest version. */
  const tieOf = async (ymd: string, lines: { goodsMinor: number; returnLossesMinor: number }) =>
    tieRemainder({
      balanceStartMinor: await sumOf({ businessDate: { lte: day(addDay(ymd, -1)) } }),
      balanceEndMinor: await sumOf({ businessDate: { lte: day(ymd) } }),
      goodsMinor: lines.goodsMinor,
      returnLossesMinor: lines.returnLossesMinor,
      pipelineStartMinor: await pipelineAt(addDay(ymd, -1)),
      pipelineEndMinor: await pipelineAt(ymd),
      switchTransferMinor: 0,
      paymentsMinor: -(await sumOf({ kind: 'PAYMENT', businessDate: day(ymd) })),
    });
  /** What PR 616 reads of a day (books-match.ts → tieLinesOf); the "own figures" here are a marker that must not be used. */
  const readBy616 = (v: { incomplete: string[]; minorLines: unknown }) => tieLinesOf(v, { goodsMinor: -1, returnLossesMinor: -1 });

  it('the day ties: the summary`s goods and return losses close the account and the pipeline with no remainder', async () => {
    const [v] = await versions(A, '2026-11-03');
    const lines = readBy616(v!);
    expect(lines).toEqual({ goodsMinor: 70_000, returnLossesMinor: 70_000, summaryUsed: true });
    expect(await tieOf('2026-11-03', lines)).toBe(0);
  });

  it('a late fact makes a new version, never an edit; the same figures again make none; a version cannot be changed', async () => {
    const before = await versions(A, '2026-11-03');
    await cost(A, 'ADS_FACEBOOK', '2026-11-03', 52_000);
    clock = at('2026-11-04', 2);
    const r = await summaryCheck(deps(), A);
    expect(r.rebuilt).toBe(1);
    const after = await versions(A, '2026-11-03');
    expect(after.map((v) => [v.version, v.reason, v.incomplete])).toEqual([
      [1, 'NIGHTLY', ['ads']],
      [2, 'LATE_FACT', []],
    ]);
    expect(after[0]!.bodyHash).toBe(before[0]!.bodyHash);
    expect((after[1]!.body as { netProfit: number }).netProfit).toBe(-580 - 520);
    // The tick sends the new version (the ERP keeps both); a second check builds nothing new.
    expect((await summaryTick(deps(), A)).accepted).toBe(1);
    expect(stored('SAMPLE-CO-1', '2026-11-03')!.versions).toHaveLength(2);
    expect((await summaryCheck(deps(), A)).rebuilt).toBe(0);
    await expect(t.prisma.erpDailySummary.update({ where: { id: after[0]!.id }, data: { reason: 'EDITED' } })).rejects.toThrow();
    await expect(t.prisma.erpDailySummary.delete({ where: { id: after[0]!.id } })).rejects.toThrow();
  });

  it('when the ERP is down it tries again after 1, 5, 15 and 60 minutes, then every hour, until it is accepted', async () => {
    erpDown = true;
    clock = at('2026-11-05', 0, 31);
    expect(await summaryTick(deps(), A)).toMatchObject({ built: 1, sent: 1, failed: 1 });
    const tries = async () => (await t.prisma.erpBooksSend.findMany({ where: { storeId: A, refId: (await versions(A, '2026-11-04'))[0]!.id }, orderBy: { attempt: 'asc' } })).map((s) => [s.attempt, s.accepted, s.httpStatus]);
    const tick = async (minutes: number) => {
      clock = new Date(clock.getTime() + minutes * 60_000);
      return summaryTick(deps(), A);
    };
    expect((await tick(0.5)).sent).toBe(0); // not before the first wait
    expect((await tick(0.5)).sent).toBe(1); // 1 minute
    expect((await tick(4)).sent).toBe(0);
    expect((await tick(1)).sent).toBe(1); // 5 minutes
    expect((await tick(15)).sent).toBe(1); // 15 minutes
    expect((await tick(59)).sent).toBe(0);
    expect((await tick(1)).sent).toBe(1); // 60 minutes
    expect((await tick(60)).sent).toBe(1); // then every hour
    expect(await tries()).toEqual([1, 2, 3, 4, 5, 6].map((a) => [a, false, 503]));
    erpDown = false;
    expect((await tick(60)).accepted).toBe(1);
    expect((await tries()).at(-1)).toEqual([7, true, 200]);
    expect((await tick(60)).sent).toBe(0); // accepted: never sent again by itself
    const log = await summaryLog(deps(), { actor: SYSTEM, storeId: A });
    expect(log[0]).toMatchObject({ date: '2026-11-04', state: 'ACCEPTED', tries: 7 });
  });

  it('summary.missing is answered at once; a lost one is caught by the check against the ERP`s stored copy', async () => {
    const day2 = async () => t.prisma.erpBooksSend.count({ where: { storeId: A, refId: (await versions(A, '2026-11-02'))[0]!.id } });
    const before = await day2();
    const kept = stored('SAMPLE-CO-1', '2026-11-02')!.versions.length;
    clock = new Date(clock.getTime() + 60_000);
    await recordErpEvent(deps(), { integrationId: (await t.prisma.erpStoreLink.findUniqueOrThrow({ where: { id: links[A] } })).integrationId!, storeId: A, linkId: links[A]!, source: 'WEBHOOK', event: { eventId: `evt-missing-${randomUUID()}`, type: 'summary.missing', occurredAt: clock, date: '2026-11-05', reverses: null, data: { dates: ['2026-11-02'] } } });
    clock = new Date(clock.getTime() + 1_000);
    expect((await summaryTick(deps(), A)).accepted).toBe(1);
    expect(await day2()).toBe(before + 1);
    // A new key for a send after acceptance: the ERP really keeps the day again (a known key would only be replayed).
    expect(stored('SAMPLE-CO-1', '2026-11-02')!.versions.length).toBe(kept + 1);
    expect((await summaryTick(deps(), A)).sent).toBe(0); // answered once
    // The ERP lost day 1 and its summary.missing never arrived: the check finds it and sends it again.
    world.v6('SAMPLE-CO-1').summaries.delete('2026-11-01');
    const r = await summaryCheck(deps(), A);
    expect(r.missing).toEqual(['2026-11-01']);
    expect(stored('SAMPLE-CO-1', '2026-11-01')).toBeTruthy();
    expect((await summaryCheck(deps(), A)).resent).toBe(0);
  });

  it('store A never touches store B: each store`s days from its own rows, sent with its own key to its own ERP company', async () => {
    const r = await summaryTick(deps(), B);
    expect(r.linked).toBe(true);
    const [b3] = await versions(B, '2026-11-03');
    expect(b3!.linkId).toBe(links[B]);
    expect((b3!.body as { orders: unknown; costs: { packaging: number } }).orders).toEqual({ count: 0, pieces: 0 });
    expect((b3!.body as { costs: { packaging: number } }).costs.packaging).toBe(9_999);
    expect(b3!.incomplete).toEqual([]);
    // A's summary never saw B's cost, and each ERP company holds only its own store's days.
    const [, a2] = await versions(A, '2026-11-03');
    expect((a2!.body as { costs: { packaging: number } }).costs.packaging).toBe(30);
    expect((stored('SAMPLE-CO-2', '2026-11-03')!.versions.at(-1) as { costs: { packaging: number } }).costs.packaging).toBe(9_999);
    expect((stored('SAMPLE-CO-1', '2026-11-03')!.versions.at(-1) as { costs: { packaging: number } }).costs.packaging).toBe(30);
    expect(await t.prisma.erpBooksSend.count({ where: { storeId: B, linkId: { not: links[B] } } })).toBe(0);
    expect((await summaryLog(deps(), { actor: SYSTEM, storeId: B })).every((row) => row.date >= '2026-11-01')).toBe(true);
  });

  it('in v5 nothing is built or sent, and the timetable has no summary jobs for a v5 store', async () => {
    expect(await summaryTick(deps(), C)).toMatchObject({ linked: false, built: 0, sent: 0 });
    expect(await summaryCheck(deps(), C)).toMatchObject({ linked: false });
    expect(await t.prisma.erpDailySummary.count({ where: { storeId: C } })).toBe(0);
    const plan = (await inventorySchedule(deps())).flatMap((p) => p.jobs);
    const books = plan.filter((j) => j.name.startsWith('inventory.books.summary')).map((j) => `${j.name}@${'storeId' in j ? j.storeId : '-'}`);
    expect(books.sort()).toEqual([`inventory.books.summaryCheck@${A}`, `inventory.books.summaryCheck@${B}`, `inventory.books.summaryTick@${A}`, `inventory.books.summaryTick@${B}`].sort());
    const status = await booksSummaryStatus(deps(), { actor: SYSTEM, storeId: C });
    expect(status.card.state).toBe('NOT_LINKED');
    expect(status.card.needs).toEqual([]);
  });

  it('the Books status card: "not run yet" until the match runs, then each check, a broken tie named, per store', async () => {
    const before = await booksSummaryStatus(deps(), { actor: SYSTEM, storeId: A });
    expect(before.card.state).toBe('NOT_RUN');
    expect(before.card.checks.every((c) => c.result === null)).toBe(true);
    expect(before.summaries.lastAccepted).toBe('2026-11-04');
    expect(before.card.needs.map((x) => x.kind)).toContain('FIXED_COSTS_MISSING');
    // PR 616 writes a run, a day close and a broken tie (straight into its tables here).
    await t.prisma.booksMatchRun.create({ data: { storeId: A, linkId: links[A]!, trigger: 'NIGHTLY', fromDate: day('2026-11-04'), toDate: day('2026-11-04'), status: 'DONE', checks: { ACCOUNT: { result: 'PARTIAL', counts: {} }, TIES: { result: 'MISMATCH' }, RETURNS: 'MATCHED' }, startedAt: clock, finishedAt: clock } });
    await t.prisma.booksDifference.create({ data: { storeId: A, linkId: links[A]!, date: day('2026-11-04'), check: 'TIES', kind: 'TIE_BROKEN', key: 'tie:2026-11-04', status: 'MISMATCH', amountMinor: 65_000n, externalOrderId: 'A-9', detail: { piece: 'A-9-1' }, firstSeenAt: clock, lastSeenAt: clock } });
    const after = await booksSummaryStatus(deps(), { actor: SYSTEM, storeId: A });
    expect([after.card.state, after.card.overall, after.card.partial]).toEqual(['RAN', 'MISMATCH', true]);
    expect(after.card.checks.map((c) => c.result)).toEqual(['PARTIAL', 'MISMATCH', 'MATCHED', null, null, null]);
    expect(after.card.needs.find((x) => x.kind === 'TIE_BROKEN')!.vars).toEqual({ date: '2026-11-04', amountMinor: 65_000, order: 'A-9' });
    // Store B's card never shows A's run.
    expect((await booksSummaryStatus(deps(), { actor: SYSTEM, storeId: B })).card.state).toBe('NOT_RUN');
  });

  it('qa-gate: a piece at 450.50 and a decline at 700.25 tie to the paisa from the exact lines kept with the version', async () => {
    const o = await order(A, { placed: at('2026-11-05', 10), delivery: 6_000, lines: [{ unit: 60_000 }] });
    const eo = await t.prisma.erpOrder.create({ data: { storeId: A, linkId: links[A]!, orderId: o.order.id, externalOrderId: 'A-4', erpTotalMinor: 45_050n } });
    await t.prisma.erpOrderLine.create({ data: { storeId: A, erpOrderId: eo.id, orderItemId: o.items[0]!.id, lineId: 'A-4-1', sku: 'POLO-NAVY-M', customerPriceMinor: 60_000, shopPriceMinor: 45_050 } });
    await t.prisma.erpDeliveryResult.create({ data: { storeId: A, erpOrderId: eo.id, outcome: 'DELIVERED', courier: 'PATHAO', collectedMinor: 66_000n, at: at('2026-11-06', 15) } });
    await piece(A, 'A-4', 'A-4-1', 45_050, [[null, 'BILLED', '2026-11-05'], ['BILLED', 'DELIVERED', '2026-11-06']]);
    await piece(A, 'A-5', 'A-5-1', 70_025, [[null, 'BILLED', '2026-11-04'], ['BILLED', 'WAITING_CHECK', '2026-11-05'], ['WAITING_CHECK', 'DECLINED', '2026-11-06']]);
    await entry(A, 'BILL', '2026-11-04', 70_025, { externalOrderId: 'A-5' });
    await entry(A, 'BILL', '2026-11-05', 45_050, { externalOrderId: 'A-4' });
    clock = at('2026-11-07', 0, 31);
    await summaryTick(deps(), A);
    const [v] = await versions(A, '2026-11-06');
    // On the wire whole taka (450.50 → 451, 700.25 → 700); kept beside it to the paisa.
    expect((v!.body as { costs: { goods: number; returnLosses: number } }).costs).toMatchObject({ goods: 451, returnLosses: 700 });
    expect(v!.minorLines).toMatchObject({ goods: 45_050, returnLosses: 70_025 });
    const lines = readBy616(v!);
    expect(lines).toEqual({ goodsMinor: 45_050, returnLossesMinor: 70_025, summaryUsed: true });
    expect(await tieOf('2026-11-06', lines)).toBe(0);
    // The rounded body would have broken the tie on a correct day (what 616 read before the fix).
    expect(await tieOf('2026-11-06', { goodsMinor: 45_100, returnLossesMinor: 70_000 })).not.toBe(0);
    // A version with no minor lines (built before 0056) or goods not known yet: 616's own figures stand, never the body.
    expect(tieLinesOf({ incomplete: [], minorLines: null }, { goodsMinor: 45_050, returnLossesMinor: 70_025 }).summaryUsed).toBe(false);
    expect(tieLinesOf({ incomplete: ['sales', 'goods'], minorLines: v!.minorLines }, { goodsMinor: 1, returnLossesMinor: 2 })).toEqual({ goodsMinor: 1, returnLossesMinor: 2, summaryUsed: false });
  });

  it('qa-gate: a summary the ERP refuses (4xx) is not tried again by itself; asked for again, it goes with a new key', async () => {
    refuseDay = '2026-11-07';
    clock = at('2026-11-08', 0, 31);
    expect(await summaryTick(deps(), A)).toMatchObject({ built: 1, sent: 1, failed: 1 });
    expect((await summaryLog(deps(), { actor: SYSTEM, storeId: A }))[0]).toMatchObject({ date: '2026-11-07', state: 'REFUSED', tries: 1, httpStatus: 422 });
    for (const hours of [1, 2, 5]) {
      clock = at('2026-11-08', hours, 31);
      expect(await summaryTick(deps(), A)).toMatchObject({ sent: 0, refused: 1 });
    }
    expect(putKeys.get('2026-11-07')).toHaveLength(1);
    // The ERP's people put it right and ask for the day: sent at once, with a new key (the old one is refused again).
    refuseDay = null;
    clock = at('2026-11-08', 6);
    await recordErpEvent(deps(), { integrationId: (await t.prisma.erpStoreLink.findUniqueOrThrow({ where: { id: links[A] } })).integrationId!, storeId: A, linkId: links[A]!, source: 'WEBHOOK', event: { eventId: `evt-missing-${randomUUID()}`, type: 'summary.missing', occurredAt: clock, date: '2026-11-08', reverses: null, data: { dates: ['2026-11-07'] } } });
    clock = at('2026-11-08', 6, 1);
    expect(await summaryTick(deps(), A)).toMatchObject({ sent: 1, accepted: 1 });
    const keys = putKeys.get('2026-11-07')!;
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
    expect((await summaryTick(deps(), A)).sent).toBe(0);
  });

  it('qa-gate: two ticks at the same moment log one try, and the tick reads only what it may still have to send', async () => {
    erpDown = true;
    clock = at('2026-11-09', 0, 31);
    expect(await summaryTick(deps(), A)).toMatchObject({ built: 1, sent: 1, failed: 1 });
    const v8 = (await versions(A, '2026-11-08'))[0]!;
    const tries = () => t.prisma.erpBooksSend.count({ where: { refId: v8.id } });
    expect(await tries()).toBe(1);
    clock = at('2026-11-09', 0, 32);
    const [a, b] = await Promise.all([summaryTick(deps(), A), summaryTick(deps(), A)]);
    expect(a.sent + b.sent).toBe(1);
    expect((await t.prisma.erpBooksSend.findMany({ where: { refId: v8.id }, orderBy: { attempt: 'asc' } })).map((s) => s.attempt)).toEqual([1, 2]);
    // Accepted days are never read again by the tick: only the one still failing is pending.
    expect((await pendingVersions(t.prisma, links[A]!, { before: '2026-11-09', asked: [] })).map((v) => v.date)).toEqual(['2026-11-08']);
  });

  it('qa-gate: the summaries log starts from the store`s own day, not the UTC date', async () => {
    clock = at('2026-11-09', 0, 40); // 8 Nov 18:40 UTC
    expect((await summaryLog(deps(), { actor: SYSTEM, storeId: A }, { days: 1 })).map((r) => r.date)).toEqual(['2026-11-08']);
  });

  it('a closed month is never sent again: a late fact on it makes no new version', async () => {
    await t.prisma.booksPeriodClose.create({ data: { storeId: A, linkId: links[A]!, level: 'MONTH', periodStart: day('2026-11-01'), periodEnd: day('2026-11-30'), version: 1, result: 'MATCHED', openingBalanceMinor: 0n, closingBalanceMinor: 0n, matchedDays: 30, totalDays: 30, figures: {}, hash: 'test' } });
    await cost(A, 'OTHER', '2026-11-02', 10_000);
    const r = await summaryCheck(deps(), A);
    expect(r.rebuilt).toBe(0);
    expect(await versions(A, '2026-11-02')).toHaveLength(1);
  });
});
