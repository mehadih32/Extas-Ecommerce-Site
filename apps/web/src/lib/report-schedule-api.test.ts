// PR 863 — the one-report schedule's admin API (PR 854) and the reorder request's (PR 863): only the methods each has, a store id that is a
// number, and nothing answers (nor reads or changes anything) before the database and a signed-in admin. The schedule's own rules are
// tested in packages/catalogue/test/report-schedules.pure.test.ts.
import { describe, expect, it } from 'vitest';
import { reportReorderHandler, reorderLines } from './report-reorder-api';
import { reportScheduleHandler } from './report-schedule-api';

const req = (method: string, path = '/api/admin/reports/schedule', body?: unknown) =>
  new Request(`https://shop.test${path}`, { method, headers: { origin: 'https://shop.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('Reports › Schedule API (PR 854, tests PR 863)', () => {
  it('answers only GET and POST', async () => {
    for (const m of ['PUT', 'DELETE', 'PATCH']) expect((await reportScheduleHandler(req(m), null)).status).toBe(405);
  });
  it('a store id that is not a number is refused before anything else', async () => {
    expect((await reportScheduleHandler(req('GET', '/api/admin/reports/schedule?storeId=abc&report=products'), null)).status).toBe(400);
    expect((await reportScheduleHandler(req('POST', '/api/admin/reports/schedule?storeId=0'), null)).status).toBe(400);
  });
  it('without the database nothing is read or saved', async () => {
    expect((await reportScheduleHandler(req('GET', '/api/admin/reports/schedule?report=products'), null)).status).toBe(503);
    expect((await reportScheduleHandler(req('POST', '/api/admin/reports/schedule', { report: 'products', frequency: 'weekly', time: '09:00', channels: ['telegram'], enabled: true }), null)).status).toBe(503);
  });
});

describe('Reports › Products reorder request API (PR 863)', () => {
  it('answers only POST, needs a real store id and the database', async () => {
    expect((await reportReorderHandler(req('GET', '/api/admin/reports/reorder'), null)).status).toBe(405);
    expect((await reportReorderHandler(req('POST', '/api/admin/reports/reorder?storeId=x'), null)).status).toBe(400);
    expect((await reportReorderHandler(req('POST', '/api/admin/reports/reorder', { productIds: [] }), null)).status).toBe(503);
  });
  const list = [
    { productId: 'p1', name: 'Polo', sold30: 40 },
    { productId: 'p2', name: 'Denim', sold30: 12 },
    { productId: 'p3', name: 'Cap', sold30: 0 },
  ];
  it('a line is made only for what is on the restock list, with 30 days of sales as the pieces', () => {
    expect(reorderLines(['p2', 'zz'], list)).toEqual([{ productId: 'p2', name: 'Denim', suggested: 12 }]);
    expect(reorderLines(null, list).map((x) => x.productId)).toEqual(['p1', 'p2', 'p3']);
    expect(reorderLines([], list)).toEqual([]);
  });
});
