// S28 · PR 688 — the budgets API refuses what it does not serve before it touches anything.
import { describe, expect, it } from 'vitest';
import { budgetsHandler } from './budgets-api';

const req = (method: string, path = '/api/admin/money/budgets') => new Request(`https://new.example.test${path}`, { method, headers: { origin: 'https://new.example.test' } });

describe('PR 688 · /api/admin/money/budgets', () => {
  it('a wrong method is 405, a bad store id 400, no database 503', async () => {
    expect((await budgetsHandler(req('PUT'), null)).status).toBe(405);
    expect((await budgetsHandler(req('GET', '/api/admin/money/budgets?storeId=x'), null)).status).toBe(400);
    expect((await budgetsHandler(req('GET'), null)).status).toBe(503);
    expect((await budgetsHandler(req('POST'), null)).status).toBe(503);
  });
});
