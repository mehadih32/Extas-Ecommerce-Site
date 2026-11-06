// Tests for the 70-order simulation on the runner (PR 414 follow-up, follow-up 668, CN-036). The browser part runs on
// the VM (GATE_PLAN=simulation infra/deploy/gate-orders.sh; .github/workflows/simulation.yml, by hand only).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DEVICES, NETWORKS } from '../gate-orders/lib/profiles.mjs';
import { DATA } from '../gate-orders/lib/test-data.mjs';
import { planOf } from '../gate-orders/shop.mjs';
import { courierOf, courierState, payOf, payState, simulationMarkdown, simulationSummary, tableRows } from './lib.mjs';
import { writeSimulationReport } from './report.mjs';
import { NOT_A_CODE, PLAN, PLAN_DATA, pickScenarios, resetMemory, SCENARIOS } from './scenarios.mjs';

const doc = (p) => readFileSync(new URL(`../../docs/qa/${p}`, import.meta.url), 'utf8');
const KNOWN = ['twoSizes', 'repeat', 'bengali', 'bnDigits', 'cancel', 'doubleTap', 'dropAtConfirm', 'noBlock', 'addressUnclear', 'couponRefused', 'ownerCoupon'];
// the owner's go-live decision (6 Nov 2026): cash on delivery only, every online method off
const COD_ONLY = { cod: true, mobile: { enabled: false, list: ['bkash', 'nagad'] }, card: false, online: false, coupon: null };
const NO_COURIER_ACCOUNTS = { providers: ['mockCourier', 'steadfast', 'pathao'], accounts: [] };

afterEach(() => resetMemory());

it('plays the 70 orders, each on a known device, network and test address, with a basket the bag can hold', () => {
  expect(PLAN_DATA.rows.map((r) => r.n)).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
  for (const r of PLAN_DATA.rows) {
    expect(DEVICES[r.device], `order ${r.n}`).toBeTruthy();
    expect(NETWORKS[r.network], `order ${r.n}`).toBeTruthy();
    expect(DATA.addresses.some((a) => a.id === r.address), `order ${r.n}: ${r.address}`).toBe(true);
    expect(['city', 'sub', 'outside']).toContain(r.area);
    expect(['en', 'bn']).toContain(r.lang);
    for (const c of r.checks) expect(KNOWN, `order ${r.n}`).toContain(c);
    expect(r.lines).toBeGreaterThanOrEqual(1);
    expect(r.qty).toBeGreaterThanOrEqual(1);
    expect(r.qty, `order ${r.n}: quantity on one line only, at most 3`).toBeLessThanOrEqual(r.lines === 1 ? 3 : 1);
  }
  expect(SCENARIOS).toHaveLength(70);
  expect(PLAN.range).toBe('1–70');
});

it('keeps the plan\'s columns: day, persona, pay and courier match SIMULATION-PLAN §3 and SIMULATION-REPORT P2.2', () => {
  const part1 = tableRows(doc('SIMULATION-PLAN.md'), '## 3. The event list');
  const part2 = tableRows(doc('SIMULATION-REPORT.md'), '## P2.2 Per-order table');
  expect(part1).toHaveLength(50);
  expect(part2).toHaveLength(20);
  for (const md of part1) {
    const r = PLAN_DATA.rows.find((x) => x.n === Number(md[0]));
    expect(r, md[0]).toBeTruthy();
    expect([r.day, r.persona, r.pay, r.courier], `order ${md[0]}`).toEqual([md[1], md[2], payOf(md[6]), courierOf(md[7])]);
  }
  for (const md of part2) {
    const r = PLAN_DATA.rows.find((x) => x.n === Number(md[0]));
    expect([r.day, r.persona, r.pay], `order ${md[0]}`).toEqual([md[1], md[2], payOf(md[4])]);
  }
  // the plan's mix: 40 of the first 50 end on cash on delivery (43 starts on bKash)
  expect(PLAN_DATA.rows.slice(0, 50).filter((r) => r.pay === 'cod' || r.pay === 'bkash-cod')).toHaveLength(40);
});

it('reads the plan\'s Pay and Courier words', () => {
  expect(['COD', 'bKash', 'Nagad', 'Card', 'Advance (bank)', 'bKash advance', 'bKash → COD', 'COD + ৳5,550 bKash outside', 'Bank transfer', 'COD (father pays)'].map(payOf)).toEqual(['cod', 'bkash', 'nagad', 'card', 'bank', 'bank', 'bkash-cod', 'cod', 'bank', 'cod']);
  expect(['Steadfast', 'Pathao', 'RedX', '–'].map(courierOf)).toEqual(['steadfast', 'pathao', 'redx', null]);
});

it('skips a method the shop has switched off with its reason, never a failure (COD only at go-live)', () => {
  expect(payState('cod', COD_ONLY)).toEqual({ how: 'cod' });
  expect(payState('bkash', COD_ONLY).skip).toMatch(/bKash is switched off on the shop/);
  expect(payState('nagad', COD_ONLY).skip).toMatch(/Nagad is switched off/);
  expect(payState('card', COD_ONLY).skip).toMatch(/card payment is switched off/);
  expect(payState('bank', COD_ONLY).skip).toMatch(/not a checkout method/);
  expect(payState('bkash-cod', COD_ONLY)).toMatchObject({ how: 'cod', first: null });
  const wallets = { ...COD_ONLY, mobile: { enabled: true, list: ['bkash'] } };
  expect(payState('bkash', wallets, null)).toEqual({ how: 'bkash' });
  expect(payState('bkash', wallets, 'the mock bKash page is closed').skip).toBe('the mock bKash page is closed');
  expect(payState('nagad', wallets).skip).toMatch(/Nagad is switched off/);
});

it('skips a courier the shop does not have or has switched off; one with no account yet books on the run\'s mock', () => {
  expect(courierState('redx', NO_COURIER_ACCOUNTS).skip).toMatch(/no RedX courier/);
  expect(courierState('pathao', { ...NO_COURIER_ACCOUNTS, accounts: [{ provider: 'pathao', enabled: false }] }).skip).toMatch(/Pathao is switched off/);
  expect(courierState('pathao', { ...NO_COURIER_ACCOUNTS, accounts: [{ provider: 'pathao', enabled: false }, { provider: 'pathao', enabled: true }] })).toMatchObject({ book: true });
  expect(courierState('steadfast', NO_COURIER_ACCOUNTS)).toMatchObject({ book: true, note: expect.stringMatching(/no Steadfast account yet/) });
  expect(courierState(null, NO_COURIER_ACCOUNTS)).toMatchObject({ book: false });
  expect(courierState('any', NO_COURIER_ACCOUNTS)).toMatchObject({ book: true });
  expect(courierState('steadfast', null)).toMatchObject({ book: true });
});

it('runs all, or the orders named, and names an unknown one', () => {
  expect(pickScenarios('all').picked).toHaveLength(70);
  expect(pickScenarios(' 13, 01 55 ').picked.map((s) => s.id)).toEqual(['1', '13', '55']);
  expect(pickScenarios('3,99')).toMatchObject({ unknown: ['99'] });
});

it('is a scenario set of the gate-orders run beside the gate\'s own 18', async () => {
  const sim = await planOf('simulation');
  expect(sim.kind).toBe('simulation');
  expect(sim.SCENARIOS).toHaveLength(70);
  expect(sim.coverageGoal).toBe(false);
  expect(typeof sim.writeReport).toBe('function');
  const gate = await planOf('');
  expect([gate.kind, gate.SCENARIOS.length, gate.range]).toEqual(['gate-orders', 18, '1–18']);
  await expect(planOf('everything')).rejects.toThrow(/no scenario set/);
});

/** A stand-in for the run's `x` (shop.mjs): the shop answers as a healthy shop with cash on delivery on. */
function fakeX({ sw = COD_ONLY, couriers = NO_COURIER_ACCOUNTS, status = 'PLACED', canBook = null } = {}) {
  const calls = [];
  let n = 0;
  let nextOrder = 1000;
  const orders = new Map();
  const stock = {};
  const x = {
    sw,
    canPrepay: 'bKash is not offered at the checkout (Payments › mobile wallets)',
    canBook,
    since: '2026-11-06T00:00:00.000Z',
    opened: 0,
    v: (k) => Array.from({ length: k }, (_, i) => ({ id: `v${i}` })),
    polos: (k) => Array.from({ length: k }, (_, i) => ({ id: `p${i}` })),
    newCustomer: () => ({ n: ++n, phone: `0171000000${n}` }),
    secret: () => {},
    booked: () => {},
    open: async () => {
      x.opened += 1;
      return { page: { evaluate: async () => ({ status: 404, ok: false, error: 'checkout.CODE_NOT_FOUND' }) } };
    },
    settle: async () => null,
    order: async (sh, spec) => {
      if (spec.beforeCheckout) await spec.beforeCheckout(sh);
      const number = String(++nextOrder);
      const qty = spec.qty ?? 1;
      for (const v of spec.items) stock[v.id] = (stock[v.id] ?? 10) - qty;
      orders.set(number, { phone: spec.customer.phone, items: spec.items.map((v) => ({ sku: 'GATE', quantity: qty, id: v.id })), lang: spec.lang, status });
      return { number, next: `/checkout/thanks/${number}` };
    },
    call: async (a, b = {}) => {
      calls.push(a);
      if (a === 'couriers') return couriers;
      if (a === 'ordersOf') return { orders: [...orders.values()].filter((o) => o.phone === b.phone) };
      if (a === 'order') {
        const o = orders.get(b.number);
        return { ...o, paymentMethod: 'COD', totalMinor: 150000, paidMinor: 0, dueMinor: 150000, customerId: 'c1', couponApplied: false, discountMinor: 0, addressUnclear: true };
      }
      if (a === 'stock') return Object.fromEntries(b.variantIds.map((id) => [id, stock[id]]));
      if (a === 'cancel') {
        const o = orders.get(b.number);
        o.status = 'CANCELLED';
        for (const i of o.items) stock[i.id] += i.quantity;
        return { outcome: 'cancelled' };
      }
      if (a === 'book') return { booked: true, courier: { codMinor: 150000 }, sticker: { collectMinor: 150000 } };
      throw new Error(`unexpected ${a}`);
    },
  };
  return { x, calls };
}

const scenario = (n) => SCENARIOS.find((s) => s.id === String(n));

it('a bKash, card, bank or RedX row is a SKIP before any browser opens', async () => {
  for (const n of [2, 21, 10, 5]) {
    const { x } = fakeX();
    const checks = await scenario(n).run(x);
    expect(checks.map((c) => c.verdict), `order ${n}`).toEqual(['SKIP']);
    expect(x.opened, `order ${n}`).toBe(0);
  }
});

it('a cash-on-delivery row places one order, checks lines, the due and the booking at that due', async () => {
  const { x, calls } = fakeX();
  const checks = await scenario(1).run(x);
  expect(checks.every((c) => c.verdict === 'PASS'), JSON.stringify(checks)).toBe(true);
  expect(checks.map((c) => c.id)).toEqual(['placed', 'one order for this shopper', '1 line(s)', 'quantity 2', 'cash on delivery: the rider collects the order\'s due', 'booked with the courier', 'the courier collects the order\'s due', 'the sticker says collect the order\'s due']);
  expect(calls.filter((c) => c === 'couriers')).toHaveLength(1);
});

it('a risky buyer\'s order stands (no automatic block), then the shop declines it and the stock comes back', async () => {
  const { x } = fakeX();
  const checks = await scenario(7).run(x);
  const by = Object.fromEntries(checks.map((c) => [c.id, c.verdict]));
  expect(by['no automatic block (a person decides)']).toBe('PASS');
  expect(by['cancelled before packing']).toBe('PASS');
  expect(by['the stock is released']).toBe('PASS');
  expect(by['booked with the courier']).toBeUndefined();
});

it('a code that is not his is refused with a reason; a repeat buyer is kept as one customer', async () => {
  const { x } = fakeX();
  const first = await scenario(3).run(x);
  expect(first.every((c) => c.verdict === 'PASS')).toBe(true);
  const rep = await scenario(4).run(x);
  expect(rep.find((c) => c.id === 'one customer for the repeat buyer')?.verdict).toBe('PASS');
  expect(rep.find((c) => c.id.startsWith('his orders in this run'))?.verdict).toBe('PASS');
  const coupon = await scenario(15).run(x);
  expect(coupon.find((c) => c.id === 'a code that is not his is refused with a reason')).toMatchObject({ verdict: 'PASS', detail: 'checkout.CODE_NOT_FOUND' });
  expect(NOT_A_CODE).toMatch(/^GATETEST/);
});

it('the owner\'s coupon and booking blocked by a real courier are SKIPs with their reasons', async () => {
  const { x } = fakeX({ canBook: 'a real courier is switched on (COURIER (steadfast)): no test parcel is booked' });
  const checks = await scenario(44).run(x);
  expect(checks.find((c) => c.id === "the owner's coupon")?.verdict).toBe('SKIP');
  expect(checks.find((c) => c.id === 'booked')?.detail).toMatch(/real courier/);
  expect(checks.find((c) => c.id === 'the order is in Bengali')?.verdict).toBe('PASS');
});

it('writes the Bengali and English report, result.json with the counts, and orders.md, without the run\'s secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sim-'));
  try {
    const rows = [
      { id: '1', title: 't', verdict: 'PASS', orders: ['1001'], checks: [{ id: 'placed', verdict: 'PASS', detail: 'order 1001' }] },
      { id: '2', title: 't', verdict: 'SKIP', orders: [], checks: [{ id: 'payment method', verdict: 'SKIP', detail: 'bKash is switched off on the shop (Payments › mobile wallets)' }] },
      { id: '9', title: 't', verdict: 'SKIP', orders: [], checks: [{ id: 'payment method', verdict: 'SKIP', detail: 'bKash is switched off on the shop (Payments › mobile wallets)' }] },
      { id: '5', title: 't', verdict: 'SKIP', orders: [], checks: [{ id: 'courier', verdict: 'SKIP', detail: 'the shop has no RedX courier (no connection for it in this build)' }] },
    ];
    const run = { at: '2026-11-06 20:00 (Asia/Dhaka)', sha: 'abc', asked: '1,2,5,9', rows, problems: ['token sekret-123 seen'], cleanup: { ok: true, cancelled: 1, salesOk: true }, payment: { cod: 'on (the owner\'s setting)', mockPay: 'x' }, providers: { live: [] }, gateChecks: [], addressRows: [] };
    writeSimulationReport(dir, run, ['sekret-123']);
    const res = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    expect(res.kind).toBe('simulation');
    expect(res.ok).toBe(true);
    expect(res.simulation).toMatchObject({ planned: 70, asked: 4, passed: 1, failed: 0, skipped: 3, orders: 1 });
    expect(res.simulation.skipReasons[0]).toEqual({ why: 'bKash is switched off on the shop (Payments › mobile wallets)', rows: [2, 9] });
    expect(res.rows.find((r) => r.id === '1').plan).toMatchObject({ persona: 'FT', pay: 'cod', courier: 'steadfast' });
    const md = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(md).toMatch(/^# The 70-order real-life journey simulation/);
    expect(md).toContain('পরিকল্পনার 70টা অর্ডারের মধ্যে 4টা চালানো হয়েছে: 1টা পাস, 0টা ফেল, 3টা বাদ');
    expect(md).toContain('| 02, 09 | 2 |');
    expect(md).toContain('— not asked');
    expect(md).not.toContain('sekret-123');
    const orders = readFileSync(join(dir, 'orders.md'), 'utf8');
    expect(orders).toMatch(/^# The 70-order simulation — every order's details/);
    expect(orders).not.toContain('Actions › **gate-orders**');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('fails the run on a failed row or an unfinished clean-up, and passes only with something proved', () => {
  const pass1 = [{ id: '1', verdict: 'PASS', orders: ['1'], checks: [] }];
  expect(simulationSummary(pass1, PLAN_DATA).ok).toBe(true);
  expect(simulationSummary([{ id: '2', verdict: 'SKIP', orders: [], checks: [{ id: 'x', verdict: 'SKIP', detail: 'off' }] }], PLAN_DATA).ok).toBe(false);
  expect(simulationSummary([...pass1, { id: '3', verdict: 'FAIL', orders: ['2'], checks: [] }], PLAN_DATA).ok).toBe(false);
  const sum = simulationSummary(pass1, PLAN_DATA);
  expect(simulationMarkdown({ at: 'x', cleanup: { ok: false } }, sum)).toContain('**FAIL**');
});
