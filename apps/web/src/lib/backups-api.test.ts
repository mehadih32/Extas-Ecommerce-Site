// S19 · PR 395 (CN-030) — the Backups admin API's table of paths: only its six paths, each with its one method, and
// nothing answers before the database and a signed-in admin (the guard). The Drive flow itself is tested in
// packages/jobs/src/backups.test.ts against the fake Google.
import { describe, expect, it } from 'vitest';
import { backupsRoute } from './backups-api';

const req = (method: string) => new Request('https://shop.test/api/admin/backups', { method, headers: { origin: 'https://shop.test' } });

describe('Backups admin API (PR 395)', () => {
  it('an unknown path is 404, a wrong method 405', async () => {
    expect((await backupsRoute(req('GET'), null, ['drive', 'secret'])).status).toBe(404);
    expect((await backupsRoute(req('POST'), null, [])).status).toBe(405);
    expect((await backupsRoute(req('GET'), null, ['drive', 'connect'])).status).toBe(405);
    expect((await backupsRoute(req('POST'), null, ['drive', 'list'])).status).toBe(405);
    // PR 507
    expect((await backupsRoute(req('POST'), null, ['settings'])).status).toBe(405);
    expect((await backupsRoute(req('GET'), null, ['request'])).status).toBe(405);
    // PR 396
    expect((await backupsRoute(req('GET'), null, ['restore', 'production'])).status).toBe(405);
    expect((await backupsRoute(req('POST'), null, ['restore'])).status).toBe(404);
  });

  it('without the database nothing is read or changed', async () => {
    for (const [m, p] of [['GET', []], ['GET', ['drive', 'list']], ['POST', ['drive', 'client']], ['POST', ['drive', 'disconnect']], ['PUT', ['settings']], ['POST', ['request']], ['POST', ['restore', 'staging']], ['POST', ['restore', 'production']]] as const) {
      expect((await backupsRoute(req(m), null, [...p])).status).toBe(503);
    }
  });
});
