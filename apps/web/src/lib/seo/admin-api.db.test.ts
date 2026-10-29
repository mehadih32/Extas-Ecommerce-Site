// S11 · PR 220 — GET/PUT /api/admin/seo on a real PostgreSQL: the SEO settings with their versions and the shop's
// address, read with seo.read and saved with seo.manage through the settings resolver (a stale version is 409, a wrong
// value 400, an unchanged one writes nothing), with an audit row.
// PR 221 — the AI drafts: refused while AI or the drafts are off; "Draft" writes (on the practice writer) only for
// pages without their own text, at most `batchMax`, never twice for a page with a draft waiting; accepting fills only
// empty fields (the product page then shows it), discarding keeps the row; each decision is taken once.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { productSeoTexts } from '@extas/catalogue';
import { INSTALLATION, messages, prismaBackend, registry, SEO_AI_DRAFTS_DEFAULT, SEO_INDEXING_DEFAULT, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { seoDraftsRoute, seoSettingsRoute } from './admin-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const BASE = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.31', origin: `https://${HOST}`, 'content-type': 'application/json' };

function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { ...BASE };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request(`https://${HOST}${path}`, { method, headers, ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

/** Signs in a new staff member holding only `permissions`, and returns their cookies. */
async function staffWith(deps: AdminDeps, owner: string, email: string, permissions: string[]): Promise<string> {
  const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: `Role ${email}`, nameBn: 'ভূমিকা', permissions } }), deps);
  const roleId = ((await role.json()) as { role: { id: string } }).role.id;
  const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: 'Sample staff', password: 'first password from the owner' } }), deps);
  const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
  await staffRolesHandler(call('POST', `/api/admin/staff/${staffId}/roles`, { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
  const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email, password: 'first password from the owner' } }), deps));
  return cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
}

describe.skipIf(!HAS_TEST_DB)('Website › SEO settings on PostgreSQL (PR 220)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staffWith(deps, owner, 'reader@example.com', ['seo.read']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a session; seo.read reads, seo.manage saves', async () => {
    expect((await seoSettingsRoute(call('GET', '/api/admin/seo'), deps)).status).toBe(401);
    expect((await seoSettingsRoute(call('GET', '/api/admin/seo', { cookie: reader }), null)).status).toBe(503);
    const res = await seoSettingsRoute(call('GET', '/api/admin/seo', { cookie: reader }), deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { values: Record<string, unknown>; site: { primary: string | null; bengaliOn: boolean } };
    expect(body.values['seo.indexing']).toEqual(SEO_INDEXING_DEFAULT);
    expect(body.site.primary).toBeNull();
    const put = await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: reader, body: { key: 'seo.indexing', value: SEO_INDEXING_DEFAULT } }), deps);
    expect(put.status).toBe(403);
    expect((await seoSettingsRoute(call('DELETE', '/api/admin/seo', { cookie: owner }), deps)).status).toBe(405);
  });

  it('saves through the resolver with an audit row; stale and wrong values are refused', async () => {
    const got = (await (await seoSettingsRoute(call('GET', '/api/admin/seo', { cookie: owner }), deps)).json()) as { versions: Record<string, number> };
    const version = got.versions['seo.indexing'];
    const next = { ...SEO_INDEXING_DEFAULT, pages: { ...SEO_INDEXING_DEFAULT.pages, search: true }, xDefault: 'none' as const };
    expect((await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: next, version: (version ?? 0) + 7 } }), deps)).status).toBe(409);
    const bad = await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: { ...next, extra: 1 } } }), deps);
    expect(bad.status).toBe(400);
    expect((await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'store.name', value: 'x' } }), deps)).status).toBe(400);
    const ok = await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: next, version } }), deps);
    expect(ok.status).toBe(200);
    expect(await deps.resolver.value('seo.indexing', { storeId: MOTHER_STORE_ID })).toEqual(next);
    const rows = await t.prisma.auditLog.findMany({ where: { action: 'seo.settings' } });
    expect(rows).toHaveLength(1);
    // the same value again writes nothing
    expect((await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: next } }), deps)).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.settings' } })).toBe(1);
  });

  describe('AI drafts (PR 221)', () => {
    const S = MOTHER_STORE_ID;
    const ids: Record<string, string> = {};
    const drafts = (cookie: string, method = 'GET', rest = '', b?: unknown) => seoDraftsRoute(call(method, `/api/admin/seo/drafts${rest}`, { cookie, ...(b === undefined ? {} : { body: b }) }), deps, rest ? rest.slice(1).split('/') : []);
    type State = { aiOn: boolean; enabled: boolean; made?: number; filled?: string[]; waiting: { id: string; subject: string; entityId: string; locale: string; title: string; provider: string; mode: string; practice: boolean }[]; missing: { product: number; category: number } };
    let ownerId = '';

    beforeAll(async () => {
      const db = t.prisma;
      ownerId = (await db.staffUser.findFirstOrThrow({ where: { email: 'owner@example.com' } })).id;
      const g = await db.garmentType.create({ data: { storeId: S, key: 'seo-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
      ids.cat = (await db.category.create({ data: { storeId: S, slug: 'seo-polos', nameEn: 'Polos', nameBn: 'পোলো', isVisible: true, garmentTypeId: g.id } })).id;
      await db.category.create({ data: { storeId: S, slug: 'seo-hidden', nameEn: 'Hidden', isVisible: false, garmentTypeId: g.id } });
      const product = async (slug: string, status: 'PUBLISHED' | 'DRAFT') => (await db.product.create({ data: { storeId: S, slug, nameEn: `Sample ${slug}`, status, categoryId: ids.cat!, ...(status === 'PUBLISHED' ? { publishedAt: new Date(Date.UTC(2026, 9, 23)) } : {}) } })).id;
      ids.own = await product('seo-own', 'PUBLISHED');
      ids.open = await product('seo-open', 'PUBLISHED');
      ids.draft = await product('seo-draft', 'DRAFT');
      // the owner's own words for one product: never drafted
      await db.seoMeta.create({ data: { storeId: S, entityType: 'product', entityId: ids.own!, locale: 'en', title: 'Typed title', description: 'Typed words.' } });
      // English only until the last test turns Bengali on
      await deps.resolver.set('language.bengali.enabled', false, storeTarget(S), { actorId: ownerId, reason: 'test' });
    });

    it('is refused while AI for the shop or the drafts are off; reading needs seo.read, drafting seo.manage', async () => {
      const st = (await (await drafts(reader)).json()) as State;
      expect(st).toMatchObject({ aiOn: false, enabled: false, waiting: [], missing: { product: 1, category: 1 } });
      expect((await drafts(reader, 'POST')).status).toBe(403);
      const off = await drafts(owner, 'POST');
      expect(off.status).toBe(409);
      expect(await off.json()).toMatchObject({ error: 'AI_OFF' });
      await deps.resolver.set('seo.aiDrafts', { ...SEO_AI_DRAFTS_DEFAULT, enabled: true, batchMax: 5 }, storeTarget(S), { actorId: ownerId, reason: 'test' });
      expect((await drafts(owner, 'POST')).status).toBe(409); // AI for the whole shop is still off (CN-026)
      await deps.resolver.set('ai.enabled', true, INSTALLATION, { actorId: ownerId, reason: 'test' });
      expect(await t.prisma.aiApprovalRequest.count()).toBe(0);
    });

    it('drafts only pages without their own text, at most batchMax, once per page', async () => {
      await deps.resolver.set('seo.aiDrafts', { ...SEO_AI_DRAFTS_DEFAULT, enabled: true, batchMax: 1 }, storeTarget(S), { actorId: ownerId, reason: 'test' });
      let st = (await (await drafts(owner, 'POST')).json()) as State;
      expect(st.made).toBe(1);
      expect(st.waiting).toHaveLength(1);
      expect(st.waiting[0]).toMatchObject({ subject: 'product', entityId: ids.open, provider: 'mockAiWriter', mode: 'MOCK', practice: true });
      expect(st.waiting[0]!.title).toContain('Sample seo-open');
      await deps.resolver.set('seo.aiDrafts', { ...SEO_AI_DRAFTS_DEFAULT, enabled: true, batchMax: 5 }, storeTarget(S), { actorId: ownerId, reason: 'test' });
      st = (await (await drafts(owner, 'POST')).json()) as State;
      expect(st.made).toBe(1);
      expect(st.waiting.map((w) => w.subject).sort()).toEqual(['category', 'product']);
      expect(st.missing).toEqual({ product: 0, category: 0 });
      // nothing left: a page with a draft waiting is not drafted again; the own product, the draft one and the hidden
      // category never were
      st = (await (await drafts(owner, 'POST')).json()) as State;
      expect(st.made).toBe(0);
      const refs = (await t.prisma.aiApprovalRequest.findMany({ select: { refId: true } })).map((r) => r.refId);
      expect(refs).not.toContain(ids.own);
      expect(refs).not.toContain(ids.draft);
      expect(await t.prisma.auditLog.count({ where: { action: 'seo.drafts.create' } })).toBe(2);
    });

    it('accepting fills only empty fields and the product page shows it; a decision is taken once', async () => {
      const st = (await (await drafts(owner)).json()) as State;
      const p = st.waiting.find((w) => w.subject === 'product')!;
      // someone typed a title meanwhile: the draft only fills the description
      await t.prisma.seoMeta.create({ data: { storeId: S, entityType: 'product', entityId: ids.open!, locale: 'en', title: 'Typed meanwhile' } });
      expect((await drafts(reader, 'POST', `/${p.id}`, { decision: 'accept' })).status).toBe(403);
      expect((await drafts(owner, 'POST', `/${p.id}`, { decision: 'maybe' })).status).toBe(400);
      expect((await drafts(owner, 'POST', '/00000000-0000-7000-8000-000000000000', { decision: 'accept' })).status).toBe(404);
      const ok = (await (await drafts(owner, 'POST', `/${p.id}`, { decision: 'accept' })).json()) as State;
      expect(ok.filled).toEqual(['description']);
      const row = await t.prisma.seoMeta.findFirstOrThrow({ where: { entityType: 'product', entityId: ids.open!, locale: 'en' } });
      expect(row).toMatchObject({ title: 'Typed meanwhile', aiDrafted: true, approvedById: ownerId });
      expect(row.description).toBeTruthy();
      const texts = await productSeoTexts({ db: t.prisma, settings: deps.resolver }, S, ids.open!);
      expect(texts?.title.en).toMatchObject({ value: 'Typed meanwhile', source: 'own' });
      expect(texts?.description.en).toMatchObject({ value: row.description, source: 'own' });
      const again = await drafts(owner, 'POST', `/${p.id}`, { decision: 'discard' });
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ error: 'DECIDED' });
    });

    it('discarding keeps the row, and a category draft goes to its own page entry', async () => {
      const st = (await (await drafts(owner)).json()) as State;
      const c = st.waiting.find((w) => w.subject === 'category')!;
      const res = (await (await drafts(owner, 'POST', `/${c.id}`, { decision: 'discard' })).json()) as State;
      expect(res.waiting).toHaveLength(0);
      expect(await t.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'REJECTED', decidedById: ownerId });
      expect(await t.prisma.seoMeta.count({ where: { entityType: 'category' } })).toBe(0);
      // the category is missing its text again: a new draft, accepted, fills its page entry
      const made = (await (await drafts(owner, 'POST')).json()) as State;
      expect(made.made).toBe(1);
      const n = made.waiting[0]!;
      expect(((await (await drafts(owner, 'POST', `/${n.id}`, { decision: 'accept' })).json()) as State).filled).toEqual(['title', 'description']);
      expect(await t.prisma.seoMeta.findFirstOrThrow({ where: { entityType: 'category', entityId: ids.cat! } })).toMatchObject({ aiDrafted: true, locale: 'en' });
      expect(await t.prisma.auditLog.count({ where: { action: { in: ['seo.drafts.accept', 'seo.drafts.discard'] } } })).toBe(3);
    });

    it('with Bengali on, the Bengali pages get their own drafts', async () => {
      await deps.resolver.set('language.bengali.enabled', true, storeTarget(S), { actorId: ownerId, reason: 'test' });
      const st = (await (await drafts(owner, 'POST')).json()) as State;
      expect(st.made).toBe(3);
      expect(st.waiting.every((w) => w.locale === 'bn')).toBe(true);
      expect(st.waiting.map((w) => w.entityId).sort()).toEqual([ids.cat!, ids.open!, ids.own!].sort());
    });
  });
});
