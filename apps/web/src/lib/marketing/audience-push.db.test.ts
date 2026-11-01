// S13 · PR 263 — lookalike audiences and sending audiences on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): a lookalike's seed is the people delivered to in the owner's window, each valued by his
// delivered sales (never by order count; refused and cancelled orders and gifts never count); sending refuses while
// the switch is off; on, a platform with no ad account is a practice send and nothing is saved; through a live writer
// each account keeps one row (sent, the floor, the lookalike once its size is set, a refusal in words); the card saves
// at its version; the audit holds counts only. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { practiceAudienceWriter, type AudienceUpload, type AudienceWriter } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { audiencesSettingsHandler, audienceSyncs, pushAudience } from './audience-push';
import { audienceCountHandler, audiencesHandler, seedMembers } from './audiences';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const DAY = 86_400_000;
const ph = (n: number) => `+88017120000${String(n).padStart(2, '0')}`;

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.63' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

/** A stand-in live platform: remembers what it was given. */
function liveWriter(fail = false): AudienceWriter & { got: AudienceUpload[]; lookalikes: number } {
  const w = {
    ...practiceAudienceWriter('meta'),
    practice: false,
    got: [] as AudienceUpload[],
    lookalikes: 0,
    async upload(o: AudienceUpload) {
      w.got.push(o);
      return fail ? { ok: false as const, error: 'Meta refused (400): too few matched' } : { ok: true as const, value: { externalId: o.externalId ?? 'meta-list-1', sent: o.members.length } };
    },
    async lookalike() {
      w.lookalikes += 1;
      return { ok: true as const, value: { externalId: 'meta-lal-1' } };
    },
  };
  return w;
}

describe.skipIf(!HAS_TEST_DB)('lookalikes and sending audiences on PostgreSQL (PR 263)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let n = 0;
  let lal = { id: '', version: '' };
  const S = MOTHER_STORE_ID;
  const who = () => ({ actor: SYSTEM, ctx: {} });
  const ago = (d: number) => new Date(Date.now() - d * DAY);
  const order = async (phone: string, o: { delivered?: number; status?: 'DELIVERED' | 'RETURNED' | 'CANCELLED'; total: number; gift?: boolean }) => {
    n += 1;
    await t.prisma.order.create({
      data: { storeId: S, number: `W263-${n}`, source: 'WEBSITE', currency: 'BDT', phone, status: o.status ?? 'DELIVERED', placedAt: ago((o.delivered ?? 1) + 2), deliveredAt: o.delivered == null ? null : ago(o.delivered), isGift: o.gift ?? false, subtotalMinor: o.total, deliveryChargeMinor: 0, totalMinor: o.total, paymentMethod: 'COD', idempotencyKey: `w263-${n}` },
    });
  };
  const settings = async (patch: Record<string, unknown>) => deps.resolver.set('ads.audiences', { ...(await deps.resolver.value('ads.audiences', { storeId: S })), ...patch }, storeTarget(S));
  const fresh = async () => {
    const r = await audiencesHandler(call('GET', `/api/admin/marketing/audiences/${lal.id}`, owner), deps, lal.id);
    lal.version = ((await r.json()) as { audience: { version: string } }).audience.version;
    return lal.version;
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('audience_push');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    // 1: two parcels delivered (one stored in the local form) = 3,000 taka; 2: one big parcel 40 days ago; 3: many small
    // orders, one delivered = 200 taka; 3 also refused one and cancelled one; 4: only a gift; 5: delivered, then erased.
    await order(ph(1), { delivered: 3, total: 100_000 });
    await order('01712000001', { delivered: 10, total: 200_000 });
    await order(ph(2), { delivered: 40, total: 900_000 });
    await order(ph(3), { delivered: 2, total: 20_000 });
    await order(ph(3), { status: 'RETURNED', total: 500_000 });
    await order(ph(3), { status: 'CANCELLED', total: 500_000 });
    await order(ph(4), { delivered: 1, total: 300_000, gift: true });
    await order(ph(5), { delivered: 1, total: 100_000 });
    await t.prisma.customer.create({ data: { storeId: S, phone: ph(5), erasedAt: new Date() } });
  });
  afterAll(async () => t?.drop());

  it('a lookalike seed is the people delivered to in the window, valued by delivered sales', async () => {
    expect([...(await seedMembers(deps.db, { v: 1, seedDays: 30 }))].sort()).toEqual([
      [ph(1), 300_000],
      [ph(3), 20_000],
    ]);
    expect((await seedMembers(deps.db, { v: 1, seedDays: 60 })).get(ph(2))).toBe(900_000);
    const c = await audienceCountHandler(call('GET', `/api/admin/marketing/audiences/count?lookalike=${encodeURIComponent(JSON.stringify({ seedDays: 30 }))}`, owner), deps);
    expect(((await c.json()) as { count: { size: number } }).count.size).toBe(2);
    const made = await audiencesHandler(call('POST', '/api/admin/marketing/audiences', owner, { kind: 'LOOKALIKE', name: 'Like our best buyers', definition: { seedDays: 30 } }), deps, null);
    expect(made.status).toBe(201);
    const a = ((await made.json()) as { audience: { id: string; kind: string; size: number; seedDays: number; rules: unknown[]; version: string } }).audience;
    expect([a.kind, a.size, a.seedDays, a.rules]).toEqual(['LOOKALIKE', 2, 30, []]);
    lal = { id: a.id, version: a.version };
    // an audience keeps its kind
    const turn = await audiencesHandler(call('PUT', `/api/admin/marketing/audiences/${a.id}`, owner, { name: 'x', definition: { rules: [{ kind: 'ordered', days: 3 }] }, version: a.version }), deps, a.id);
    expect(((await turn.json()) as { details: string[] }).details).toEqual(['kind']);
    expect((await audiencesHandler(call('POST', '/api/admin/marketing/audiences', owner, { kind: 'LOOKALIKE', name: 'No days', definition: {} }), deps, null)).status).toBe(400);
  });

  it('sending is refused while the switch is off; on, with no ad account, it is a practice send and nothing is saved', async () => {
    await expect(pushAudience({ db: deps.db, resolver: deps.resolver }, who(), lal.id, { version: lal.version })).rejects.toMatchObject({ code: 'SWITCH_OFF' });
    await settings({ push: true });
    await expect(pushAudience({ db: deps.db, resolver: deps.resolver }, who(), lal.id, { version: 'old' })).rejects.toMatchObject({ code: 'STALE' });
    const none = await audiencesHandler(call('POST', '/api/admin/marketing/audiences', owner, { kind: 'LOOKALIKE', name: 'Nobody yet', definition: { seedDays: 1 } }), deps, null);
    const empty = ((await none.json()) as { audience: { id: string; size: number; version: string } }).audience;
    expect(empty.size).toBe(0);
    await expect(pushAudience({ db: deps.db, resolver: deps.resolver }, who(), empty.id, { version: empty.version })).rejects.toMatchObject({ code: 'EMPTY' });
    const r = await pushAudience({ db: deps.db, resolver: deps.resolver }, who(), lal.id, { version: lal.version });
    expect(r.map((x) => [x.platform, x.account, x.status, x.sent, x.lookalike])).toEqual([
      ['meta', null, 'PRACTICE', 2, 'NO_COUNTRY'],
      ['tiktok', null, 'PRACTICE', 2, 'NO_COUNTRY'],
      ['google', null, 'PRACTICE', 2, 'NO_COUNTRY'],
    ]);
    expect(await t.prisma.audienceSync.count()).toBe(0);
  });

  it('through a live writer each account keeps one row: the floor, the value-based list, the lookalike once sized', async () => {
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_263', name: 'Sample Meta account', currency: 'BDT' } });
    const meta = liveWriter();
    await settings({ minMeta: 5 });
    let r = await pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta } }, who(), lal.id, { version: lal.version });
    expect(r[0]).toMatchObject({ platform: 'meta', account: { id: acc.id }, status: 'TOO_SMALL', sent: 0 });
    expect(meta.got).toHaveLength(0);
    await settings({ minMeta: 2, countries: 'bd' });
    r = await pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta } }, who(), lal.id, { version: lal.version });
    expect(r[0]).toMatchObject({ status: 'SENT', sent: 2, lookalike: 'NO_SIZE' });
    expect(meta.got[0]!.valueBased).toBe(true);
    expect(meta.got[0]!.members.map((m) => m.value).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([200, 3000]);
    expect(JSON.stringify(meta.got)).not.toContain('8801712');
    await settings({ metaPercent: 2 });
    r = await pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta } }, who(), lal.id, { version: lal.version });
    expect(r[0]).toMatchObject({ status: 'SENT', lookalike: 'MADE' });
    expect(meta.got[1]!.externalId).toBe('meta-list-1');
    await pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta } }, who(), lal.id, { version: lal.version });
    expect(meta.lookalikes).toBe(1);
    expect(r.slice(1).map((x) => x.status)).toEqual(['PRACTICE', 'PRACTICE']);
    const rows = await audienceSyncs(deps.db, lal.id);
    expect(rows).toEqual([expect.objectContaining({ platform: 'meta', account: 'Sample Meta account', status: 'SENT', memberCount: 2, lookalike: true, lastError: null })]);
    const failing = liveWriter(true);
    r = await pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta: failing } }, who(), lal.id, { version: lal.version });
    expect(r[0]).toMatchObject({ status: 'FAILED', error: 'Meta refused (400): too few matched' });
    const row = await t.prisma.audienceSync.findFirstOrThrow({ where: { audienceId: lal.id } });
    expect([row.status, row.lastError, row.externalAudienceId, row.lookalikeExternalId]).toEqual(['FAILED', 'Meta refused (400): too few matched', 'meta-list-1', 'meta-lal-1']);
    const logs = await t.prisma.auditLog.findMany({ where: { entityId: lal.id, action: 'marketing.audience.push' } });
    expect(logs.length).toBe(6);
    expect(JSON.stringify(logs)).not.toMatch(/8801712|01712/);
    // an archived audience is never sent
    await t.prisma.audience.update({ where: { id: lal.id }, data: { archivedAt: new Date() } });
    await expect(pushAudience({ db: deps.db, resolver: deps.resolver }, who(), lal.id, { version: await fresh() })).rejects.toMatchObject({ code: 'ARCHIVED' });
  });

  it('the card saves at its version (audited) and a stranger is refused', async () => {
    const get = async (cookie = owner) => audiencesSettingsHandler(call('GET', '/api/admin/marketing/audiences/settings', cookie), deps);
    const c = ((await (await get()).json()) as { cards: { audiences: { value: Record<string, unknown>; version: string } } }).cards.audiences;
    expect(c.value.push).toBe(true);
    const put = (body: unknown) => audiencesSettingsHandler(call('PUT', '/api/admin/marketing/audiences/settings', owner, body), deps);
    expect((await put({ key: 'audiences', value: { ...c.value, push: false }, version: 'old' })).status).toBe(409);
    expect((await put({ key: 'audiences', value: { ...c.value, metaPercent: 20 }, version: c.version })).status).toBe(400);
    const ok = await put({ key: 'audiences', value: { ...c.value, push: false }, version: c.version });
    expect(ok.status).toBe(200);
    expect((await deps.resolver.value('ads.audiences', { storeId: S })).push).toBe(false);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.audiences.settings' } })).toBe(1);
    expect((await get('')).status).toBe(401);
  });
});
