// S03 · PR 90, 571 — the combo admin API end to end on a real PostgreSQL (a throwaway database with the sample
// catalogue; skipped without TEST_DATABASE_ADMIN_URL): login and same-site checks, a new fixed combo as a draft, the
// live preview, changing it, the card's price box, switches, switching on and off, and the path table's refusals; then
// an auto colour-pair rule: the wizard's live count, a draft, switching it on, dates, options, "add 1 more", its
// pairs, and the shop's default templates.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { combosRoute } from './combos-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('combo admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const ids: Record<string, string> = {};
  const api = async (method: string, path: string[], body?: unknown, cookie = owner, d: AdminDeps | null = deps) => {
    const res = await combosRoute(call(method, `/api/admin/combos/${path.join('/')}`, { body, cookie }), d, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('combos_api');
    await seedSample(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    for (const p of await t.prisma.product.findMany({ select: { id: true, slug: true } })) ids[p.slug] = p.id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login, a database and a same-site request; unknown paths and methods are refused', async () => {
    expect((await api('GET', [], undefined, '')).status).toBe(401);
    expect((await api('GET', [], undefined, owner, null)).status).toBe(503);
    const evil = await combosRoute(call('POST', '/api/admin/combos', { cookie: owner, origin: 'https://evil.example.test', body: { combo: {} } }), deps, []);
    expect(evil.status).toBe(403);
    expect((await api('PUT', [])).status).toBe(405);
    expect((await api('GET', ['preview'])).status).toBe(405);
    expect((await api('GET', ['not-a-uuid'])).status).toBe(404);
    expect((await api('GET', ['a', 'b', 'c'])).status).toBe(404);
    expect((await combosRoute(call('GET', '/api/admin/combos?storeId=0', { cookie: owner }), deps, [])).status).toBe(400);
  });

  it('a fixed combo: preview, a draft, change it, the price box, the switches, on and off', async () => {
    const combo = { slug: 'api-polo-chino', nameEn: 'API polo and chino', type: 'TOP_BOTTOM', items: [{ productId: ids['essential-pique-polo'] }, { productId: ids['slim-chino-trousers'] }], setPriceMinor: 1000 };
    const pv = await api('POST', ['preview'], { combo });
    expect(pv.status).toBe(200);
    expect(pv.body.combo.pricing.reason).toBe('OFFER');
    expect(await t.prisma.combo.count({ where: { slug: combo.slug } })).toBe(0);

    const made = await api('POST', [], { combo });
    expect(made.status).toBe(201);
    const id = made.body.combo.id as string;
    expect(made.body.combo.state).toBe('draft');
    expect((await api('POST', [], { combo })).body.error).toBe('SLUG_TAKEN');
    expect((await api('POST', [], { combo: { ...combo, slug: 'Bad Slug' } })).body.error).toBe('INVALID_INPUT');

    const changed = await api('PUT', [id], { combo: { ...combo, nameEn: 'API polo and chino set' }, version: made.body.combo.version });
    expect(changed.body.combo.nameEn).toBe('API polo and chino set');
    expect((await api('PUT', [id], { combo, version: made.body.combo.version })).body.error).toBe('STALE');

    const priced = await api('POST', [id, 'price'], { setPriceMinor: 99999999, version: changed.body.combo.version });
    expect(priced.body.combo.pricing.reason).toBe('NOT_LOWER');
    expect((await api('POST', [id, 'flags'], { autoApply: true })).body.combo.autoApply).toBe(true);
    expect((await api('POST', [id, 'active'], {})).body.error).toBe('INVALID_INPUT');
    const on = await api('POST', [id, 'active'], { on: true });
    expect(on.body.combo.state).toBe('live');
    const off = await api('POST', [id, 'active'], { on: false });
    expect(off.body.combo.state).toBe('off');
    expect(await t.prisma.combo.count({ where: { id } })).toBe(1);

    const list = await api('GET', []);
    expect(list.body.combos.map((c: { slug: string }) => c.slug)).toContain(combo.slug);
    expect((await api('GET', [id])).body.combo.id).toBe(id);
    expect(await t.prisma.auditLog.count({ where: { entityId: id } })).toBeGreaterThan(3);
    // PR 575 — the set photo needs every piece's photo in its colour (the sample products have none yet)
    const ph = await api('POST', [id, 'photo'], {});
    expect(ph.status).toBe(409);
    expect(ph.body).toMatchObject({ ok: false, error: 'NO_PIECE_PHOTO', details: ['1', '2'] });
    expect((await api('GET', [id, 'photo'])).status).toBe(405);
  });

  it('PR 571 — an auto rule: live count, a draft, on, dates, options, add 1 more, its pairs, the shop templates', async () => {
    const rule = { key: 'api-polo-2', nameEn: 'API polo pairs', productIds: [ids['essential-pique-polo'], ids['contrast-collar-polo']], pieces: 2, pairing: 'STYLE', priceMode: 'PERCENT', percentOff: 10 };
    const pv = await api('POST', ['rules', 'preview'], { rule });
    expect(pv.status).toBe(200);
    expect(pv.body.preview.counts.made).toBeGreaterThan(0);
    expect(await t.prisma.comboAutoRule.count({ where: { key: rule.key } })).toBe(0);
    expect((await api('GET', ['rules', 'preview'])).status).toBe(405);

    const made = await api('POST', ['rules'], { rule });
    expect(made.status).toBe(201);
    const r = made.body.rule;
    expect(r.state).toBe('draft');
    expect(r.counts.made).toBe(pv.body.preview.counts.made);
    expect((await api('POST', ['rules'], { rule })).body.error).toBe('SLUG_TAKEN');
    expect((await api('PUT', ['rules', r.id], { rule: { ...rule, key: 'api-other' }, version: r.version })).body.error).toBe('KEY_FIXED');

    expect((await api('POST', ['rules', r.id, 'active'], {})).body.error).toBe('INVALID_INPUT');
    const on = await api('POST', ['rules', r.id, 'active'], { on: true });
    expect(on.body.rule.state).toBe('live');
    const dated = await api('POST', ['rules', r.id, 'dates'], { startsOn: '2099-01-01', endsOn: null });
    expect(dated.body.rule.state).toBe('soon');
    expect((await api('POST', ['rules', r.id, 'dates'], { startsOn: null, endsOn: null })).body.rule.state).toBe('live');
    expect((await api('POST', ['rules', r.id, 'options'], { noSinglePiece: false })).body.rule.noSinglePiece).toBe(false);
    const up = await api('POST', ['rules', r.id, 'upsell'], { on: true, nameEn: 'API polo pairs + 1' });
    expect(up.body.rule.addOneMore).toBe(true);
    expect(up.body.rule.upsell.key).toBe('api-polo-2-3');

    const pairs = await api('GET', ['rules', r.id, 'pairs']);
    expect(pairs.body.pairs).toHaveLength(r.counts.made);
    expect((await api('GET', ['rules', r.id])).body.rule.id).toBe(r.id);
    expect((await api('GET', ['rules'])).body.rules.map((x: { key: string }) => x.key)).toEqual(expect.arrayContaining(['api-polo-2', 'api-polo-2-3']));
    expect((await api('GET', ['rules', 'not-a-uuid'])).status).toBe(404);

    const off = await api('POST', ['rules', r.id, 'active'], { on: false });
    expect(off.body.rule.state).toBe('off');
    expect(await t.prisma.combo.count({ where: { autoRuleId: r.id } })).toBe(r.counts.made);

    expect((await api('GET', ['templates'])).body.templates).toMatchObject({ list: expect.any(String), page: expect.any(String), bag: expect.any(String) });
    const tpl = await api('POST', ['templates'], { list: 'L2' });
    expect(tpl.body).toMatchObject({ templates: { list: 'L2' } });
    expect((await api('POST', ['templates'], { list: 'NOPE' })).status).toBe(400);

    // PR 99 — the set tiers come from Smart Rules (none in the sample store yet): read only here
    expect((await api('GET', ['tiers'])).body).toMatchObject({ ok: true, tiers: [] });
    expect((await api('POST', ['tiers'], {})).status).toBe(405);
    expect((await api('GET', ['tiers', 'x'])).status).toBe(404);

    // PR 104 — the combo report (nothing sold in the sample store yet)
    const rep = await api('GET', ['report']);
    expect(rep.body).toMatchObject({ ok: true, report: { totals: { setsOrdered: 0, orderedMinor: 0, salesMinor: 0 }, top: expect.any(Array), pairs: expect.any(Array) } });
    expect(rep.body.report.series).toHaveLength(rep.body.report.days);
    expect((await api('POST', ['report'], {})).status).toBe(405);
    expect((await api('GET', ['report', 'x'])).status).toBe(404);
  });
});
