// Tests for the verdicts and timings of the gate's test orders (PR 414 follow-up, CN-013 phase 2).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { budgetOf, check, fail, median, overBudget, pass, scenarioVerdict, skip, STEPS, summarise, timingsTable } from './verdict.mjs';

const lhrc = JSON.parse(readFileSync(new URL('../../../lighthouserc.json', import.meta.url), 'utf8'));

it('a scenario fails on one failed check, is skipped when every check is, and passes otherwise', () => {
  expect(scenarioVerdict([pass('a'), skip('b', 'off'), pass('c')])).toBe('PASS');
  expect(scenarioVerdict([pass('a'), fail('b', 'x')])).toBe('FAIL');
  expect(scenarioVerdict([skip('a', 'off'), skip('b', 'off')])).toBe('SKIP');
  expect(scenarioVerdict([])).toBe('SKIP');
  expect(check('x', true, 'fine', 'but off')).toEqual({ id: 'x', verdict: 'SKIP', detail: 'but off' });
  expect(skip('x')).toMatchObject({ verdict: 'SKIP', detail: 'skipped' });
});

it("the speed budget is the repository's Lighthouse budget, never a number of its own", () => {
  const b = budgetOf(lhrc);
  const a = lhrc.ci.assert.assertions;
  expect(b.page).toBe(a['largest-contentful-paint'][1].maxNumericValue);
  expect(b.press).toBe(a['server-response-time'][1].maxNumericValue);
  expect(budgetOf({})).toMatchObject({ page: null, press: null });
});

it('flags a page over the paint budget and a press whose server share is over the server budget', () => {
  const budget = { page: 1000, press: 100 };
  const t = { firstLoad: { ms: 3000, lcpMs: 900 }, productPage: { ms: 1500, lcpMs: null }, addToBag: { ms: 900, serverMs: 150 }, submit: { ms: 400, serverMs: 50 } };
  expect(overBudget(t, budget)).toEqual([
    { step: 'productPage', valueMs: 1500, limitMs: 1000 },
    { step: 'addToBag', valueMs: 150, limitMs: 100 },
  ]);
  expect(overBudget(t, { page: null, press: null })).toEqual([]);
  expect(overBudget(null, budget)).toEqual([]);
});

it('the timings table: the median of each step per network and screen, slow networks first', () => {
  const r = (cls, network, ms) => ({ cls, network, timings: Object.fromEntries(STEPS.map((s) => [s.key, { ms }])) });
  const table = timingsTable([r('phone', '4g', 100), r('phone', '4g', 300), r('phone', '4g', 200), r('desktop', 'wifi', 50), r('phone', 'slow-3g', 900), { cls: 'phone', network: '4g', timings: null }]);
  expect(table.map((t) => `${t.network}/${t.cls}/${t.orders}`)).toEqual(['slow-3g/phone/1', '4g/phone/3', 'wifi/desktop/1']);
  expect(table[1].steps.firstLoad).toBe(200);
  expect(median([4, 1, 3, 2])).toBe(2);
  expect(median([null, undefined])).toBeNull();
});

it('sums up a run', () => {
  const rows = [{ verdict: 'PASS', orders: ['1', '2'] }, { verdict: 'SKIP', orders: [] }, { verdict: 'FAIL' }];
  expect(summarise(rows)).toEqual({ scenarios: 3, passed: 1, failed: 1, skipped: 1, ok: false, orders: 2 });
  expect(summarise([]).ok).toBe(false);
});
