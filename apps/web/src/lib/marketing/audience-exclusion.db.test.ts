// S13 · PR 264 — the refused-parcel exclusion list and the daily refresh on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): one exclusion audience per store, made by the shop; its people are the numbers a person
// LISTED on the refused-parcel list (never a proposed, dismissed or removed one, never an erased customer's), plus —
// when the owner ticks it — every refusal that was not the shop's fault in his window; it is never edited or archived by
// hand nor picked as a campaign's audience; it is sent (marked as an exclusion) only while both switches are on; the daily refresh is off as it ships, then
// counts every live audience and sends the exclusion list and the audiences already sent to a real account; the
// worker's hook answers "not found" without the server's token. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { practiceAudienceWriter, type AudienceUpload, type AudienceWriter } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { AUDIENCE_KIND_EXCLUSION } from './audience-model';
import { audienceRefreshHook, audiencesSettingsHandler, exclusionAudience, pushAudience, refreshAudiences } from './audience-push';
import { audienceList, audienceOne, audiencesHandler, ensureExclusionAudience, exclusionMembers } from './audiences';
import { campaignChoices, saveCampaign } from './campaigns';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const DAY = 86_400_000;
const TOKEN = 'k'.repeat(48);
const ph = (n: number) => `+88017130000${String(n).padStart(2, '0')}`;

function call(method: string, path: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.64', ...headers };
  if (method !== 'GET') h.origin = `https://${HOST}`;
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

/** A stand-in live platform that remembers what it was given. */
function liveWriter(): AudienceWriter & { got: AudienceUpload[] } {
  const w = {
    ...practiceAudienceWriter('meta'),
    practice: false,
    got: [] as AudienceUpload[],
    async upload(o: AudienceUpload) {
      w.got.push(o);
      return { ok: true as const, value: { externalId: o.externalId ?? `meta-${w.got.length}`, sent: o.members.length } };
    },
  };
  return w;
}

describe.skipIf(!HAS_TEST_DB)('the refused-parcel exclusion list on PostgreSQL (PR 264)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let n = 0;
  let exId = '';
  const S = MOTHER_STORE_ID;
  const who = () => ({ actor: SYSTEM, ctx: {} });
  const ago = (d: number) => new Date(Date.now() - d * DAY);
  const set = async (key: 'ads.audiences' | 'ads.refusedExclude' | 'ads.audienceRefresh', patch: Record<string, unknown>) =>
    deps.resolver.set(key, { ...((await deps.resolver.value(key, { storeId: S })) as object), ...patch } as never, storeTarget(S));
  const entry = (phone: string, state: 'PROPOSED' | 'LISTED' | 'DISMISSED' | 'REMOVED') => t.prisma.refusedParcelEntry.create({ data: { storeId: S, phone, state, refusals: 2, lastRefusedAt: ago(3) } });
  const refused = async (phone: string, days: number) => {
    n += 1;
    await t.prisma.order.create({
      data: { storeId: S, number: `W264-${n}`, source: 'WEBSITE', currency: 'BDT', phone, status: 'RETURNED', placedAt: ago(days + 2), returnedAt: ago(days), subtotalMinor: 10_000, deliveryChargeMinor: 0, totalMinor: 10_000, paymentMethod: 'COD', idempotencyKey: `w264-${n}` },
    });
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('audience_exclusion');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    // listed: 1 (and in the local form 2), proposed 3, dismissed 4, removed 5, listed but erased 6
    await entry(ph(1), 'LISTED');
    await entry('01713000002', 'LISTED');
    await entry(ph(3), 'PROPOSED');
    await entry(ph(4), 'DISMISSED');
    await entry(ph(5), 'REMOVED');
    await entry(ph(6), 'LISTED');
    await t.prisma.customer.create({ data: { storeId: S, phone: ph(6), erasedAt: new Date() } });
    // refusals not on the list: 7 ten days ago, 8 a hundred days ago
    await refused(ph(7), 10);
    await refused(ph(8), 100);
  });
  afterAll(async () => {
    delete process.env.CACHE_HOOK_TOKEN;
    await t?.drop();
  });

  it('is one audience per store, made by the shop; its people are the LISTED numbers, then every refusal when ticked', async () => {
    const a = await exclusionAudience(deps.db, deps.resolver);
    exId = a.id;
    expect((await ensureExclusionAudience(deps.db, 'again')).id).toBe(a.id);
    await expect(t.prisma.audience.create({ data: { storeId: S, kind: AUDIENCE_KIND_EXCLUSION, name: 'second', definition: {} } })).rejects.toThrow();
    const row = await audienceOne(deps.db, a.id);
    expect([row?.kind, row?.size, row?.rules]).toEqual([AUDIENCE_KIND_EXCLUSION, 2, []]);
    expect((await audienceList(deps.db))[0]!.id).toBe(a.id);
    expect([...(await exclusionMembers(deps.db, deps.resolver))].sort()).toEqual([ph(1), ph(2)]);
    await set('ads.refusedExclude', { everyRefusal: true, days: 30 });
    expect([...(await exclusionMembers(deps.db, deps.resolver))].sort()).toEqual([ph(1), ph(2), ph(7)]);
    await set('ads.refusedExclude', { days: 0 });
    expect([...(await exclusionMembers(deps.db, deps.resolver))].sort()).toEqual([ph(1), ph(2), ph(7), ph(8)]);
    await set('ads.refusedExclude', { everyRefusal: false });
  });

  it('is never a campaign’s audience (it is only for leaving people out)', async () => {
    expect((await campaignChoices(deps.db)).audiences.map((x) => x.id)).not.toContain(exId);
    const input = { name: 'Sample push', objective: 'delivered', channels: ['meta'], audienceId: exId, offer: { kind: 'words', words: { en: 'Sample offer', bn: null } }, couponId: null, creative: { headline: { en: 'Sample', bn: null } }, startsAt: null, endsAt: null, budgetMinor: null, budgetKind: null, version: null };
    await expect(saveCampaign(deps.db, deps.resolver, who(), null, input)).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['audienceId'] });
  });

  it('is never edited or archived by hand; counting it again is allowed', async () => {
    const version = (await audienceOne(deps.db, exId))!.version;
    const put = await audiencesHandler(call('PUT', `/api/admin/marketing/audiences/${exId}`, owner, { name: 'x', definition: { rules: [{ kind: 'ordered', days: 3 }] }, version }), deps, exId);
    expect([put.status, ((await put.json()) as { error: string }).error]).toEqual([409, 'SYSTEM']);
    const arch = await audiencesHandler(call('POST', `/api/admin/marketing/audiences/${exId}`, owner, { action: 'archive', version }), deps, exId);
    expect([arch.status, ((await arch.json()) as { error: string }).error]).toEqual([409, 'SYSTEM']);
    const re = await audiencesHandler(call('POST', `/api/admin/marketing/audiences/${exId}`, owner, { action: 'recount', version }), deps, exId);
    expect(re.status).toBe(200);
  });

  it('is sent only while both switches are on, marked as an exclusion, hashes only', async () => {
    const meta = liveWriter();
    await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_264', name: 'Sample Meta account', currency: 'BDT' } });
    const version = async () => (await audienceOne(deps.db, exId))!.version;
    await expect(pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta } }, who(), exId, { version: await version() })).rejects.toMatchObject({ code: 'SWITCH_OFF' });
    await set('ads.audiences', { push: true });
    await expect(pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta } }, who(), exId, { version: await version() })).rejects.toMatchObject({ code: 'EXCLUDE_OFF' });
    // the card turns it on (audited) and counts it again
    const get = await audiencesSettingsHandler(call('GET', '/api/admin/marketing/audiences/settings', owner), deps);
    const cards = ((await get.json()) as { cards: Record<string, { value: Record<string, unknown>; version: string }> }).cards;
    expect(Object.keys(cards).sort()).toEqual(['audiences', 'refresh', 'refused']);
    expect(cards.refused!.value).toEqual({ on: false, everyRefusal: false, days: 0 });
    const put = (body: unknown) => audiencesSettingsHandler(call('PUT', '/api/admin/marketing/audiences/settings', owner, body), deps);
    expect((await put({ key: 'refused', value: { ...cards.refused!.value, days: -1 }, version: cards.refused!.version })).status).toBe(400);
    expect((await put({ key: 'nope', value: {}, version: '' })).status).toBe(400);
    const ok = await put({ key: 'refused', value: { ...cards.refused!.value, on: true }, version: cards.refused!.version });
    expect(ok.status).toBe(200);
    expect(Object.keys(((await ok.json()) as { cards: object }).cards)).toEqual(['refused']);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.audiences.settings', entityId: 'ads.refusedExclude' } })).toBe(1);
    const r = await pushAudience({ db: deps.db, resolver: deps.resolver, writers: { meta } }, who(), exId, { version: await version() });
    expect(r[0]).toMatchObject({ platform: 'meta', status: 'SENT', sent: 2 });
    expect(meta.got[0]).toMatchObject({ exclusion: true, valueBased: false });
    expect(JSON.stringify(meta.got)).not.toMatch(/8801713|01713/);
    const log = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: exId, action: 'marketing.audience.push' } });
    expect(log.after).toMatchObject({ people: 2, exclusion: true });
  });

  it('the daily refresh is off as it ships; on, it counts every audience and sends the exclusion list and the ones sent before', async () => {
    expect(await refreshAudiences({ db: deps.db, resolver: deps.resolver })).toEqual({ skipped: 'off', counted: 0, sent: [] });
    await set('ads.audienceRefresh', { on: true });
    // a builder audience never sent anywhere is counted, not sent
    const made = await audiencesHandler(call('POST', '/api/admin/marketing/audiences', owner, { name: 'Refused, any time', definition: { rules: [{ kind: 'refused' }] } }), deps, null);
    const b = ((await made.json()) as { audience: { id: string } }).audience;
    await entry(ph(9), 'LISTED');
    const meta = liveWriter();
    const r = await refreshAudiences({ db: deps.db, resolver: deps.resolver, writers: { meta } });
    expect(r.counted).toBe(2);
    expect(r.sent.map((x) => x.id)).toEqual([exId]);
    expect(meta.got.map((u) => [u.exclusion, u.members.length])).toEqual([[true, 3]]);
    expect((await audienceOne(deps.db, exId))!.size).toBe(3);
    expect((await audienceOne(deps.db, b.id))!.size).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.audience.push', actorId: null, entityId: exId } })).toBeGreaterThanOrEqual(2);
  });

  it('the worker’s hook answers “not found” without the server’s token', async () => {
    process.env.CACHE_HOOK_TOKEN = TOKEN;
    const hook = (headers: Record<string, string>) => audienceRefreshHook(call('POST', '/api/internal/audiences/refresh', undefined, { storeId: S }, headers), deps);
    expect((await hook({})).status).toBe(404);
    expect((await hook({ 'x-extas-cache-hook': 'k'.repeat(47) })).status).toBe(404);
    const ok = await hook({ 'x-extas-cache-hook': TOKEN });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok: boolean; counted: number; sent: { id: string; statuses: string[] }[] };
    expect(body.counted).toBe(2);
    expect(body.sent[0]).toMatchObject({ id: exId });
    expect(JSON.stringify(body)).not.toMatch(/8801713/);
    process.env.CACHE_HOOK_TOKEN = 'short';
    expect((await hook({ 'x-extas-cache-hook': 'short' })).status).toBe(404);
  });
});
