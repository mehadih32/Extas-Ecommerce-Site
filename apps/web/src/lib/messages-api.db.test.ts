// S05 · PR 148 — the Messages admin API on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): login, the journey with its version, a save through the settings (and a stale one
// refused), the self-confirm reply route, the message log and its retry route (PR 149), and the path table's refusals.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { messagesRoute } from './messages-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.48' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Messages admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const api = async (method: string, path: string[], body?: unknown, cookie = owner) => {
    const res = await messagesRoute(call(method, `/api/admin/messages/${path.join('/')}`, { body, cookie }), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('messages_api');
    await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login; unknown paths and methods are refused', async () => {
    expect((await api('GET', ['journey'], undefined, '')).status).toBe(401);
    expect((await api('GET', ['nope'])).status).toBe(404);
    expect((await api('GET', ['journey', 'x'])).status).toBe(404);
    expect((await api('POST', ['journey'], {})).status).toBe(405);
    expect((await api('GET', ['self-confirm'])).status).toBe(405);
  });

  it('the journey: read, saved through the settings with its version, a stale save refused', async () => {
    const r = await api('GET', ['journey']);
    expect(r.status).toBe(200);
    expect(r.body.journey.config.journey.selfConfirm.on).toBe(false);
    expect(r.body.journey.channels.map((c: { mode: string }) => c.mode)).toEqual(['MOCK', 'MOCK', 'MOCK']);
    const version = r.body.journey.version as string;
    const quiet = { on: true, fromHour: 22, toHour: 8 };
    const saved = await api('PUT', ['journey'], { version, quietHours: quiet });
    expect(saved.status).toBe(200);
    expect(saved.body.journey.config.quietHours).toEqual(quiet);
    expect(await deps.resolver.value('messages.quietHours', { storeId: 1 })).toEqual(quiet);
    expect((await api('PUT', ['journey'], { version, quietHours: { ...quiet, on: false } })).body.error).toBe('STALE');
    expect((await api('PUT', ['journey'], { version: 5 })).body.error).toBe('INVALID_INPUT');
    expect((await api('PUT', ['journey'], { nope: 1 })).body.error).toBe('INVALID_INPUT');
  });

  it('a self-confirm reply needs an order that was asked', async () => {
    const r = await api('POST', ['self-confirm'], { orderNumber: 'NO-SUCH', answer: 1 });
    expect([r.status, r.body.error]).toEqual([404, 'NOT_FOUND']);
    expect((await api('POST', ['self-confirm'], { orderNumber: 'X', answer: 4 })).body.error).toBe('INVALID_INPUT');
  });

  it('PR 149: the log with its counts; one message; a retry of a message that does not exist', async () => {
    const r = await api('GET', ['log']);
    expect(r.status).toBe(200);
    expect(r.body.log).toMatchObject({ rows: [], next: null, counts: { FAILED: 0, SENT: 0 } });
    expect((await api('GET', ['log'], undefined, '')).status).toBe(401);
    expect((await api('GET', ['log', 'not-a-uuid'])).body.error).toBe('INVALID_INPUT');
    const id = '0192f0e0-0000-7000-8000-000000000149';
    expect((await api('GET', ['log', id])).status).toBe(404);
    expect((await api('POST', ['log', id, 'retry'])).body.error).toBe('NOT_FOUND');
    expect((await api('GET', ['log', id, 'retry'])).status).toBe(405);
    expect((await api('POST', ['log', id, 'nope'])).status).toBe(404);
    expect((await api('POST', ['log'])).status).toBe(405);
  });
});
