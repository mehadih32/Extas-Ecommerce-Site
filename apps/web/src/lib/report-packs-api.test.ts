// S28 · PR 690 — the packs API refuses what it does not serve before it touches anything.
import { describe, expect, it } from 'vitest';
import { packsHandler } from './report-packs-api';

const req = (method: string, path = '/api/admin/reports/packs') => new Request(`https://new.example.test${path}`, { method, headers: { origin: 'https://new.example.test' } });

describe('PR 690 · /api/admin/reports/packs', () => {
  it('a wrong method is 405, an unknown pack 404, a bad store id 400, no database 503', async () => {
    expect((await packsHandler(req('PUT'), null)).status).toBe(405);
    expect((await packsHandler(req('POST', '/api/admin/reports/packs/bank'), null, 'bank')).status).toBe(405);
    expect((await packsHandler(req('GET', '/api/admin/reports/packs/nope'), null, 'nope')).status).toBe(404);
    expect((await packsHandler(req('GET', '/api/admin/reports/packs?storeId=x'), null)).status).toBe(400);
    expect((await packsHandler(req('GET'), null)).status).toBe(503);
    expect((await packsHandler(req('GET', '/api/admin/reports/packs/bank'), null, 'bank')).status).toBe(503);
  });
});
