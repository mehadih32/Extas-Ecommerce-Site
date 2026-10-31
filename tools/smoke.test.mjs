// Tests for tools/smoke.mjs (run with the web tests). The browser journey itself runs in CI and on the runner.
import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adminLinks, adminPaths, checkApplies, checkProblem, discovered, figureProblems, markBoxes, pageProblems, readMarks, reportMarkdown, requestCounts, shotDir, totpCode } from './smoke.mjs';

it('PR 6: an extra check passes on the expected value or answer, and says what it saw otherwise', () => {
  const page = { pr: 6, what: 'worker fresh', page: '/admin/server', selector: '[data-worker-state]', attribute: 'data-worker-state', equals: 'ok' };
  expect(checkProblem(page, { value: 'ok' })).toBeNull();
  expect(checkProblem(page, { value: 'stale' })).toBe('check (PR 6): worker fresh: [data-worker-state] data-worker-state is "stale", expected "ok"');
  expect(checkProblem(page, { value: null })).toContain('"missing"');
  expect(checkProblem(page, { error: 'Timeout 15000ms exceeded.' })).toBe('check (PR 6): worker fresh: Timeout 15000ms exceeded.');
  const req = { pr: 196, what: 'unsigned refused', request: { method: 'POST', path: '/api/x' }, status: 401 };
  expect(checkProblem(req, { status: 401 })).toBeNull();
  expect(checkProblem(req, { status: 200 })).toBe('check (PR 196): unsigned refused: answered 200, expected 401');
});

it('follow-up 80: an anonymous request check passes only on the app\'s own answer, never on the preview gate\'s 401', () => {
  const req = { pr: 7, what: 'webhook past the gate', request: { method: 'POST', path: '/api/erp/webhook', anonymous: true }, status: 401, field: 'code' };
  expect(checkProblem(req, { status: 401, json: { ok: false, code: 'BAD_SIGNATURE' } })).toBeNull();
  expect(checkProblem(req, { status: 401, json: null, gate: true })).toBe('check (PR 7): webhook past the gate: the answer is not the app\'s own (no "code" in it; the preview login was asked for)');
  expect(checkProblem(req, { status: 401, json: { ok: false } })).toContain('no "code" in it');
  expect(checkProblem(req, { status: 404, json: { code: 'x' } })).toBe('check (PR 7): webhook past the gate: answered 404, expected 401');
  const config = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));
  const gate = config.checks.find((c) => c.request?.anonymous);
  expect(gate).toMatchObject({ pr: 7, request: { method: 'POST', path: '/api/erp/webhook' }, field: 'code' });
});

it('R2 ops M2 (PR 402): a check with `host` runs only on that kind of host; the preview noindex check never on the main domain', () => {
  expect(checkApplies({ pr: 1 }, 'staging')).toBe(true);
  expect(checkApplies({ pr: 1 }, 'extra')).toBe(true);
  expect(checkApplies({ pr: 1, host: 'staging' }, 'staging')).toBe(true);
  expect(checkApplies({ pr: 1, host: 'staging' }, 'extra')).toBe(false);
  expect(checkApplies({ pr: 1, host: 'extra' }, 'staging')).toBe(false);
  expect(checkApplies({ pr: 1, host: 'staging' })).toBe(true);
  const config = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));
  const noindex = config.checks.filter((c) => c.selector === 'meta[name=robots]' && /noindex/.test(c.equals));
  expect(noindex.length).toBeGreaterThan(0);
  for (const c of noindex) expect(c.host, c.what).toBe('staging');
  for (const c of config.checks) if (c.host !== undefined) expect(['staging', 'extra'], c.what).toContain(c.host);
});

it('every configured check names its PR and is a page check or a request check', () => {
  const config = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));
  expect(config.checks.length).toBeGreaterThan(0);
  for (const c of config.checks) {
    expect(Number.isInteger(c.pr), c.what).toBe(true);
    expect(Boolean(c.request) !== Boolean(c.page), c.what).toBe(true);
    if (c.page) expect([c.selector, c.attribute, c.equals].every((v) => typeof v === 'string'), c.what).toBe(true);
    else expect(Number.isInteger(c.status), c.what).toBe(true);
    // PR 220: a head tag (meta) is never visible, so its check waits for it to be attached instead
    if (c.state !== undefined) expect(['attached', 'visible'], c.what).toContain(c.state);
    if (c.page && /^meta\b/.test(c.selector)) expect(c.state, c.what).toBe('attached');
  }
});

it('follow-up 200: every adminDiscover entry names a built admin page, a selector and how many to open', () => {
  const config = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));
  expect(config.adminDiscover.length).toBeGreaterThan(0);
  for (const d of config.adminDiscover) {
    expect(d.from.startsWith('/admin/'), d.from).toBe(true);
    expect(config.admin.includes(d.from), d.from).toBe(true); // the page it looks on is opened on its own too
    expect(typeof d.selector, d.from).toBe('string');
    expect(Number.isInteger(d.take) && d.take > 0, d.from).toBe(true);
  }
  // one order's page from the list, whatever the order numbers are; never another site, never a repeat
  expect(discovered(['/admin/orders/a1?x=1', '/admin/orders/a1', 'https://evil.test/admin/orders/b', '/admin/orders/b2'], 1)).toEqual(['/admin/orders/a1']);
});

/** Review R3 (admin M2): admin pages the smoke test does not open on their own, each with why. */
const SMOKE_SKIP = {
  '/admin/login': 'the sign-in page: the smoke test signs in through it, and a signed-in visit only sends it on',
};

it('review R3 (admin M2): every static admin page is opened by the smoke test, or is on the skip list with a reason', async () => {
  const { readdirSync } = await import('node:fs');
  const config = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));
  const listed = new Set(config.admin.map((p) => p.split('?')[0]));
  const root = new URL('../apps/web/src/app/admin/', import.meta.url);
  const pages = readdirSync(root, { recursive: true })
    .map((f) => String(f).split(/[\\/]/).join('/'))
    .filter((f) => /(^|\/)page\.tsx$/.test(f) && !f.includes('['))
    .map((f) => `/admin/${f.replace(/(^|\/)page\.tsx$/, '')}`.replace(/\/\([^)]*\)/g, '').replace(/\/$/, ''));
  expect(pages.length).toBeGreaterThan(50);
  for (const p of pages) expect(listed.has(p) || p in SMOKE_SKIP, `${p} is in neither docs/qa/smoke.json admin nor SMOKE_SKIP`).toBe(true);
  for (const [p, why] of Object.entries(SMOKE_SKIP)) {
    expect(pages, p).toContain(p);
    expect(why.length, p).toBeGreaterThan(10);
  }
});

it('PR 155: Sales and Ordered value each show once, with a label and a figure, and never as the same figure', () => {
  const sel = ['[data-testid=cb-kpi-ordered]', '[data-testid=cb-kpi-sales]'];
  const ok = [[{ label: 'Ordered value', value: '৳0' }], [{ label: 'Sales (delivered)', value: '৳0' }]];
  expect(figureProblems('/admin/combos?tab=report', sel, ok)).toEqual([]);
  expect(figureProblems('/r', sel, [ok[0], []])).toEqual(['/r: [data-testid=cb-kpi-sales] is missing']);
  expect(figureProblems('/r', sel, [ok[0], [{ label: 'Sales', value: '' }]])).toEqual(['/r: [data-testid=cb-kpi-sales] shows no figure']);
  expect(figureProblems('/r', sel, [ok[0], [ok[1][0], ok[1][0]]])).toEqual(['/r: [data-testid=cb-kpi-sales] shows 2 times']);
  expect(figureProblems('/r', sel, [ok[0], [{ label: 'Ordered value', value: '৳5' }]])[0]).toMatch(/must be separate/);
});

it('PR 155: smoke.json checks the combo report for both figures', () => {
  const config = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));
  const report = config.figures.find((f) => f.pr === 155);
  expect(report.path).toBe('/admin/combos?tab=report');
  expect(report.selectors).toEqual(['[data-testid=cb-kpi-ordered]', '[data-testid=cb-kpi-sales]']);
});

it('PR 49: opens the first product pages a built page links to, each once, never another site', () => {
  expect(discovered(['/p/polo?color=navy', '/p/polo', '//evil.test/p/x', 'https://x.test/p/y', '/bn/p/chino#a', '/p/socks'], 2)).toEqual(['/p/polo', '/bn/p/chino']);
  expect(discovered([], 2)).toEqual([]);
});

it('a 5xx or the error screen is a problem; a normal page is not', () => {
  expect(pageProblems('/admin/products', 200, 'Products 0 items')).toEqual([]);
  expect(pageProblems('/admin/products', 500, 'x')).toEqual(['/admin/products: answered 500']);
  expect(pageProblems('/admin', 200, 'This page couldn’t load A server error occurred.')).toEqual(['/admin: shows the error screen']);
});

it('opens each admin menu page once, never the sign-in page, the API or outside links', () => {
  expect(adminLinks(['/admin/stock?x=1', '/admin/stock', '/admin/login?next=/admin', '/status', 'https://example.test/admin', '/admin/products#a'])).toEqual([
    '/admin/products',
    '/admin/stock',
  ]);
});

it('PR 12: signed in, the Dashboard, the menu links and the listed admin pages, each once', () => {
  expect(adminPaths(['/admin/products', '/admin/stock'], ['/admin/stock', '/admin/help', '/admin'])).toEqual(['/admin', '/admin/products', '/admin/stock', '/admin/help']);
  expect(adminPaths([])).toEqual(['/admin']);
});

it('a failed request counts unless it is on the known list; other sites count too', () => {
  const base = 'https://staging.example.test';
  const ignore = [{ path: '/favicon.ico', until: 'PR 501' }];
  expect(requestCounts(`${base}/favicon.ico`, base, ignore)).toBe(false);
  expect(requestCounts(`${base}/_next/static/x.js`, base, ignore)).toBe(true);
  expect(requestCounts('https://cdn.example.test/favicon.ico', base, ignore)).toBe(true);
});

it('makes the same two-step code as RFC 6238 (SHA-1, 6 digits, 30 s)', () => {
  // RFC 6238 appendix B seed "12345678901234567890", T = 59 s → 94287082 (8 digits) → 287082 (6 digits).
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  expect(totpCode(secret, 59_000)).toBe('287082');
  expect(createHmac('sha1', 'x').digest('hex')).toHaveLength(40);
});

it('the report starts with a Bengali line and lists every page', () => {
  const md = reportMarkdown(
    { ok: false, pages: 2, failed: 1, problems: ['/admin: shows the error screen'], rows: [
      { path: '/', screen: 'phone', status: 200, landed: '/', ok: true, problems: [], screenshot: 'home-phone.png' },
      { path: '/admin', screen: 'phone', status: 500, landed: '/admin', ok: false, problems: ['/admin: shows the error screen'], screenshot: 'admin-phone.png' },
    ] },
    { at: '2026-10-20T15:00:00+06:00', base: 'https://staging.example.test', sha: 'abc1234', kind: 'after deploy', rolledBack: true },
  );
  expect(md).toContain('বাংলায়');
  expect(md).toContain('আগের ভালো ভার্সনে');
  expect(md).toContain('| `/admin` | phone | 500 |');
});

it('review R1 (security M1): an admin page\'s picture never goes into the committed report folder', () => {
  expect(shotDir('/', 'docs-out', null)).toBe('docs-out');
  expect(shotDir('/products/x', 'docs-out', '/srv/state/smoke')).toBe('docs-out');
  for (const p of ['/admin', '/admin/orders', '/admin/customers/1'])
    expect(shotDir(p, 'docs-out', null)).toBeNull();
  expect(shotDir('/admin/orders', 'docs-out', '/srv/state/smoke')).toBe('/srv/state/smoke');
  expect(shotDir('/administrator-tips', 'docs-out', null)).toBe('docs-out');
});

it('PR 388: the manual\'s marks are fractions of the screen; a missing or off-screen part is kept as not shown', () => {
  const marks = [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }];
  const boxes = [{ x: 136.6, y: 90, width: 273.2, height: 45 }, null, { x: 10, y: 1200, width: 50, height: 20 }, { x: 0, y: 0, width: 0, height: 10 }];
  expect(markBoxes(marks, boxes, { width: 1366, height: 900 })).toEqual([
    { n: 1, label: 'A', shown: true, x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
    { n: 2, label: 'B', shown: false },
    { n: 3, label: 'C', shown: false, x: 0.0073, y: 1.3333, w: 0.0366, h: 0.0222 },
    { n: 4, label: 'D', shown: false },
  ]);
  const config = readMarks();
  expect(config.length).toBeGreaterThan(0);
  for (const s of config) expect(s).toMatchObject({ guide: expect.any(String), path: expect.stringMatching(/^\/admin/) });
  expect(readMarks('/nowhere/marks.json')).toEqual([]);
});
