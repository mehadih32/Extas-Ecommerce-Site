// Tests for tools/journeys.mjs (PR 414; run with the web tests). The browser part runs on the VM (infra/deploy/journeys.sh).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { journeyProblems, pickJourneys, reportMarkdown, stepLabel, summarise, UI_KINDS, uiFilter, uiKindsOf } from './journeys.mjs';

const saved = JSON.parse(readFileSync(new URL('../docs/qa/journeys.json', import.meta.url), 'utf8'));

it('the saved journeys are well formed: four roles, two screens, every write only to prove it is refused', () => {
  expect(journeyProblems(saved)).toEqual([]);
  expect(saved.journeys.map((j) => j.id)).toEqual(['customer', 'admin', 'accountant', 'warehouse']);
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
