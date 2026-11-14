// S28 · PR 713 — AI Center › Training on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the instructions ship empty, only
// ai.control may teach, every write is a version read from the AiTrainingExample rows, "restore" makes NEW rows and archives the rest
// (nothing deleted, PR 323's corrections untouched), a stale screen, a duplicate, an unknown agent and empty text are refused.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import { instructionsHandler } from './training-instructions-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const SAMPLE_UUID = '00000000-0000-4000-8000-000000000001';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; key?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.76' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('AI Center › Training on PostgreSQL (PR 713)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  type Screen = { ok?: boolean; error?: string; training?: { agents: Array<{ key: string; lines: string[] }>; forbidden: string[]; version: string }; versions?: Array<{ id: string; no: number; current: boolean; restoredFrom: number | null; by: string | null; ops: Array<{ op: string; scope: string; text: string }> }>; versionTotal?: number; cards?: { options: { value: { versionRows: number }; version: string } } };
  const call2 = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await instructionsHandler(call(method, '/api/admin/ai/training/instructions', o), deps);
    return { status: res.status, body: (await res.json()) as Screen };
  };
  const post = (cookie: string, b: Record<string, unknown>) => call2('POST', { cookie, body: b });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('ai_training');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'AI reader', nameBn: 'এআই দেখা', permissions: ['ai.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships empty; a reader sees it but may not teach; nothing is saved by looking', async () => {
    const r = await call2('GET', { cookie: reader });
    expect(r.status).toBe(200);
    expect(r.body.training?.agents).toEqual([]);
    expect(r.body.training?.forbidden).toEqual([]);
    expect(r.body.versionTotal).toBe(0);
    expect(r.body.cards?.options.value.versionRows).toBe(10);
    expect((await post(reader, { action: 'add', agent: 'all', text: 'Be kind', base: r.body.training?.version })).status).toBe(403);
  });

  it('adds, refuses a stale screen, a duplicate, an unknown agent and empty text; every write is a version', async () => {
    let s = (await call2('GET', { cookie: owner })).body;
    const base0 = s.training!.version;
    const a = await post(owner, { action: 'add', agent: 'all', text: '  Write short, warm replies  ', base: base0 });
    expect(a.status).toBe(200);
    expect(a.body.training?.agents).toEqual([{ key: 'all', lines: ['Write short, warm replies'] }]);
    expect((await post(owner, { action: 'add', agent: 'doot', text: 'x', base: base0 })).status).toBe(409);
    s = a.body as Screen;
    const base1 = s.training!.version;
    expect((await post(owner, { action: 'add', agent: 'all', text: 'Write short, warm replies', base: base1 })).body.error).toBe('DUPLICATE');
    expect((await post(owner, { action: 'add', agent: 'nobody', text: 'x', base: base1 })).status).toBe(400);
    expect((await post(owner, { action: 'add', agent: 'doot', text: '   ', base: base1 })).status).toBe(400);
    const b = await post(owner, { action: 'add', agent: 'doot', text: 'Say Eid offers in Bengali', base: base1 });
    expect(b.status).toBe(200);
    expect(b.body.training?.agents.map((x) => x.key)).toEqual(['all', 'doot']);
    expect(b.body.versionTotal).toBe(2);
    expect(b.body.versions?.map((v) => v.no)).toEqual([2, 1]);
    expect(b.body.versions?.[0]?.current).toBe(true);
    expect(b.body.versions?.[0]?.ops).toEqual([{ op: 'add', scope: 'doot', text: 'Say Eid offers in Bengali' }]);
    expect(b.body.versions?.[0]?.by).toBe('Sample owner');
  });

  it('forbidden topics add and remove; restoring is a NEW version, rows are archived never deleted, corrections stay', async () => {
    // a correction PR 323 recorded: not an instruction, never touched here
    await t.prisma.aiTrainingExample.create({ data: { agentKey: 'doot', kind: 'correction', input: 'was', expected: 'now' } });
    let s = (await call2('GET', { cookie: owner })).body;
    s = (await post(owner, { action: 'addForbidden', text: 'Politics', base: s.training!.version })).body;
    expect(s.training?.forbidden).toEqual(['Politics']);
    expect(s.versionTotal).toBe(3);
    const v1 = s.versions!.find((v) => v.no === 1)!;
    const v3 = s.versions!.find((v) => v.no === 3)!;
    const r = await post(owner, { action: 'restore', versionId: v1.id, base: s.training!.version });
    expect(r.status).toBe(200);
    expect(r.body.training?.agents).toEqual([{ key: 'all', lines: ['Write short, warm replies'] }]);
    expect(r.body.training?.forbidden).toEqual([]);
    expect(r.body.versionTotal).toBe(4);
    expect(r.body.versions?.[0]?.restoredFrom).toBe(1);
    expect(r.body.versions?.[0]?.ops.map((o) => o.op)).toEqual(['remove', 'remove']);
    // nothing deleted: three instruction/forbidden rows, two of them archived
    const kept = await t.prisma.aiTrainingExample.findMany({ where: { kind: { in: ['instruction', 'forbidden'] } } });
    expect(kept).toHaveLength(3);
    expect(kept.filter((x) => x.archivedAt).length).toBe(2);
    // restoring what is already in use changes nothing
    expect((await post(owner, { action: 'restore', versionId: r.body.versions![0]!.id, base: r.body.training!.version })).body.error).toBe('NO_CHANGE');
    // bringing the newest back makes NEW rows for what was archived
    const back = await post(owner, { action: 'restore', versionId: v3.id, base: r.body.training!.version });
    expect(back.status).toBe(200);
    expect(back.body.training?.agents.map((x) => x.key)).toEqual(['all', 'doot']);
    expect(back.body.training?.forbidden).toEqual(['Politics']);
    expect(back.body.versionTotal).toBe(5);
    expect(await t.prisma.aiTrainingExample.count({ where: { kind: { in: ['instruction', 'forbidden'] } } })).toBe(5);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.training.restore' } })).toBe(2);
    expect((await post(owner, { action: 'restore', versionId: 'not a time', base: back.body.training!.version })).status).toBe(400);
    expect((await post(owner, { action: 'restore', versionId: '2001-01-01T00:00:00.000Z', base: back.body.training!.version })).status).toBe(404);
    // removing a line is a version too, and a line that is not there is not found
    const rm = await post(owner, { action: 'remove', agent: 'all', text: 'Write short, warm replies', base: back.body.training!.version });
    expect(rm.body.training?.agents.map((x) => x.key)).toEqual(['doot']);
    expect((await post(owner, { action: 'remove', agent: 'all', text: 'gone', base: rm.body.training!.version })).status).toBe(404);
    expect((await post(owner, { action: 'removeForbidden', text: 'Politics', base: rm.body.training!.version })).body.training?.forbidden).toEqual([]);
    // the correction was never touched
    expect(await t.prisma.aiTrainingExample.count({ where: { kind: 'correction', archivedAt: null } })).toBe(1);
  });

  it('the history length is the owner\'s setting; out of range and stale are refused', async () => {
    const shown = (await call2('GET', { cookie: owner })).body.cards!.options;
    expect((await call2('PUT', { cookie: reader, body: { key: 'options', value: { versionRows: 20 }, version: shown.version } })).status).toBe(403);
    expect((await call2('PUT', { cookie: owner, body: { key: 'options', value: { versionRows: 2 }, version: shown.version } })).status).toBe(400);
    const ok = await call2('PUT', { cookie: owner, body: { key: 'options', value: { versionRows: 5 }, version: shown.version } });
    expect(ok.status).toBe(200);
    expect(ok.body.versions?.length).toBeLessThanOrEqual(5);
    expect((await call2('PUT', { cookie: owner, body: { key: 'options', value: { versionRows: 7 }, version: shown.version } })).status).toBe(409);
  });
});
