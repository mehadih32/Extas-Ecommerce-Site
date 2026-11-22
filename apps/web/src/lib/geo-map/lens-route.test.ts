// S29 · PR 757 — the lens route refuses a bad question before it touches anything, and without a database says so.
import { describe, expect, it } from 'vitest';
import { lensRoute } from './lens-route';

const get = (qs: string, method = 'GET') => lensRoute(new Request(`https://x.test/api/admin/reports/geo-map/lens${qs}`, { method }), null);

describe('lensRoute', () => {
  it('answers GET only', async () => {
    expect((await get('', 'POST')).status).toBe(405);
  });
  it('refuses a bad store, level or parent', async () => {
    expect((await get('?storeId=abc')).status).toBe(400);
    expect((await get('?storeId=0')).status).toBe(400);
    expect((await get('?level=planet')).status).toBe(400);
    expect((await get("?parent='; drop table")).status).toBe(400);
  });
  it('says there is no database when there is none', async () => {
    expect((await get('?level=upazila&parent=0195f0a2-7c1e-7a55-9b6e-0e6f6d0c1a2b')).status).toBe(503);
  });
});
