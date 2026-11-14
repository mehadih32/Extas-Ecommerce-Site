// S15 · PR 582 — agent memory on PostgreSQL, through `POST/GET /api/admin/agents/:key/memory`: off by default on a
// fresh installation; adding, listing, searching, correcting and archiving a memory while on; the shared on/off
// switch; permission checks; one agent's memory never appears on another's; nothing is ever hard-deleted. A
// throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { agentMemoryHandler } from './agent-memory-api';

void INSTALLATION;

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface MemoryRow {
  id: string;
  kind: string;
  content: string;
  tags: string[];
  archived: boolean;
  corrected: boolean;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  memoryOn?: boolean;
  memories?: MemoryRow[];
}

describe.skipIf(!HAS_TEST_DB)('agent memory on PostgreSQL (PR 582)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let controller = '';

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } } as never), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } } as never), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', '/api/admin/staff-roles', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } } as never), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email, password: 'first password from the owner' } }), deps));
    return cookiesOf(await passwordHandler(call('POST', '/api/admin/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  };
  const memory = async (method: string, key: string, cookie: string, reqBody?: unknown) => {
    const res = await agentMemoryHandler(call(method, `/api/admin/agents/${key}/memory`, { cookie, body: reqBody }), deps, key);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staff('reader@example.com', ['ai.read']);
    controller = await staff('controller@example.com', ['ai.read', 'ai.control']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships off on a fresh installation, and writing a memory while off is refused, not silently dropped', async () => {
    const read = await memory('GET', 'gyani', reader);
    expect(read.status).toBe(200);
    expect(read.a.memoryOn).toBe(false);
    expect(read.a.memories).toEqual([]);

    const add = await memory('POST', 'gyani', controller, { action: 'add', kind: 'instruction', content: 'Always confirm COD orders over 5,000 by phone.' });
    expect(add.status).toBe(409);
    expect(add.a.error).toBe('MEMORY_OFF');
  });

  it('a reader cannot turn the switch on', async () => {
    expect((await memory('POST', 'gyani', reader, { action: 'toggle', enabled: true })).status).toBe(403);
  });

  it('once turned on, the owner can add, list, search, correct and archive a memory — never delete it', async () => {
    const toggled = await memory('POST', 'gyani', controller, { action: 'toggle', enabled: true });
    expect(toggled.status).toBe(200);
    expect(toggled.a.memoryOn).toBe(true);

    const added = await memory('POST', 'gyani', controller, {
      action: 'add',
      kind: 'instruction',
      content: 'Prefer Pathao for Sylhet, Steadfast for Dhaka.',
      tags: ['courier', 'sylhet'],
    });
    expect(added.status).toBe(200);
    const row = added.a.memories!.find((m) => m.content.includes('Pathao'))!;
    expect(row.corrected).toBe(false);
    expect(row.archived).toBe(false);

    const searchRes = await agentMemoryHandler(call('GET', `/api/admin/agents/gyani/memory?search=pathao`, { cookie: reader }), deps, 'gyani');
    const searchJson = (await searchRes.json()) as Answer;
    expect(searchJson.memories!.some((m) => m.id === row.id)).toBe(true);

    const corrected = await memory('POST', 'gyani', controller, { action: 'correct', memoryId: row.id, content: 'Prefer Pathao for Sylhet and Rajshahi, Steadfast for Dhaka.' });
    expect(corrected.status).toBe(200);
    const correctedRow = corrected.a.memories!.find((m) => m.id === row.id)!;
    expect(correctedRow.corrected).toBe(true);
    expect(correctedRow.content).toContain('Rajshahi');

    const archived = await memory('POST', 'gyani', controller, { action: 'archive', memoryId: row.id });
    expect(archived.status).toBe(200);
    expect(archived.a.memories!.find((m) => m.id === row.id)!.archived).toBe(true);

    const restored = await memory('POST', 'gyani', controller, { action: 'restore', memoryId: row.id });
    expect(restored.a.memories!.find((m) => m.id === row.id)!.archived).toBe(false);
  });

  it('one agent\'s memory never appears on another\'s, and an unknown memory id on the right agent 404s', async () => {
    await memory('POST', 'prohori', controller, { action: 'add', kind: 'fact', content: "Prohori's own memory, never Gyani's." });
    const gyaniView = await memory('GET', 'gyani', reader);
    expect(gyaniView.a.memories!.some((m) => m.content.includes("Prohori's"))).toBe(false);

    expect((await memory('POST', 'gyani', controller, { action: 'correct', memoryId: 'not-a-real-id', content: 'x' })).status).toBe(404);
  });

  it('refuses an unknown kind, empty content, and an unknown agent', async () => {
    expect((await memory('POST', 'gyani', controller, { action: 'add', kind: 'rumor', content: 'x' })).status).toBe(422);
    expect((await memory('POST', 'gyani', controller, { action: 'add', kind: 'fact', content: '   ' })).status).toBe(422);
    expect((await memory('GET', 'not-a-real-agent', reader)).status).toBe(404);
  });

  it('a no-op toggle (already on) writes once, harmlessly', async () => {
    const again = await memory('POST', 'gyani', controller, { action: 'toggle', enabled: true });
    expect(again.status).toBe(200);
    expect(again.a.memoryOn).toBe(true);
  });
});
