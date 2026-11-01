// Tests for the scenario list of the go-live test-order run (PR 414 follow-up, CN-013 phase 2). The browser part runs on
// the VM (infra/deploy/gate-orders.sh, by hand only).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { classOf, DEVICES, NETWORKS } from './lib/profiles.mjs';
import { GATE_CHECKS, GATE_SCENARIO, pickScenarios, SCENARIOS, unreachedGate } from './scenarios.mjs';
import { variantPool } from './shop.mjs';

it('has the 18 scenarios of the owner\'s list, each on a known device and network, most of them on phones', () => {
  expect(SCENARIOS.map((s) => s.id)).toEqual(Array.from({ length: 18 }, (_, i) => String(i + 1)));
  for (const s of SCENARIOS) {
    expect(DEVICES[s.device], s.id).toBeTruthy();
    expect(NETWORKS[s.network], s.id).toBeTruthy();
    expect(typeof s.run).toBe('function');
  }
  const phones = SCENARIOS.filter((s) => classOf(s.device) === 'phone').length;
  expect(phones).toBeGreaterThan(SCENARIOS.length / 2);
  for (const n of Object.keys(NETWORKS)) expect(SCENARIOS.some((s) => s.network === n), n).toBe(true);
  expect(Object.keys(GATE_CHECKS)).toEqual(['1', '4', '7', '21', '23', '24']);
});

it('runs all, or the scenarios named, and names an unknown one instead of guessing', () => {
  expect(pickScenarios('all').picked).toHaveLength(18);
  expect(pickScenarios('').picked).toHaveLength(18);
  expect(pickScenarios(' 5, 1 7 ').picked.map((s) => s.id)).toEqual(['1', '5', '7']);
  expect(pickScenarios('3,99')).toMatchObject({ unknown: ['99'] });
});

it('keeps the last-piece and race pieces out of every other scenario', () => {
  const v = (product, colour, size) => ({ id: `${product}-${colour}-${size}`, colour: `gate-test-${colour}`, size: `gate-test-${size}`, weightGrams: 700 });
  const products = [
    { key: 'polo', slug: 'gate-test-polo', variants: ['black', 'white'].flatMap((c) => ['s', 'm', 'l', 'xl'].map((s) => v('polo', c, s))) },
    { key: 'shirt', slug: 'gate-test-shirt', variants: ['black', 'navy'].flatMap((c) => ['m', 'xl'].map((s) => v('shirt', c, s))) },
  ];
  const pool = variantPool(products);
  expect(pool.reserved.lastPiece.id).toBe('polo-white-xl');
  expect(pool.reserved.race.id).toBe('shirt-navy-xl');
  const handed = pool.take(40).map((x) => x.id);
  expect(handed).not.toContain('polo-white-xl');
  expect(handed).not.toContain('shirt-navy-xl');
  expect(new Set(pool.take(8).map((x) => x.id)).size).toBe(8);
  expect(pool.polos(3).every((x) => x.product === 'polo')).toBe(true);
});

it('the workflow is by hand only, on the server runner, with its own lane', () => {
  const wf = readFileSync(new URL('../../.github/workflows/gate-orders.yml', import.meta.url), 'utf8');
  expect(wf).toMatch(/^on:\n {2}workflow_dispatch:/m);
  expect(wf).not.toMatch(/schedule:|push:|pull_request:/);
  expect(wf).toMatch(/runs-on: \[self-hosted, extas-vm\]/);
  expect(wf).toMatch(/group: extas-gate-orders/);
  expect(wf).toMatch(/\[skip ci\]/);
});

it('every gate check has its scenario; one that was asked but stopped before the check fails, never "not asked"', () => {
  expect(Object.keys(GATE_SCENARIO).sort()).toEqual(Object.keys(GATE_CHECKS).sort());
  for (const s of Object.values(GATE_SCENARIO)) expect(SCENARIOS.some((x) => x.id === s)).toBe(true);
  expect(unreachedGate('1', 'w', ['5', '6'])).toMatchObject({ verdict: 'FAIL', detail: expect.stringMatching(/scenario 5 stopped/) });
  expect(unreachedGate('1', 'w', ['6'])).toMatchObject({ verdict: 'SKIP', detail: expect.stringMatching(/\(5\) was not asked/) });
});
