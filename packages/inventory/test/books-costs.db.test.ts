// CN-028 · PR 618 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the month's fixed costs the owner sets and the extra cost lines of the daily summary. The ERP
// is the practice ERP behind LIVE connections (its fetch replaces the network); every key is made up here and every
// amount is a test value — the real fixed costs are owner data and ship empty.
//   Stores A and B are on v6 (switch date 1 Nov 2026), each with its own key and ERP company; store C is still on v5.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, mockErp } from '@extas/adapters';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  addCostEntry,
  booksSummaryStatus,
  costEntries,
  fixedCostsView,
  openErpLink,
  recordStatementCost,
  reverseCostEntry,
  setFixedCosts,
  summaryCheck,
  summaryTick,
  type InventoryDeps,
  type SettingsReader,
  type Who,
} from '../src';

const BASE = 'https://erp.example.test';
/** A moment on a Dhaka day: `hour` is the local (UTC+6) hour. */
const at = (ymd: string, hour = 12, minute = 0) => new Date(Date.parse(`${ymd}T00:00:00Z`) + ((hour - 6) * 60 + minute) * 60_000);
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
/** November's sample fixed costs (test values), in poisha: 71500 in all. */
const NOV = { salaryMinor: 4_500_000, rentMinor: 2_000_000, utilitiesMinor: 450_000, otherMinor: 200_000 };

describe.skipIf(!HAS_TEST_DB)('CN-028 · PR 618 on PostgreSQL: fixed costs and the extra cost lines', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let C = 0;
  let clock = at('2026-11-20', 9);
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
  /** While true the ERP answers every PUT /fixed-costs with 503. */
  let erpDown = false;
  const links: Record<number, string> = {};
  let viewer: Actor;
  let owner: Actor;
  /** Follow-up 567: daily cost lines only (`costlines.write`), never the month's fixed costs. */
  let clerk: Actor;
  const sys = (storeId: number): Who => ({ actor: SYSTEM, storeId });
  const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code ?? String(e));
  const months = (storeId: number, month: string) => t.prisma.erpFixedCostMonth.findMany({ where: { storeId, month: day(`${month}-01`) }, orderBy: { version: 'asc' } });
  const sends = (storeId: number) => t.prisma.erpBooksSend.findMany({ where: { storeId, kind: 'FIXED_COSTS' }, orderBy: [{ sentAt: 'asc' }, { attempt: 'asc' }] });
  const theirs = (company: string, month: string) => world.v6(company).fixedCosts.get(month) as { costs: Record<string, number>; note: string | null }[] | undefined;
  const summaryOf = async (storeId: number, ymd: string) => {
    const v = await t.prisma.erpDailySummary.findFirst({ where: { storeId, date: day(ymd) }, orderBy: { version: 'desc' } });
    return v ? { version: v.version, reason: v.reason, body: v.body as { costs: Record<string, number>; incomplete: string[] } } : null;
  };

  beforeAll(async () => {
    t = await createTestDatabase('books618');
    [A, B] = await seedSampleStores(t.prisma);
    C = (await t.prisma.store.create({ data: { slug: 'sample-v5-store', name: 'Sample v5 store', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string, scope?: { storeId?: number | null }) => vault.get(`${scope?.storeId ?? '-'}:${name}`) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    world.reset();
    world.now = () => clock;
    const fetchOf = world.fetch as typeof fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (erpDown && /\/fixed-costs\//.test(url) && (init?.method ?? 'GET').toUpperCase() === 'PUT') return new Response(JSON.stringify({ error: { code: 'DOWN', message: 'the practice ERP is down' } }), { status: 503, headers: { 'content-type': 'application/json' } });
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
    const staff = async (email: string, perms: ('books.read' | 'fixedcosts.write' | 'costlines.write')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: null } });
      return { staffUserId: u.id };
    };
    viewer = await staff('books-viewer@example.com', ['books.read']);
    owner = await staff('books-owner@example.com', ['books.read', 'fixedcosts.write']);
    clerk = await staff('books-clerk@example.com', ['books.read', 'costlines.write']);
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });
  beforeEach(() => {
    erpDown = false;
  });

  it('ships empty: no month is set, nothing is sent, and the Books card asks for this month`s fixed costs', async () => {
    const view = await fixedCostsView(deps(), { actor: viewer, storeId: A });
    expect(view.linked).toBe(true);
    expect(view.months.map((m) => [m.month, m.entered])).toEqual([
      ['2026-11', false],
      ['2026-12', false],
    ]);
    expect(view.months[0]!.lines).toBeNull();
    expect(view.suggestion).toBeNull();
    await summaryTick(deps(), A);
    expect(await sends(A)).toHaveLength(0);
    expect((await booksSummaryStatus(deps(), sys(A))).card.needs.map((x) => x.kind)).toContain('FIXED_COSTS_MISSING');
  });

  it('the owner sets a month: one version, logged, sent by PUT /fixed-costs/{month} exact to the paisa, and spread by day', async () => {
    expect(await code(setFixedCosts(deps(), { actor: viewer, storeId: A }, { month: '2026-11', ...NOV }))).toBe('FORBIDDEN');
    const r = await setFixedCosts(deps(), { actor: owner, storeId: A }, { month: '2026-11', ...NOV, note: 'sample month' });
    expect(r).toMatchObject({ changed: true, version: 1 });
    const [v1] = await months(A, '2026-11');
    expect([v1!.salaryMinor, v1!.rentMinor, v1!.utilitiesMinor, v1!.otherMinor, v1!.note]).toEqual([4_500_000n, 2_000_000n, 450_000n, 200_000n, 'sample month']);
    expect(await t.prisma.auditLog.count({ where: { action: 'books.fixedCosts.set', entityId: v1!.id } })).toBe(1);
    // The tick sends it; the ERP keeps exactly the owner's numbers.
    const tick = await summaryTick(deps(), A);
    expect(tick.fixed).toMatchObject({ sent: 1, accepted: 1 });
    expect(theirs('SAMPLE-CO-1', '2026-11')!.at(-1)).toEqual({ month: '2026-11', costs: { salary: 45_000, rent: 20_000, utilities: 4_500, other: 2_000 }, note: 'sample month' });
    expect((await summaryTick(deps(), A)).fixed.sent).toBe(0); // accepted: never sent again by itself
    // The screen: the month, the ERP's rule by day (2383.33 a day, the remainder on the 30th), accepted.
    const nov = (await fixedCostsView(deps(), { actor: viewer, storeId: A })).months[0]!;
    expect(nov).toMatchObject({ month: '2026-11', entered: true, version: 1, totalMinor: 7_150_000, state: 'ACCEPTED' });
    expect(nov.perDay).toHaveLength(30);
    expect(nov.perDay[0]).toEqual({ day: '2026-11-01', minor: 238_333 });
    expect(nov.perDay.at(-1)).toEqual({ day: '2026-11-30', minor: 7_150_000 - 238_333 * 29 });
    // Fixed costs never go into the daily summary's costs.other.
    expect((await booksSummaryStatus(deps(), sys(A))).card.needs.map((x) => x.kind)).not.toContain('FIXED_COSTS_MISSING');
  });

  it('the same numbers again make no new version; a raise makes version 2, sent again; a version is never changed', async () => {
    expect(await setFixedCosts(deps(), { actor: owner, storeId: A }, { month: '2026-11', ...NOV, note: 'sample month' })).toMatchObject({ changed: false, version: 1 });
    expect(await setFixedCosts(deps(), { actor: owner, storeId: A }, { month: '2026-11', ...NOV, salaryMinor: 5_000_000, note: 'salary raised' })).toMatchObject({ changed: true, version: 2 });
    expect((await months(A, '2026-11')).map((m) => [m.version, m.salaryMinor])).toEqual([
      [1, 4_500_000n],
      [2, 5_000_000n],
    ]);
    expect((await summaryTick(deps(), A)).fixed.accepted).toBe(1);
    expect(theirs('SAMPLE-CO-1', '2026-11')!.map((m) => m.costs.salary)).toEqual([45_000, 50_000]);
    const [v1] = await months(A, '2026-11');
    await expect(t.prisma.erpFixedCostMonth.update({ where: { id: v1!.id }, data: { note: 'edited' } })).rejects.toThrow();
    await expect(t.prisma.erpFixedCostMonth.delete({ where: { id: v1!.id } })).rejects.toThrow();
    // Next month can be prefilled from the last one (the owner still presses save; nothing is copied by itself).
    const view = await fixedCostsView(deps(), { actor: viewer, storeId: A });
    expect(view.suggestion).toEqual({ from: '2026-11', salaryMinor: 5_000_000, rentMinor: 2_000_000, utilitiesMinor: 450_000, otherMinor: 200_000 });
    expect(view.months[1]).toMatchObject({ month: '2026-12', entered: false });
  });

  it('when the ERP is down it tries again with the summary waits until accepted; the check sends a lost month again', async () => {
    erpDown = true;
    await setFixedCosts(deps(), { actor: owner, storeId: A }, { month: '2026-12', ...NOV });
    expect((await summaryTick(deps(), A)).fixed).toMatchObject({ sent: 1, failed: 1 });
    expect((await fixedCostsView(deps(), { actor: viewer, storeId: A })).months[1]!.state).toBe('RETRYING');
    // Follow-up 569: a month not taken a day after it was saved is "waited long" (the nightly smoke reads it); the
    // accepted November is not. (Rows carry the database's own time, so "not yet a day" is the pure test's.)
    const saved = clock;
    clock = new Date(saved.getTime() + 25 * 3_600_000);
    const late = await booksSummaryStatus(deps(), sys(A));
    expect(late.waitedLong.months).toEqual(['2026-12']);
    expect(late.card.needs.find((x) => x.kind === 'WAITED_LONG')?.vars).toMatchObject({ months: 1 });
    clock = saved;
    clock = new Date(clock.getTime() + 30_000);
    expect((await summaryTick(deps(), A)).fixed.sent).toBe(0); // the first wait is 1 minute
    clock = new Date(clock.getTime() + 31_000);
    expect((await summaryTick(deps(), A)).fixed).toMatchObject({ sent: 1, failed: 1 });
    erpDown = false;
    clock = new Date(clock.getTime() + 5 * 60_000);
    expect((await summaryTick(deps(), A)).fixed.accepted).toBe(1);
    expect((await sends(A)).filter((s) => !s.accepted).map((s) => s.httpStatus)).toEqual([503, 503]);
    // The ERP lost December: the check against GET /fixed-costs finds it and sends it again (a new key, so it is kept).
    world.v6('SAMPLE-CO-1').fixedCosts.delete('2026-12');
    const r = await summaryCheck(deps(), A);
    expect(r.fixedResent).toEqual(['2026-12']);
    expect(theirs('SAMPLE-CO-1', '2026-12')).toHaveLength(1);
    expect((await summaryCheck(deps(), A)).fixedResent).toEqual([]);
  });

  it('refuses a month before the link, beyond next month, in a closed month, a v5 store, and amounts that are not money', async () => {
    const w = { actor: owner, storeId: A };
    expect(await code(setFixedCosts(deps(), w, { month: '2026-10', ...NOV }))).toBe('INVALID_INPUT');
    expect(await code(setFixedCosts(deps(), w, { month: '2027-01', ...NOV }))).toBe('INVALID_INPUT');
    expect(await code(setFixedCosts(deps(), w, { month: '2026-11', ...NOV, rentMinor: -1 }))).toBe('INVALID_INPUT');
    expect(await code(setFixedCosts(deps(), w, { month: '2026-11', ...NOV, rentMinor: 1.5 }))).toBe('INVALID_INPUT');
    expect(await code(setFixedCosts(deps(), { actor: owner, storeId: C }, { month: '2026-11', ...NOV }))).toBe('BOOKS_NOT_LINKED');
    expect((await fixedCostsView(deps(), { actor: viewer, storeId: C })).linked).toBe(false);
  });

  it('a cost line entry feeds that day`s summary at once; it is reversed by a negative entry, never edited or deleted', async () => {
    clock = at('2026-11-21', 9);
    await summaryTick(deps(), A); // builds and sends 1–20 Nov
    expect((await summaryOf(A, '2026-11-18'))!.body.incomplete).toContain('accessories');
    expect(await code(addCostEntry(deps(), { actor: viewer, storeId: A }, { line: 'ACCESSORIES', day: '2026-11-18', amountMinor: 4_500 }))).toBe('FORBIDDEN');
    const e = await addCostEntry(deps(), { actor: owner, storeId: A }, { line: 'ACCESSORIES', day: '2026-11-18', amountMinor: 4_500, note: 'gift boxes' });
    expect(e.resummarised).toBe(true);
    const s2 = (await summaryOf(A, '2026-11-18'))!;
    expect([s2.version, s2.reason, s2.body.costs.accessories, s2.body.incomplete.includes('accessories')]).toEqual([2, 'LATE_FACT', 45, false]);
    // A payment fee for today: no summary yet, the nightly one picks it up.
    const fee = await addCostEntry(deps(), { actor: owner, storeId: A }, { line: 'PAYMENT_FEES', day: '2026-11-21', amountMinor: 1_850 });
    expect(fee.resummarised).toBe(false);
    // The wrong amount: reversed with a reason (a negative entry pointing at it), then entered again.
    expect(await code(reverseCostEntry(deps(), { actor: owner, storeId: A }, e.id, { reason: '' }))).toBe('REASON_REQUIRED');
    const rev = await reverseCostEntry(deps(), { actor: owner, storeId: A }, e.id, { reason: 'typed 45, it was 40' });
    expect(await code(reverseCostEntry(deps(), { actor: owner, storeId: A }, e.id, { reason: 'again' }))).toBe('CONFLICT');
    expect(await code(reverseCostEntry(deps(), { actor: owner, storeId: A }, rev.id, { reason: 'undo the undo' }))).toBe('CONFLICT');
    await addCostEntry(deps(), { actor: owner, storeId: A }, { line: 'ACCESSORIES', day: '2026-11-18', amountMinor: 4_000 });
    expect((await summaryOf(A, '2026-11-18'))!.body.costs.accessories).toBe(40);
    const rows = await t.prisma.costEntry.findMany({ where: { storeId: A, summaryLine: 'ACCESSORIES', costDate: day('2026-11-18') }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.amountMinor, r.refType])).toEqual([
      [4_500, null],
      [-4_500, 'CostEntry'],
      [4_000, null],
    ]);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['books.costLine.add', 'books.costLine.reverse'] } } })).toBe(4);
    // The list shows each entry with what reversed it.
    const { rows: list, limit, more } = await costEntries(deps(), { actor: viewer, storeId: A }, { from: '2026-11-18', to: '2026-11-21' });
    expect([limit, more]).toEqual([500, false]);
    // A store that lists fewer at once: the newest ones, and the page is told there are more.
    overrides.set(`books.costs.listLimit@${A}`, 2);
    const few = await costEntries(deps(), { actor: viewer, storeId: A }, { from: '2026-11-18', to: '2026-11-21' });
    expect([few.rows.length, few.limit, few.more]).toEqual([2, 2, true]);
    expect(few.rows[0]!.day).toBe('2026-11-21');
    overrides.delete(`books.costs.listLimit@${A}`);
    expect(list.find((x) => x.id === e.id)).toMatchObject({ amountMinor: 4_500, reversedBy: rev.id, canReverse: false, note: 'gift boxes' });
    expect(list.find((x) => x.id === rev.id)).toMatchObject({ amountMinor: -4_500, reverses: e.id, canReverse: false });
    expect(list.find((x) => x.id === fee.id)).toMatchObject({ line: 'PAYMENT_FEES', day: '2026-11-21', canReverse: true });
  });

  it('a cost counts only on today or an open day, and only for its own store', async () => {
    const w = { actor: owner, storeId: A };
    expect(await code(addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-22', amountMinor: 100 }))).toBe('INVALID_INPUT'); // the future
    expect(await code(addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-02', amountMinor: 100 }))).toBe('BOOKS_DAY_CLOSED'); // past books.resend.days
    expect(await code(addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-20', amountMinor: 0 }))).toBe('OK'); // "none that day"
    expect(await code(addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-20', amountMinor: -5 }))).toBe('INVALID_INPUT');
    expect(await code(addCostEntry(deps(), w, { line: 'FIXED' as never, day: '2026-11-20', amountMinor: 5 }))).toBe('INVALID_INPUT');
    // Store B: its own month and lines; A's entries and months never show there, and B's ERP company never sees A's.
    const a = (await costEntries(deps(), { actor: viewer, storeId: A }, { from: '2026-11-01', to: '2026-11-21' })).rows.find((x) => x.line === 'PAYMENT_FEES')!;
    expect(await code(reverseCostEntry(deps(), { actor: owner, storeId: B }, a.id, { reason: 'not mine' }))).toBe('NOT_FOUND');
    expect((await costEntries(deps(), { actor: viewer, storeId: B }, { from: '2026-11-01', to: '2026-11-21' })).rows).toEqual([]);
    expect((await fixedCostsView(deps(), { actor: viewer, storeId: B })).months.every((m) => !m.entered)).toBe(true);
    await setFixedCosts(deps(), { actor: owner, storeId: B }, { month: '2026-11', salaryMinor: 100, rentMinor: 0, utilitiesMinor: 0, otherMinor: 0 });
    await summaryTick(deps(), B);
    expect(theirs('SAMPLE-CO-2', '2026-11')!.map((m) => m.costs.salary)).toEqual([1]);
    expect(theirs('SAMPLE-CO-1', '2026-11')!.map((m) => m.costs.salary)).toEqual([45_000, 50_000]);
    expect(await t.prisma.erpBooksSend.count({ where: { storeId: B, linkId: { not: links[B] } } })).toBe(0);
  });

  it('qa-gate: reversing a line`s only entry makes the line not known again, never a 0 sent as if known', async () => {
    const w = { actor: owner, storeId: A };
    expect((await summaryOf(A, '2026-11-19'))!.body.incomplete).toContain('packaging');
    const e = await addCostEntry(deps(), w, { line: 'PACKAGING', day: '2026-11-19', amountMinor: 2_000 });
    expect((await summaryOf(A, '2026-11-19'))!.body.incomplete).not.toContain('packaging');
    const rev = await reverseCostEntry(deps(), w, e.id, { reason: 'entered on the wrong day' });
    expect(rev.resummarised).toBe(true);
    const after = (await summaryOf(A, '2026-11-19'))!;
    expect(after.body.incomplete).toContain('packaging');
    expect(after.body.costs.packaging).toBe(0); // what is known so far; listed as not known yet
    // Entered again (the right figure): known again.
    await addCostEntry(deps(), w, { line: 'PACKAGING', day: '2026-11-19', amountMinor: 1_500 });
    expect((await summaryOf(A, '2026-11-19'))!.body).toMatchObject({ costs: { packaging: 15 } });
    expect((await summaryOf(A, '2026-11-19'))!.body.incomplete).not.toContain('packaging');
  });

  it('qa-gate: a line or a month above the caps is refused; a stored month out of range never breaks the page or the tick', async () => {
    const w = { actor: owner, storeId: A };
    // The default caps: a line at most ৳10 crore, a month at most ৳40 crore.
    expect(await code(setFixedCosts(deps(), w, { month: '2026-12', ...NOV, salaryMinor: 10_000_000_001 }))).toBe('INVALID_INPUT');
    expect(await code(setFixedCosts(deps(), w, { month: '2026-12', ...NOV, salaryMinor: Number.MAX_SAFE_INTEGER }))).toBe('INVALID_INPUT');
    overrides.set(`books.costs.maxMonthMinor@${A}`, 10_000_000);
    overrides.set(`books.costs.maxLineMinor@${A}`, 9_000_000);
    expect(await code(setFixedCosts(deps(), w, { month: '2026-12', ...NOV, salaryMinor: 9_000_000 }))).toBe('INVALID_INPUT'); // 116,500 in all
    expect(await code(addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-20', amountMinor: 9_000_001 }))).toBe('INVALID_INPUT');
    overrides.delete(`books.costs.maxMonthMinor@${A}`);
    overrides.delete(`books.costs.maxLineMinor@${A}`);
    expect((await months(A, '2026-12')).length).toBe(1);
    // A month written before the caps with amounts out of the exact range: shown as unreadable, never sent, nothing fails.
    await t.prisma.erpFixedCostMonth.create({ data: { storeId: A, linkId: links[A]!, month: day('2026-12-01'), version: 2, salaryMinor: 2n ** 62n, rentMinor: 2n ** 62n, utilitiesMinor: 0n, otherMinor: 0n, note: null } });
    const view = await fixedCostsView(deps(), { actor: viewer, storeId: A });
    expect(view.months[1]).toMatchObject({ month: '2026-12', entered: true, version: 2, unreadable: true, lines: null, totalMinor: null, perDay: [] });
    expect(view.suggestion?.from).toBe('2026-11');
    const sent = (await sends(A)).length;
    await expect(summaryTick(deps(), A)).resolves.toMatchObject({ linked: true });
    await expect(summaryCheck(deps(), A)).resolves.toMatchObject({ linked: true });
    expect((await sends(A)).length).toBe(sent);
    // Set again with real numbers: readable, sent.
    expect(await setFixedCosts(deps(), w, { month: '2026-12', ...NOV })).toMatchObject({ changed: true, version: 3 });
    expect((await fixedCostsView(deps(), { actor: viewer, storeId: A })).months[1]).toMatchObject({ version: 3, unreadable: false, totalMinor: 7_150_000 });
  });

  it('qa-gate: the same request key twice (a double tap, a retry) writes one cost entry', async () => {
    const w = { actor: owner, storeId: A };
    const first = await addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-20', amountMinor: 300, requestKey: 'req-0001-sample' });
    const again = await addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-20', amountMinor: 300, requestKey: 'req-0001-sample' });
    expect(first.repeated).toBe(false);
    expect(again).toMatchObject({ id: first.id, repeated: true, resummarised: false });
    expect(await t.prisma.costEntry.count({ where: { storeId: A, refType: 'books.request', refId: 'req-0001-sample' } })).toBe(1);
    expect(await code(addCostEntry(deps(), w, { line: 'OTHER', day: '2026-11-20', amountMinor: 300, requestKey: 'bad key!' }))).toBe('INVALID_INPUT');
    // A key is per store: store B's own entry with the same key is its own.
    await setFixedCosts(deps(), { actor: owner, storeId: B }, { month: '2026-11', salaryMinor: 100, rentMinor: 0, utilitiesMinor: 0, otherMinor: 0 });
    const b = await addCostEntry(deps(), { actor: owner, storeId: B }, { line: 'OTHER', day: '2026-11-20', amountMinor: 300, requestKey: 'req-0001-sample' });
    expect(b.repeated).toBe(false);
    expect(b.id).not.toBe(first.id);
  });

  it('follow-up 567: `costlines.write` enters and reverses a daily cost line but never sets the fixed costs or the never-lines', async () => {
    const w = { actor: clerk, storeId: B };
    expect(await code(setFixedCosts(deps(), w, { month: '2026-11', salaryMinor: 999, rentMinor: 0, utilitiesMinor: 0, otherMinor: 0 }))).toBe('FORBIDDEN');
    const e = await addCostEntry(deps(), w, { line: 'PACKAGING', day: '2026-11-20', amountMinor: 1_200, note: 'poly bags' });
    expect(e.repeated).toBe(false);
    const rev = await reverseCostEntry(deps(), w, e.id, { reason: 'typed on the wrong day' });
    expect(await t.prisma.costEntry.findUniqueOrThrow({ where: { id: rev.id }, select: { amountMinor: true, refId: true } })).toEqual({ amountMinor: -1_200, refId: e.id });
    expect(await t.prisma.auditLog.count({ where: { entityId: { in: [e.id, rev.id] }, actorId: clerk.staffUserId } })).toBe(2);
    // The month's numbers stay the owner's: store B still holds only the owner's version.
    expect((await months(B, '2026-11')).map((m) => m.salaryMinor)).toEqual([100n]);
  });

  it('follow-up 565: an imported statement writes its courier charges or gateway fees as one cost line, only while its switch is on', async () => {
    const w = { actor: owner, storeId: B };
    const settlement = randomUUID();
    const courier = { kind: 'COURIER_SETTLEMENT' as const, statementId: settlement, reference: 'STM-0001', amountMinor: 48_000 };
    // Off as shipped: nothing is written.
    expect(await recordStatementCost(deps(), w, courier)).toEqual({ status: 'OFF' });
    expect(await t.prisma.costEntry.count({ where: { storeId: B, refId: settlement } })).toBe(0);
    overrides.set(`books.costs.fromStatements@${B}`, { courierCharges: true, gatewayFees: false });
    try {
      const r = await recordStatementCost(deps(), w, courier);
      expect(r.status).toBe('WRITTEN');
      const row = await t.prisma.costEntry.findUniqueOrThrow({ where: { id: r.id! } });
      const today = new Date(clock.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
      expect([row.summaryLine, row.amountMinor, row.module, row.refType, row.refId, row.detail, row.costDate?.toISOString().slice(0, 10)]).toEqual(['DELIVERY', 48_000, 'payments', 'courier.settlement', settlement, 'STM-0001', today]);
      // One entry per statement, ever.
      expect(await recordStatementCost(deps(), w, courier)).toEqual({ status: 'ALREADY', id: r.id });
      // It shows among the day's costs as from a statement, and is put right at its source, not reversed here.
      const listed = (await costEntries(deps(), { actor: viewer, storeId: B })).rows.find((x) => x.id === r.id)!;
      expect([listed.line, listed.manual, listed.canReverse]).toEqual(['DELIVERY', false, false]);
      expect(await code(reverseCostEntry(deps(), w, r.id!, { reason: 'wrong' }))).toBe('CONFLICT');
      expect(await t.prisma.auditLog.count({ where: { action: 'books.costLine.statement', entityId: r.id! } })).toBe(1);
      // The gateway part is still off; nothing to count is no entry; a v5 store has no books.
      expect(await recordStatementCost(deps(), w, { kind: 'GATEWAY_STATEMENT', statementId: randomUUID(), reference: 'BK-1', amountMinor: 2_750 })).toEqual({ status: 'OFF' });
      overrides.set(`books.costs.fromStatements@${B}`, { courierCharges: true, gatewayFees: true });
      expect(await recordStatementCost(deps(), w, { ...courier, statementId: randomUUID(), amountMinor: 0 })).toEqual({ status: 'NONE' });
      overrides.set(`books.costs.fromStatements@${C}`, { courierCharges: true, gatewayFees: true });
      expect(await recordStatementCost(deps(), { actor: SYSTEM, storeId: C }, { ...courier, statementId: randomUUID() })).toEqual({ status: 'NOT_LINKED' });
      // Above the line cap: not written (a person enters it by hand), kept in the audit log.
      overrides.set(`books.costs.maxLineMinor@${B}`, 1_000);
      const big = randomUUID();
      expect(await recordStatementCost(deps(), w, { kind: 'GATEWAY_STATEMENT', statementId: big, reference: 'BK-2', amountMinor: 5_000 })).toEqual({ status: 'TOO_BIG' });
      expect(await t.prisma.costEntry.count({ where: { storeId: B, refId: big } })).toBe(0);
      expect(await t.prisma.auditLog.count({ where: { action: 'books.costLine.statementSkipped', entityId: big } })).toBe(1);
      overrides.delete(`books.costs.maxLineMinor@${B}`);
      const fee = await recordStatementCost(deps(), w, { kind: 'GATEWAY_STATEMENT', statementId: big, reference: 'BK-2', amountMinor: 5_000 });
      expect(fee.status).toBe('WRITTEN');
      expect((await t.prisma.costEntry.findUniqueOrThrow({ where: { id: fee.id! } })).summaryLine).toBe('PAYMENT_FEES');
    } finally {
      overrides.delete(`books.costs.fromStatements@${B}`);
      overrides.delete(`books.costs.fromStatements@${C}`);
      overrides.delete(`books.costs.maxLineMinor@${B}`);
    }
  });

  it('a closed month takes no new fixed costs and no new cost entries', async () => {
    await t.prisma.booksPeriodClose.create({ data: { storeId: A, linkId: links[A]!, level: 'MONTH', periodStart: day('2026-11-01'), periodEnd: day('2026-11-30'), version: 1, result: 'MATCHED', openingBalanceMinor: 0n, closingBalanceMinor: 0n, matchedDays: 30, totalDays: 30, figures: {}, hash: 'test' } });
    expect(await code(setFixedCosts(deps(), { actor: owner, storeId: A }, { month: '2026-11', ...NOV, otherMinor: 1 }))).toBe('BOOKS_DAY_CLOSED');
    expect(await code(addCostEntry(deps(), { actor: owner, storeId: A }, { line: 'OTHER', day: '2026-11-20', amountMinor: 100 }))).toBe('BOOKS_DAY_CLOSED');
    const fee = (await costEntries(deps(), { actor: viewer, storeId: A }, { from: '2026-11-21', to: '2026-11-21' })).rows[0]!;
    expect(fee.canReverse).toBe(false);
    expect(await code(reverseCostEntry(deps(), { actor: owner, storeId: A }, fee.id, { reason: 'too late' }))).toBe('BOOKS_DAY_CLOSED');
  });
});
