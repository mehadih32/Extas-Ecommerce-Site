// PR 66 follow-up 184 — the questions API refuses wrong addresses and methods before it reaches the database.
import { describe, expect, it } from 'vitest';
import { questionsHandler } from './questions-api';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const req = (method: string, path = '/api/admin/questions') => new Request(`https://shop.example.test${path}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });

describe('questions API addresses (follow-up 184)', () => {
  it('only answer and move exist under a question, on POST', async () => {
    expect((await questionsHandler(req('POST'), null, [ID, 'delete'])).status).toBe(404);
    expect((await questionsHandler(req('POST'), null, ['not-a-uuid', 'move'])).status).toBe(404);
    expect((await questionsHandler(req('POST'), null, [ID])).status).toBe(404);
    expect((await questionsHandler(req('GET'), null, [ID, 'move'])).status).toBe(405);
    expect((await questionsHandler(req('POST'), null, [])).status).toBe(405);
  });
  it('without a database the list answers that it is unavailable, never a guess', async () => {
    expect((await questionsHandler(req('GET'), null, [])).status).toBeGreaterThanOrEqual(400);
  });
});
