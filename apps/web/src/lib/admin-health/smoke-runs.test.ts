// S21 · PR 418 — the Smoke runs page's rows: checked field by field, grouped per page with failed pages first, and an
// admin page's picture hidden without `health.smoke.shots`.
import { describe, expect, it } from 'vitest';
import { pagesOf, rowsOf, SHOT_NAME } from './smoke-runs';

const row = (path: string, screen: string, ok = true, screenshot: unknown = `${path.slice(1).replace(/\W+/g, '-') || 'home'}-${screen}.jpg`) => ({ path, screen, status: ok ? 200 : 500, landed: path, ok, problems: ok ? [] : [`${path}: answered 500`], screenshot });

describe('Smoke runs rows (PR 418)', () => {
  it('keeps only well-formed rows and safe picture names', () => {
    const rows = rowsOf({
      rows: [row('/', 'phone'), row('/shop', 'desktop', true, '../secret.jpg'), row('/x', 'phone', true, 'x.png'), { path: 'no-slash', screen: 'phone', ok: true }, 'junk', { ...row('/y', 'phone'), problems: Array.from({ length: 15 }, (_, i) => `p${i}`), ok: 'yes' }],
    });
    expect(rows.map((r) => r.path)).toEqual(['/', '/shop', '/x', '/y']);
    expect(rows.map((r) => r.shot)).toEqual(['home-phone.jpg', null, null, 'y-phone.jpg']);
    expect(rows[3]).toMatchObject({ ok: false, problems: expect.arrayContaining(['p0']) });
    expect(rows[3]!.problems).toHaveLength(10);
    expect(rowsOf(null)).toEqual([]);
    expect(rowsOf({ rows: 'nope' })).toEqual([]);
    expect(SHOT_NAME.test('admin-orders-phone.jpg')).toBe(true);
    expect(['.hidden.jpg', 'a/b.jpg', 'a..jpg', 'a.jpeg'].map((f) => SHOT_NAME.test(f))).toEqual([false, false, false, false]);
  });

  it('groups screens per page, failed pages first, and hides admin pictures without the permission', () => {
    const rows = rowsOf({ rows: [row('/', 'phone'), row('/', 'desktop'), row('/admin/orders', 'phone', false), row('/admin/orders', 'desktop'), row('/about', 'phone')] });
    const all = pagesOf(rows, 'all', false);
    expect(all.map((p) => [p.path, p.ok])).toEqual([
      ['/admin/orders', false],
      ['/', true],
      ['/about', true],
    ]);
    expect(all[0]!.screens.map((s) => [s.screen, s.shot, s.admin])).toEqual([
      ['phone', null, true],
      ['desktop', null, true],
    ]);
    expect(all[1]!.screens.map((s) => s.shot)).toEqual(['home-phone.jpg', 'home-desktop.jpg']);
    expect(pagesOf(rows, 'all', true)[0]!.screens[0]!.shot).toBe('admin-orders-phone.jpg');
    expect(pagesOf(rows, 'failed', true).map((p) => p.path)).toEqual(['/admin/orders']);
  });
});
