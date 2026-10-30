// CN-028 · PR 618 — the costs admin API refuses what it does not serve before it touches anything: a wrong method is
// 405, a bad entry id is 400, and without a database every route answers 503 (the guard runs before any write).
import { describe, expect, it } from 'vitest';
import { costEntriesHandler, costsHandler, fixedCostsHandler, noCostLinesHandler, reverseCostEntryHandler } from './costs-api';

const req = (method: string, path: string) => new Request(`https://new.example.test${path}`, { method, headers: { origin: 'https://new.example.test' } });

describe('PR 618 · /api/admin/costs/*', () => {
  it('a wrong method is refused with 405', async () => {
    expect((await costsHandler(req('POST', '/api/admin/costs'), null)).status).toBe(405);
    expect((await fixedCostsHandler(req('POST', '/api/admin/costs/fixed-costs'), null)).status).toBe(405);
    expect((await costEntriesHandler(req('GET', '/api/admin/costs/cost-entries'), null)).status).toBe(405);
    expect((await reverseCostEntryHandler(req('GET', '/api/admin/costs/cost-entries/x/reverse'), null, 'x')).status).toBe(405);
    expect((await noCostLinesHandler(req('POST', '/api/admin/costs/no-cost-lines'), null)).status).toBe(405);
  });

  it('a bad entry id is 400; without a database every route answers 503', async () => {
    expect((await reverseCostEntryHandler(req('POST', '/api/admin/costs/cost-entries/x/reverse'), null, 'not-an-id')).status).toBe(400);
    expect((await costsHandler(req('GET', '/api/admin/costs'), null)).status).toBe(503);
    expect((await fixedCostsHandler(req('PUT', '/api/admin/costs/fixed-costs'), null)).status).toBe(503);
    expect((await costEntriesHandler(req('POST', '/api/admin/costs/cost-entries'), null)).status).toBe(503);
    expect((await noCostLinesHandler(req('PUT', '/api/admin/costs/no-cost-lines'), null)).status).toBe(503);
  });
});
