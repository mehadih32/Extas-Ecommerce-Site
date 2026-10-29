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
    // a query rides on the last part (`consent?phone=…`); the route gets the path without it
    const res = await messagesRoute(call(method, `/api/admin/messages/${path.join('/')}`, { body, cookie }), deps, path.map((p) => p.split('?')[0]!));
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

  it('PR 291: Channels & limits — every channel on its mock (no credit read), the masking name saved with its version', async () => {
    const r = await api('GET', ['channels']);
    expect(r.status).toBe(200);
    expect(r.body.channels.channels.map((c: { channel: string; mode: string; balance: unknown }) => [c.channel, c.mode, c.balance])).toEqual([
      ['SMS', 'MOCK', null],
      ['WHATSAPP', 'MOCK', null],
      ['EMAIL', 'MOCK', null],
    ]);
    expect(r.body.channels.config).toMatchObject({ masking: null, smsRates: null });
    const version = r.body.channels.version as string;
    const masking = { senderName: 'SHOPNAME', state: 'requested', useWhenApproved: true };
    const saved = await api('PUT', ['channels'], { version, masking });
    expect(saved.status).toBe(200);
    expect(saved.body.channels.config.masking).toEqual(masking);
    expect(await deps.resolver.value('messages.sms.masking', { storeId: 1 })).toEqual(masking);
    expect((await api('PUT', ['channels'], { version, enabled: false })).body.error).toBe('STALE');
    expect((await api('PUT', ['channels'], { version: 7 })).body.error).toBe('INVALID_INPUT');
    expect((await api('PUT', ['channels'], { masking: { senderName: 'A NAME FAR TOO LONG', state: 'approved', useWhenApproved: true } })).body.error).toBe('INVALID_INPUT');
    expect((await api('POST', ['channels'], {})).status).toBe(405);
    expect((await api('GET', ['channels'], undefined, '')).status).toBe(401);
  });

  it('PR 292: WhatsApp templates — the practice sender plays the provider; sync and submit routes check their input', async () => {
    const r = await api('GET', ['whatsapp', 'templates']);
    expect(r.status).toBe(200);
    expect(r.body.templates).toMatchObject({ provider: 'mockWhatsApp', mode: 'MOCK', canSync: true, perms: { write: true } });
    const s = await api('POST', ['whatsapp', 'templates', 'sync']);
    expect(s.status).toBe(200);
    expect(s.body.sync.matched).toBe(0);
    expect((await api('POST', ['whatsapp', 'templates', 'not-an-id', 'submit'])).body.error).toBe('INVALID_INPUT');
    expect((await api('POST', ['whatsapp', 'templates', '0195a3c0-0000-7000-8000-000000000000', 'submit'])).status).toBe(404);
    expect((await api('GET', ['whatsapp', 'templates', 'sync'])).status).toBe(405);
    expect((await api('POST', ['whatsapp', 'templates'])).status).toBe(405);
    expect((await api('GET', ['whatsapp', 'other'])).status).toBe(404);
    expect((await api('GET', ['whatsapp', 'templates'], undefined, '')).status).toBe(401);
  });

  it('PR 298: Consent — the stop words with their version, one number`s answers, a stop recorded at his request', async () => {
    const r = await api('GET', ['consent']);
    expect(r.status).toBe(200);
    expect(r.body.consent.config).toMatchObject({ stopCovers: 'everything', stopChannels: 'thisChannel', confirmReply: false });
    const version = r.body.consent.version as string;
    const rec = await api('POST', ['consent', 'record'], { phone: '01700-000298', channels: ['SMS', 'WHATSAPP'], action: 'stopAll' });
    expect(rec.status).toBe(200);
    expect(rec.body.record.recorded).toBe(2);
    expect(rec.body.record.screen.lookup.states.find((s: { channel: string }) => s.channel === 'SMS')).toMatchObject({ all: false });
    expect((await api('GET', ['consent?phone=01700000298'])).body.consent.lookup.phone).toBe('+8801700000298');
    expect((await api('POST', ['consent', 'record'], { phone: 'x', channels: ['SMS'], action: 'stopAll' })).body.error).toBe('INVALID_INPUT');
    expect((await api('POST', ['consent', 'record'], { phone: '01700000298', channels: ['SMS'], action: 'blockHim' })).body.error).toBe('INVALID_INPUT');
    const saved = await api('PUT', ['consent'], { version, consent: { ...r.body.consent.config, confirmReply: true } });
    expect(saved.status).toBe(200);
    expect(saved.body.consent.config.confirmReply).toBe(true);
    expect((await api('PUT', ['consent'], { version, consent: r.body.consent.config })).body.error).toBe('STALE');
    expect((await api('GET', ['consent', 'record'])).status).toBe(405);
    expect((await api('GET', ['consent', 'x', 'y'])).status).toBe(404);
    expect((await api('GET', ['consent'], undefined, '')).status).toBe(401);
  });
});
