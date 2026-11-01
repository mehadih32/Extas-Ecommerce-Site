// Tests for tools/journeys.mjs (PR 414; run with the web tests). The browser part runs on the VM (infra/deploy/journeys.sh).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { journeyProblems, namesSwitch, pickJourneys, reportMarkdown, stepLabel, summarise, switchGate, switchValue, UI_KINDS, uiFilter, uiKindsOf } from './journeys.mjs';

const saved = JSON.parse(readFileSync(new URL('../docs/qa/journeys.json', import.meta.url), 'utf8'));

it('the saved journeys are well formed: four roles, two screens, every write only to prove it is refused', () => {
  expect(journeyProblems(saved)).toEqual([]);
  expect(pickJourneys(saved, '').map((j) => j.id)).toEqual(['customer', 'admin', 'accountant', 'warehouse']);
  expect(saved.screens.map((s) => s.width)).toEqual([390, 1366]);
  const writes = saved.journeys.flatMap((j) => j.steps).filter((s) => s.api && s.method !== 'GET');
  expect(writes.length).toBeGreaterThan(0);
  expect(writes.every((s) => s.status === 403)).toBe(true);
});

it('the customer never adds to the bag or places an order (real stock, real orders on the live shop)', () => {
  const customer = saved.journeys.find((j) => j.id === 'customer');
  expect(customer.signedIn).toBe(false);
  const text = JSON.stringify(customer.steps);
  expect(text).not.toMatch(/add-to-bag|addToBag|place-order|co-submit|\/api\//);
  expect(customer.steps.filter((s) => s.click).every((s) => /size-pill/.test(s.click))).toBe(true);
});

it('names what is wrong with a journey file', () => {
  const bad = {
    screens: [],
    journeys: [
      { id: 'a', steps: [{ open: 'x' }, { open: '/', follow: 'a' }, { api: '/api/x', method: 'PUT', status: 200 }, { api: '/api/y' }] },
      { id: 'a', steps: [] },
    ],
  };
  expect(journeyProblems(bad)).toEqual([
    'no screens',
    'a step 1: a path on this site starts with /',
    'a step 2: exactly one of open, follow, click, api',
    'a step 3: a write may only be sent to prove it is refused (status 403)',
    'a step 4: an api step needs a method and the status it expects',
    'journey id missing or repeated: a',
    'a: no steps',
  ]);
});

it('picks the journeys the owner chose; an unknown name is left out', () => {
  expect(pickJourneys(saved, '').map((j) => j.id)).toHaveLength(4);
  expect(pickJourneys(saved, ' admin, nobody ').map((j) => j.id)).toEqual(['admin']);
});

it('PR 414 follow-up: a group runs only when asked for; the schedule (no group) never runs the go-live gate', () => {
  expect(pickJourneys(saved, '', '').some((j) => j.group)).toBe(false);
  expect(pickJourneys(saved, undefined, undefined).map((j) => j.id)).toEqual(['customer', 'admin', 'accountant', 'warehouse']);
  expect(pickJourneys(saved, '', 'go-live-gate').map((j) => j.id)).toEqual(['gate-shop', 'gate-admin']);
  expect(pickJourneys(saved, 'gate-admin', ' go-live-gate ').map((j) => j.id)).toEqual(['gate-admin']);
  expect(pickJourneys(saved, 'customer', 'go-live-gate')).toEqual([]);
  expect(pickJourneys(saved, '', 'nobody')).toEqual([]);
});

it('PR 414 follow-up: the go-live gate reads only — signed out or the check account, no write, no bag, no order, every step names its finding', () => {
  const gate = pickJourneys(saved, '', 'go-live-gate');
  expect(gate.find((j) => j.id === 'gate-shop').signedIn).toBe(false);
  expect(gate.find((j) => j.id === 'gate-admin').signedIn).toBe(true);
  const steps = gate.flatMap((j) => j.steps);
  expect(steps.every((s) => Array.isArray(s.sim) && s.sim.length > 0)).toBe(true);
  expect(steps.some((s) => s.api || s.click)).toBe(false);
  expect(JSON.stringify(steps)).not.toMatch(/add-to-bag|addToBag|place-order|co-submit|-save|\/api\//);
  // every live check the gate can see: the findings it names
  const named = new Set(steps.flatMap((s) => s.sim));
  for (const f of ['F-011', 'F-013', 'F-019', 'F-020', 'F-023', 'F-025', 'F-041', 'F-046', 'F-047', 'F-048', 'F-051', 'F-052', 'F-053', 'F-054']) expect(named.has(f)).toBe(true);
});

it('PR 414 follow-up: names what is wrong with a group, a finding, a switch or a status', () => {
  const bad = {
    screens: [{ id: 'phone', width: 390, height: 844 }],
    journeys: [
      {
        id: 'g',
        group: 'Go Live!',
        steps: [{ open: '/', sim: ['SIM-F-1'] }, { follow: 'a', status: 404 }, { open: '/', when: 'pdp buy' }, { open: '/x', status: 404, sim: 'F-023', unless: 'orders.bulkLane.enabled' }],
      },
    ],
  };
  expect(journeyProblems(bad)).toEqual([
    'g: a group is a short name of a-z, 0-9 and -',
    'g step 1: a finding is named F-### (SIM-F-###)',
    'g step 2: only an open or api step expects a status',
    'g step 3: a switch is a setting key with the path in its value',
  ]);
});

it("PR 414 follow-up: a switch is a setting key and the path in its value; only true is on", () => {
  const settings = [
    { key: 'pdp.buy', value: { orderNow: true, callToOrder: false } },
    { key: 'pdp.buy.extra', value: true },
    { key: 'orders.bulkLane', value: { enabled: true } },
    { key: 'rules.eid.enabled', value: false },
    { key: 'vault.secret' },
  ];
  expect(switchValue(settings, 'pdp.buy.callToOrder')).toEqual({ found: true, on: false });
  expect(switchValue(settings, 'pdp.buy.orderNow')).toEqual({ found: true, on: true });
  expect(switchValue(settings, 'pdp.buy.extra')).toEqual({ found: true, on: true }); // the longest key wins
  expect(switchValue(settings, 'orders.bulkLane.enabled')).toEqual({ found: true, on: true });
  expect(switchValue(settings, 'orders.bulkLane')).toEqual({ found: true, on: false }); // an object is not "on"
  expect(switchValue(settings, 'rules.eid.enabled')).toEqual({ found: true, on: false });
  expect(switchValue(settings, 'pdp.buy.nothing.deeper')).toEqual({ found: true, on: false });
  expect(switchValue(settings, 'vault.secret.enabled')).toEqual({ found: true, on: false }); // a hidden value reads off
  expect(switchValue(settings, 'pdp.buyer')).toEqual({ found: false, on: false });
  expect(switchValue(null, 'pdp.buy')).toEqual({ found: false, on: false });
});

it('PR 414 follow-up: when / unless skip a step by the switches; a switch that is no setting, or switches not read, fail it', () => {
  const settings = [
    { key: 'orders.bulkLane', value: { enabled: false } },
    { key: 'rules.eid.enabled', value: true },
    { key: 'delivery.holiday', value: { enabled: false } },
  ];
  expect(switchGate({ open: '/' }, null)).toBeNull();
  expect(namesSwitch({ open: '/' })).toBe(false);
  expect(namesSwitch({ open: '/', switches: { 'a.b': 'x' } })).toBe(true);
  expect(switchGate({ open: '/bulk-order', unless: 'orders.bulkLane.enabled' }, settings)).toBeNull();
  expect(switchGate({ open: '/bulk-order', when: 'orders.bulkLane.enabled' }, settings)).toEqual({ skip: 'switch orders.bulkLane.enabled is off' });
  expect(switchGate({ open: '/', unless: ['rules.eid.enabled', 'delivery.holiday.enabled'] }, settings)).toEqual({ skip: 'switch rules.eid.enabled is on' });
  expect(switchGate({ open: '/', when: ['rules.eid.enabled'] }, settings)).toBeNull();
  expect(switchGate({ open: '/', switches: { 'nope.enabled': 'x' } }, settings)).toEqual({ problem: 'no such setting on this site: nope.enabled' });
  expect(switchGate({ open: '/', when: 'rules.eid.enabled' }, null).problem).toMatch(/could not be read/);
  expect(stepLabel({ open: '/bulk-order', status: 404, unless: 'orders.bulkLane.enabled', sim: ['F-023'] })).toBe('open /bulk-order → 404 (unless orders.bulkLane.enabled) · SIM-F-023');
  expect(stepLabel({ open: '/', when: ['a.on', 'b.on'], sim: ['F-019', 'F-047'] })).toBe('open / (when a.on + b.on) · SIM-F-019, SIM-F-047');
});

it('summarises a run and writes its report: failed steps first, skipped steps counted', () => {
  const rows = [
    { journey: 'customer', screen: 'phone', ok: true, steps: [{ n: 1, what: 'open /', ok: true, skipped: null, problems: [] }, { n: 2, what: 'follow a.pcard-lnk', ok: true, skipped: 'nothing matches a.pcard-lnk', problems: [] }] },
    { journey: 'admin', screen: 'desktop', ok: false, steps: [{ n: 1, what: 'open /admin/orders', ok: false, skipped: null, problems: ['request 500: /admin/orders'], screenshot: 'admin-desktop-1.jpg' }] },
  ];
  const r = summarise(rows);
  expect(r).toEqual({ ok: false, journeys: 2, failed: 1, steps: 3, skipped: 1, ui: { kinds: [], issues: 0 }, problems: ['admin (desktop) step 1 open /admin/orders: request 500: /admin/orders'] });
  const md = reportMarkdown({ ...r, rows }, { at: 'sample time', base: 'https://new.example.test', kind: 'scheduled', sha: 'abc123' });
  expect(md).toContain('# Journeys — FAIL');
  expect(md).toContain('UI checks: off.');
  expect(md).toContain('- skip 2. follow a.pcard-lnk (nothing matches a.pcard-lnk)');
  expect(md).toContain('- **FAIL** 1. open /admin/orders — request 500: /admin/orders ([picture](admin-desktop-1.jpg))');
  expect(stepLabel({ api: '/api/admin/health', method: 'PUT', status: 403 })).toBe('PUT /api/admin/health → 403');
});

it('PR 416: the UI checks asked for; unknown names left out; empty is off', () => {
  expect(uiKindsOf('')).toEqual([]);
  expect(uiKindsOf(undefined)).toEqual([]);
  expect(uiKindsOf(' layout, taps,colours,layout,constructor ')).toEqual(['layout', 'taps']);
  expect(Object.keys(UI_KINDS)).toEqual(['layout', 'text', 'images', 'taps']);
});

it('PR 416: only the findings of the chosen checks are kept', () => {
  const found = [
    { k: 'HORIZONTAL-SCROLL', d: 'scrollWidth 420 > 390' },
    { k: 'TEXT-CUT-OFF', d: 'a2-b:"Sample"' },
    { k: 'IMAGE-NOT-LOADED', d: 'Sample polo' },
    { k: 'TAP-COVERED', d: 'a2-btn under shop-bar' },
    { k: 'JS-ERROR', d: 'not a UI finding' },
  ];
  expect(uiFilter(found, ['layout', 'images']).map((i) => i.k)).toEqual(['HORIZONTAL-SCROLL', 'IMAGE-NOT-LOADED']);
  expect(uiFilter(found, [])).toEqual([]);
});

it('PR 416: a run with UI checks counts their findings apart and says so in the report', () => {
  const rows = [
    { journey: 'customer', screen: 'phone', ok: false, steps: [{ n: 1, what: 'open /', ok: false, skipped: null, problems: ['UI TAP-TOO-SMALL: menu 30×30', 'UI IMAGE-NOT-LOADED: Sample polo'] }] },
    { journey: 'admin', screen: 'desktop', ok: false, steps: [{ n: 1, what: 'open /admin', ok: false, skipped: null, problems: ['request 500: /admin'] }] },
  ];
  const r = summarise(rows, ['layout', 'images', 'taps']);
  expect(r.ui).toEqual({ kinds: ['layout', 'images', 'taps'], issues: 2 });
  expect(r.problems[0]).toBe('customer (phone) step 1 open /: UI TAP-TOO-SMALL: menu 30×30');
  expect(reportMarkdown({ ...r, rows }, { at: 'sample time', base: 'https://new.example.test', kind: 'run now' })).toContain('UI checks (layout, images, taps): 2 finding(s).');
});

it('PR 416: the phone screen opens as a touch screen (the tap-size and form-text rules apply there)', () => {
  expect(saved.screens.find((s) => s.id === 'phone').touch).toBe(true);
  expect(saved.screens.find((s) => s.id === 'desktop').touch).toBeUndefined();
});
