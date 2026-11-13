// S28 · PR 687 — the cashbook API refuses what it does not serve before it touches anything: a wrong method is 405, a bad
// store id is 400, and without a database every route answers 503 (the guard runs before any write).
import { describe, expect, it } from 'vitest';
import { cashHandler } from './cash-api';

const req = (method: string, path = '/api/admin/money/cash') => new Request(`https://new.example.test${path}`, { method, headers: { origin: 'https://new.example.test' } });

describe('PR 687 · /api/admin/money/cash', () => {
  it('a wrong method is refused with 405', async () => {
    expect((await cashHandler(req('PUT'), null)).status).toBe(405);
    expect((await cashHandler(req('DELETE'), null)).status).toBe(405);
  });
  it('a bad store id is 400; without a database it answers 503', async () => {
    expect((await cashHandler(req('GET', '/api/admin/money/cash?storeId=abc'), null)).status).toBe(400);
    expect((await cashHandler(req('GET'), null)).status).toBe(503);
    expect((await cashHandler(req('POST'), null)).status).toBe(503);
  });
});
