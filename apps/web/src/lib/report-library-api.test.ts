// S28 · PR 689 — the library API refuses what it does not serve before it touches anything, and the cards come out right.
import { describe, expect, it } from 'vitest';
import { libraryCards, libraryHandler, periodOf } from './report-library-api';

const req = (method: string, path = '/api/admin/reports/library') => new Request(`https://new.example.test${path}`, { method, headers: { origin: 'https://new.example.test' } });

describe('PR 689 · /api/admin/reports/library', () => {
  it('a wrong method is 405, a bad store id 400, no database 503', async () => {
    expect((await libraryHandler(req('PUT'), null)).status).toBe(405);
    expect((await libraryHandler(req('GET', '/api/admin/reports/library?storeId=x'), null)).status).toBe(400);
    expect((await libraryHandler(req('GET'), null)).status).toBe(503);
    expect((await libraryHandler(req('POST'), null)).status).toBe(503);
  });
  it('the cards carry the change against the span before, and an unknown profit stays unknown', () => {
    const c = libraryCards({ sales: 200_000, net: null, orders: 10 }, { sales: 100_000, net: 5_000, orders: 8 }, 3, 2, 4_000);
    const by = Object.fromEntries(c.map((x) => [x.id, x]));
    expect(by.sales).toMatchObject({ now: 200_000, prev: 100_000, change: 100 });
    expect(by.profit).toMatchObject({ now: null, change: null });
    expect(by.orders?.change).toBe(25);
    expect(by.aov).toMatchObject({ now: 20_000, prev: 12_500, change: 60 });
    expect(by.restock).toMatchObject({ now: 3, prev: null, change: null });
    expect(by.discount?.now).toBe(4_000);
  });
  it('an average order is unknown with no orders', () => {
    const c = libraryCards({ sales: 0, net: 0, orders: 0 }, { sales: 0, net: 0, orders: 0 }, 0, 0, 0);
    expect(c.find((x) => x.id === 'aov')).toMatchObject({ now: null, change: null });
  });
  it('a period is a preset, your own dates, or nothing valid', () => {
    const u = (q: string) => new URL(`https://new.example.test/x?${q}`);
    expect(periodOf(u(''), 'month')).toBe('month');
    expect(periodOf(u('preset=last6m'), 'month')).toBe('last6m');
    expect(periodOf(u('period=last3m'), 'month')).toBe('last3m');
    expect(periodOf(u('preset=nope'), 'month')).toBeNull();
    expect(periodOf(u('from=2026-11-01&to=2026-11-10'), 'month')).toMatchObject({ preset: 'custom', from: '2026-11-01', to: '2026-11-10' });
    expect(periodOf(u('from=2026-11-10&to=2026-11-01'), 'month')).toBeNull();
    expect(periodOf(u('from=2026-11-01'), 'month')).toBeNull();
  });
});
