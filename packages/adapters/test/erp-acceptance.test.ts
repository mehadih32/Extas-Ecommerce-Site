// CN-029 Phase 2 · PR 621 — the ERP v6 acceptance checks (docs/erp/site-changes-v6.md §4) through the real HTTP client
// against the practice ERP (no network, no database): every check passes with the ERP's own actions driven; without
// them (the demo ERP) those checks are SKIP "needs the ERP's own action" and never faked; with writes off only the
// reads run; an ERP that cannot be reached is reported as such and fails nothing; an ERP that answers a wrong figure
// fails the check that saw it; and one ERP company's key never reads or writes another's.
import { describe, expect, it } from 'vitest';
import { createErpHttpClient, ERP_ACCEPTANCE_CHECKS, ErpError, MockErpWorld, acceptanceMarkdown, runErpAcceptance, seedAcceptanceStyle, type AcceptanceDriver, type ErpApi } from '../src';

const BASE = 'https://erp.example.test';
const T0 = new Date('2026-10-23T04:00:00Z'); // 10:00 in Dhaka

function practice() {
  const w = new MockErpWorld();
  let clock = T0;
  w.now = () => clock;
  const api = createErpHttpClient({ baseUrl: BASE, apiKey: w.defaultKey, provider: 'extasErp', fetch: w.fetch });
  const driver: AcceptanceDriver = {
    world: w,
    v6: w.v6(),
    days: (n) => {
      clock = new Date(clock.getTime() + n * 86_400_000);
    },
  };
  return { w, api, driver, now: () => clock };
}

const byId = (r: Awaited<ReturnType<typeof runErpAcceptance>>) => Object.fromEntries(r.results.map((x) => [x.id, x]));

describe('PR 621 · the ERP v6 acceptance checks against the practice ERP', () => {
  it('with the ERP`s own actions driven and writes on, every check of §4 passes', async () => {
    const { api, driver, now } = practice();
    const r = await runErpAcceptance(api, { target: 'practice', runId: 'T1', writes: true, driver, timeoutMs: 5000, now });
    const failed = r.results.filter((x) => x.status !== 'PASS').map((x) => `${x.id}: ${x.status} ${x.note}`);
    expect(failed).toEqual([]);
    expect([r.passed, r.failed, r.skipped, r.unreachable]).toEqual([ERP_ACCEPTANCE_CHECKS.length, 0, 0, false]);
    expect(r.results.map((x) => x.id)).toEqual(ERP_ACCEPTANCE_CHECKS.map((x) => x.id));
    // The report page names every check and never a key.
    const md = acceptanceMarkdown(r, 'ERP acceptance (practice)');
    expect(md).toContain('| PASS |');
    expect(md).not.toContain(practice().w.defaultKey);
  });

  it('without the ERP`s own actions (the demo ERP) those checks are SKIP, never faked; the rest pass', async () => {
    const { api, w, now } = practice();
    // The demo ERP has its own catalogue; the practice ERP is given one like it.
    seedAcceptanceStyle({ world: w });
    const r = await runErpAcceptance(api, { target: 'demo', runId: 'T2', writes: true, driver: null, timeoutMs: 5000, now });
    const s = byId(r);
    for (const ch of ERP_ACCEPTANCE_CHECKS) {
      if (ch.kind === 'driver') expect([ch.id, s[ch.id]!.status, s[ch.id]!.note]).toEqual([ch.id, 'SKIP', "needs the ERP's own action"]);
      else expect([ch.id, s[ch.id]!.status]).toEqual([ch.id, 'PASS']);
    }
    expect(r.failed).toBe(0);
  });

  it('with writes off only the reads and the local checks run; nothing is sent to the ERP', async () => {
    const { api, w, now } = practice();
    seedAcceptanceStyle({ world: w });
    const r = await runErpAcceptance(api, { target: 'demo', runId: 'T3', writes: false, driver: null, timeoutMs: 5000, now });
    for (const x of r.results) expect([x.id, x.status]).toEqual([x.id, x.kind === 'read' || x.kind === 'local' ? 'PASS' : 'SKIP']);
    expect(w.v6().orders.size).toBe(0);
    expect(w.v6().summaries.size).toBe(0);
  });

  it('an ERP that cannot be reached is reported as unreachable: every check SKIP, none failed', async () => {
    const api = createErpHttpClient({
      baseUrl: BASE,
      apiKey: 'sample-key-not-real',
      provider: 'extasErp',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const r = await runErpAcceptance(api, { target: 'demo', runId: 'T4', writes: true, timeoutMs: 1000 });
    expect([r.unreachable, r.failed, r.skipped]).toEqual([true, 0, ERP_ACCEPTANCE_CHECKS.length]);
    expect(r.results[0]!.note).toMatch(/could not be reached \(NETWORK\)/);
  });

  // qa-gate B1: a demo ERP that answers the first call and then goes down, or has not deployed a v6 read yet, is
  // "could not be reached": SKIP and `unreachable`, the same in every check; it never stops a release.
  const urlOf = (input: Parameters<typeof fetch>[0]) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  function demoWith(rule: (url: string) => Response | null) {
    const { w, now } = practice();
    seedAcceptanceStyle({ world: w });
    const fetch: typeof globalThis.fetch = async (input, init) => rule(urlOf(input)) ?? w.fetch(urlOf(input), init ?? {});
    return { w, now, api: createErpHttpClient({ baseUrl: BASE, apiKey: w.defaultKey, provider: 'extasErp', fetch }) };
  }
  const down = (url: string) => (url.includes('/health') ? null : answer(503, { error: { code: 'UNAVAILABLE', message: 'maintenance' } }));
  const noV6Reads = (url: string) => (/\/(account|switch-over|cost-of-goods)/.test(url) ? answer(404, { error: { code: 'NOT_FOUND', message: 'no route' } }) : null);

  it('qa-gate B1: the demo ERP answers health, then every call is a 503: every check SKIP or PASS, none failed, unreachable', async () => {
    for (const writes of [false, true]) {
      const { api, now } = demoWith(down);
      const r = await runErpAcceptance(api, { target: 'demo', runId: `B1D${writes ? 'W' : ''}`, writes, driver: null, timeoutMs: 2000, now });
      expect([writes, r.failed, r.unreachable]).toEqual([writes, 0, true]);
      const s = byId(r);
      for (const id of ['catalog.styleImport', 'account.period', 'switchOver.read', 'costOfGoods.read']) expect([id, s[id]!.status, s[id]!.note]).toEqual([id, 'SKIP', expect.stringMatching(/could not be reached .*\(SERVER 503\)/)]);
      if (writes) for (const id of ['orders.billAtShipment', 'returnLists.handBack', 'exchanges.watch', 'fixedCosts.spread']) expect([id, s[id]!.status]).toEqual([id, 'SKIP']);
      expect(s['siteCalls.signature']!.status).toBe('PASS');
    }
  });

  it('qa-gate B1: a demo ERP without /account, /switch-over and /cost-of-goods (404) skips those three; the rest pass', async () => {
    const { api, now } = demoWith(noV6Reads);
    const r = await runErpAcceptance(api, { target: 'demo', runId: 'B1N', writes: false, driver: null, timeoutMs: 2000, now });
    const s = byId(r);
    expect([r.failed, r.unreachable]).toEqual([0, true]);
    for (const id of ['account.period', 'switchOver.read', 'costOfGoods.read']) expect([id, s[id]!.status, s[id]!.note]).toEqual([id, 'SKIP', expect.stringMatching(/\(NOT_FOUND 404\)/)]);
    expect([s['contract.health']!.status, s['catalog.styleImport']!.status]).toEqual(['PASS', 'PASS']);
  });

  it('CN-033 · a fresh start: the switch-over list and the cost of goods are "not built in the ERP", never asked, never an outage', async () => {
    const asked: string[] = [];
    const { api, now } = demoWith((url) => {
      if (/\/(switch-over|cost-of-goods)/.test(url)) asked.push(url);
      return noV6Reads(url);
    });
    for (const target of ['demo', 'practice']) {
      const r = await runErpAcceptance(api, { target, runId: `FS-${target}`, writes: false, driver: null, timeoutMs: 2000, now, switchOver: 'fresh-start', only: ['contract.health', 'switchOver.read', 'costOfGoods.read'] });
      const s = byId(r);
      for (const id of ['switchOver.read', 'costOfGoods.read']) expect([id, s[id]!.status, s[id]!.note]).toEqual([id, 'SKIP', 'not built in the ERP (decision 30 Oct 2026); this shop switches as a fresh start']);
      expect([s['contract.health']!.status, r.failed, r.unreachable]).toEqual(['PASS', 0, false]);
    }
    expect(asked).toEqual([]);
    // The ERP's list (the earlier way) still reads them, as before.
    const r = await runErpAcceptance(api, { target: 'demo', runId: 'FS-list', writes: false, driver: null, timeoutMs: 2000, now, switchOver: 'erp-list', only: ['switchOver.read'] });
    expect(byId(r)['switchOver.read']).toMatchObject({ status: 'SKIP', note: expect.stringMatching(/could not be reached/) });
    expect(asked.length).toBeGreaterThan(0);
  });

  it('qa-gate B1: the practice ERP stays the hard gate: the same outage fails the run', async () => {
    const { w, now } = practice();
    seedAcceptanceStyle({ world: w });
    const fetch: typeof globalThis.fetch = async (input, init) => down(urlOf(input)) ?? w.fetch(urlOf(input), init ?? {});
    const r = await runErpAcceptance(createErpHttpClient({ baseUrl: BASE, apiKey: w.defaultKey, provider: 'extasErp', fetch }), { target: 'practice', runId: 'B1P', writes: false, driver: null, timeoutMs: 2000, now });
    expect(r.unreachable).toBe(false);
    expect(byId(r)['account.period']).toMatchObject({ status: 'FAIL', note: expect.stringContaining('SERVER') });
    expect(r.failed).toBeGreaterThan(0);
  });

  it('qa-gate B1: on the demo ERP an answer that breaks the contract, or a bug of ours, still fails', async () => {
    const { api, now } = demoWith((url) => (url.includes('/switch-over') ? answer(200, { nonsense: true }) : null));
    const bug: ErpApi = { ...api, v6: { ...api.v6!, costOfGoods: async () => { throw new TypeError('a bug of ours'); } } };
    const r = await runErpAcceptance(bug, { target: 'demo', runId: 'B1X', writes: false, driver: null, timeoutMs: 2000, now, only: ['switchOver.read', 'costOfGoods.read', 'account.period'] });
    const s = byId(r);
    expect(s['switchOver.read']).toMatchObject({ status: 'FAIL', note: expect.stringContaining('BAD_RESPONSE') });
    expect(s['costOfGoods.read']!.status).toBe('FAIL');
    expect(s['account.period']!.status).toBe('PASS');
    expect(r.unreachable).toBe(false);
  });

  it('an ERP that answers a wrong figure fails the check that saw it, with what it got', async () => {
    const { api, driver, now } = practice();
    // The ERP quotes one paisa more than its own shop prices.
    const wrong: ErpApi = {
      ...api,
      v6: api.v6,
      async push(doc, o) {
        const r = await api.push(doc, o);
        if (doc.type === 'order.create' && (doc.body as { externalOrderId: string }).externalOrderId.endsWith('-BILL')) return { ...r, body: { ...(r.body as object), erpTotal: Number((r.body as { erpTotal: number }).erpTotal) + 0.01 } };
        return r;
      },
    };
    const r = await runErpAcceptance(wrong, { target: 'practice', runId: 'T5', writes: true, driver, timeoutMs: 5000, now, only: ['orders.billAtShipment', 'orders.cancelNeverBilled'] });
    expect(byId(r)['orders.billAtShipment']).toMatchObject({ status: 'FAIL', note: expect.stringContaining('erpTotal at the shop prices: got 105001, expected 105000') });
    expect(byId(r)['orders.cancelNeverBilled']!.status).toBe('PASS');
  });

  it('CN-029 §16: one ERP company`s key never reads or writes another`s orders, account or summaries', async () => {
    const w = new MockErpWorld();
    w.now = () => T0;
    const coA = w.companyForStore(1);
    const coB = w.companyForStore(2);
    const a = createErpHttpClient({ baseUrl: BASE, apiKey: w.keyFor(coA), provider: 'extasErp', fetch: w.fetch });
    const b = createErpHttpClient({ baseUrl: BASE, apiKey: w.keyFor(coB), provider: 'extasErp', fetch: w.fetch });
    const ra = await runErpAcceptance(a, { target: 'practice', runId: 'ISO', writes: true, driver: { world: w, v6: w.v6(coA), days: () => {} }, timeoutMs: 5000, now: () => T0, only: ['orders.billAtShipment'] });
    expect(ra.failed).toBe(0);
    const err = await b.v6!.order('ACC-ISO-BILL').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErpError);
    expect((err as ErpError).code).toBe('NOT_FOUND');
    expect((await b.v6!.account()).balance).toBe('0');
    expect(Number((await a.v6!.account()).balance)).toBeGreaterThan(0);
    expect(w.v6(coB).orders.size).toBe(0);
  });
});
