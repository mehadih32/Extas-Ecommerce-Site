// S19 · PR 393 — the go-live checklist: automatic items from what the server wrote (fresh enough), sign-offs from the
// setting, ready only when every item is done; every item has its words in both languages; the API's paths.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import bn from '../../messages/admin-golive.bn.json';
import en from '../../messages/admin-golive.en.json';
import { goLiveRoute } from './go-live-api';
import { GO_LIVE, goLiveChecks, SIGNOFF_KEYS, type GoLiveContext } from './go-live';

const now = new Date('2026-10-31T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

function ctx(over: Partial<GoLiveContext> = {}): GoLiveContext {
  return {
    now,
    checks: { smokeHours: 36, healthMinutes: 30 },
    signoff: Object.fromEntries(SIGNOFF_KEYS.map((k) => [k, { at: ago(60), by: 'u1' }])),
    smoke: { ok: true, at: ago(120), pages: 40, failed: 0 },
    health: { at: ago(2), problems: [] },
    backups: { ready: true, todo: 0 },
    serverSetup: { at: ago(600), full: true, passed: true, counts: { ok: 13, fail: 0, warn: 1 }, steps: [] },
    originCert: { at: ago(3), mode: 'origin', active: true, names: ['example.test', '*.example.test'], daysLeft: 5400, error: null },
    primaryHosts: ['example.test'],
    ownerData: [{ name: 'Main', missing: [], bands: 2 }],
    searchEngines: true,
    connections: { kinds: ['PAYMENT', 'COURIER', 'SMS'], on: [{ kind: 'PAYMENT', provider: 'bkash', mode: 'LIVE', lastTestOk: true }, { kind: 'COURIER', provider: 'steadfast', mode: 'LIVE', lastTestOk: true }, { kind: 'SMS', provider: 'bulkSmsBd', mode: 'LIVE', lastTestOk: true }] },
    ...over,
  };
}
const open = (c: GoLiveContext) =>
  goLiveChecks(c)
    .items.filter((i) => !i.ok)
    .map((i) => i.key);

describe('go-live checklist (PR 393)', () => {
  it('everything done: ready; the order is the list order', () => {
    const r = goLiveChecks(ctx());
    expect(r).toMatchObject({ ready: true, done: GO_LIVE.length, total: GO_LIVE.length });
    expect(r.items.map((i) => i.key)).toEqual(GO_LIVE.map((i) => i.key));
  });

  it('automatic items: a failed, old or missing smoke test, a health problem or a stale check, backups not ready', () => {
    expect(open(ctx({ smoke: { ok: false, at: ago(5), pages: 40, failed: 2 } }))).toEqual(['smoke']);
    expect(open(ctx({ smoke: { ok: true, at: ago(37 * 60) } }))).toEqual(['smoke']);
    expect(open(ctx({ smoke: null, health: null }))).toEqual(['smoke', 'health']);
    expect(open(ctx({ health: { at: ago(1), problems: ['disk 91%'] } }))).toEqual(['health']);
    expect(open(ctx({ health: { at: ago(45), problems: [] } }))).toEqual(['health']);
    expect(open(ctx({ backups: { ready: false, todo: 3 } }))).toEqual(['backups']);
    expect(goLiveChecks(ctx({ backups: { ready: false, todo: 3 } })).items.find((i) => i.key === 'backups')?.vars).toEqual({ todo: 3 });
  });

  it('PR 394: the server — only a full setup run that passed; a failure names its steps', () => {
    expect(open(ctx({ serverSetup: null }))).toEqual(['server']);
    expect(open(ctx({ serverSetup: { full: false, passed: false } }))).toEqual(['server']);
    const failed = { full: true, passed: false, counts: { ok: 11, fail: 2, warn: 0 }, steps: [{ step: 'backup', status: 'FAIL', detail: '' }, { step: 'monitor', status: 'FAIL', detail: '' }, { step: 'docker', status: 'OK', detail: '' }] };
    const r = goLiveChecks(ctx({ serverSetup: failed })).items.find((i) => i.key === 'server');
    expect(r).toMatchObject({ ok: false, vars: { steps: 3, fail: 2, warn: 0, failed: 'backup, monitor' } });
  });

  it('PR 397: the origin certificate — in use, with days to spare, covering every main domain', () => {
    expect(open(ctx({ originCert: null }))).toEqual(['originCert']);
    expect(open(ctx({ originCert: { mode: 'auto', active: false, error: 'the certificate does not cover new.example.test' } }))).toEqual(['originCert']);
    expect(open(ctx({ originCert: { mode: 'origin', active: true, names: ['*.example.test'], daysLeft: 12 } }))).toEqual(['originCert']);
    const r = goLiveChecks(ctx({ primaryHosts: ['example.test', 'shop.other.test'] })).items.find((i) => i.key === 'originCert');
    expect(r).toMatchObject({ ok: false, vars: { missing: 'shop.other.test', days: 5400 } });
    // no main domain yet: the certificate has nothing more to cover (only the indexing line waits for one, PR 401)
    expect(open(ctx({ primaryHosts: [] }))).toEqual(['indexing']);
    expect(open(ctx({ signoff: { ...ctx().signoff, sslStrict: undefined as never } }))).toEqual(['sslStrict']);
  });

  it('PR 399: the owner\'s data — every live store has its fields and a delivery band; named, never shown', () => {
    expect(open(ctx({ ownerData: [] }))).toEqual(['ownerData']);
    const r = goLiveChecks(ctx({ ownerData: [{ name: 'Main', missing: ['legal.tradeLicence'], bands: 0 }, { name: 'Two', missing: [], bands: 1 }, { name: 'Three', missing: [], bands: null }] }));
    expect(r.items.find((i) => i.key === 'ownerData')).toMatchObject({ ok: false, vars: { stores: 3, missing: 'Main: legal.tradeLicence, delivery band' } });
    expect(open(ctx({ ownerData: [{ name: 'Main', missing: [], bands: null }] }))).toEqual([]);
  });

  it('PR 400: every kind on the list has a connection that left the mock by a passing test', () => {
    const on = ctx().connections!.on;
    expect(open(ctx({ connections: undefined }))).toEqual(['connections']);
    const sms = (over: object) => ({ kinds: ['PAYMENT', 'COURIER', 'SMS'], on: [...on.slice(0, 2), { ...on[2]!, ...over }] });
    for (const over of [{ mode: 'MOCK' }, { lastTestOk: false }, { lastTestOk: null }]) {
      expect(goLiveChecks(ctx({ connections: sms(over) })).items.find((i) => i.key === 'connections')).toMatchObject({ ok: false, vars: { missing: 'SMS', live: 'bkash, steadfast' } });
    }
    expect(open(ctx({ connections: { kinds: ['COURIER', 'SMS'], on: on.slice(1) } }))).toEqual([]);
  });

  it('PR 401: indexing — the switch on and a main domain for it to count on; Search Console is a sign-off', () => {
    expect(open(ctx({ searchEngines: false }))).toEqual(['indexing']);
    expect(open(ctx({ primaryHosts: [] }))).toEqual(['indexing']);
    expect(goLiveChecks(ctx({ searchEngines: false })).items.find((i) => i.key === 'indexing')?.vars).toEqual({ hosts: 'example.test', on: 'off' });
    expect(SIGNOFF_KEYS).toContain('searchConsole');
  });

  it('PR 398: the runbook is a sign-off, and its file exists', () => {
    expect(SIGNOFF_KEYS).toContain('runbook');
    expect(existsSync(fileURLToPath(new URL('../../../../docs/golive/RUNBOOK.md', import.meta.url)))).toBe(true);
  });

  it('sign-offs: done only when confirmed, with who and when; nothing is confirmed on a new installation', () => {
    const fresh = goLiveChecks(ctx({ signoff: {} }));
    expect(fresh.ready).toBe(false);
    expect(fresh.items.filter((i) => i.kind === 'signoff' && i.ok)).toEqual([]);
    const one = goLiveChecks(ctx({ signoff: { qaGate: { at: ago(5), by: 'u7' } } })).items.find((i) => i.key === 'qaGate');
    expect(one).toMatchObject({ ok: true, by: 'u7', at: ago(5) });
  });

  it('every item has its title and how-to in English and Bengali; automatic ones also their "ok" words', () => {
    for (const d of [en, bn] as const) {
      for (const i of GO_LIVE) {
        const words = (d.item as Record<string, Record<string, string>>)[i.key];
        expect(words?.title, `${i.key}`).toBeTruthy();
        expect(words?.how, `${i.key}`).toBeTruthy();
        if (i.kind === 'auto') expect(words?.ok, `${i.key}`).toBeTruthy();
      }
    }
  });

  it('the API: two paths, each with its one method; nothing answers without the database', async () => {
    const req = (method: string) => new Request('https://shop.test/api/admin/go-live', { method, headers: { origin: 'https://shop.test' } });
    expect((await goLiveRoute(req('GET'), null, ['x'])).status).toBe(404);
    expect((await goLiveRoute(req('POST'), null, [])).status).toBe(405);
    expect((await goLiveRoute(req('GET'), null, ['signoff'])).status).toBe(405);
    expect((await goLiveRoute(req('GET'), null, [])).status).toBe(503);
    expect((await goLiveRoute(req('POST'), null, ['signoff'])).status).toBe(503);
  });
});
