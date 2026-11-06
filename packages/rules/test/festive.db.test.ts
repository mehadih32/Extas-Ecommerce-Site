// S13 · PR 281 — festive cut-off words on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), through the real
// settings resolver and a festive rule made from the PR 214 template and switched on: nothing while Marketing ›
// Festive cut-off is off (as shipped) or the place unticked; on, the home and product pages get the short words before
// the times and the "after" words once every band passed; checkout gets, for its band only, the "after" words in place
// of the usual promise (SIM-F-019), also on the thank-you page by the order's own time (the store speaks Bengali unless
// asked otherwise). The dates are test values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { checkoutEta, createRule, festiveAfterCheck, festiveFor, publishRule, saveDraft, type RulesDeps, type Who } from '../src';

const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00+06:00`);

describe.skipIf(!HAS_TEST_DB)('Festive cut-off words on PostgreSQL (PR 281)', () => {
  let t: TestDatabase;
  let A = 0;
  let clock = at('2027-03-01');
  let settings: SettingsResolver<typeof registry>;
  const deps = (): RulesDeps => ({ db: t.prisma, settings, now: () => clock });
  let publisher: Actor;
  const as = (actor: Actor): Who => ({ actor, storeId: A });
  const turn = (value: unknown) => settings.set('marketing.festiveCutoff', value as never, storeTarget(A), { actorId: null, reason: 'test' });

  beforeAll(async () => {
    t = await createTestDatabase('festive');
    [A] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    settings = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    const role = await createRole(t.prisma, SYSTEM, { key: 'festive-pub', nameEn: 'p', nameBn: 'p', permissions: ['rules.read', 'rules.write', 'rules.publish'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'festive@example.com', displayName: 'p', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
    publisher = { staffUserId: u.id };
    // the PR 214 template with the owner's (test) times: Dhaka city 6 Mar, outside Dhaka 3 Mar, switched on
    const r = await createRule(deps(), as(publisher), { templateId: 'festive' });
    const times: Record<string, string> = { cutoffDhakaCity: '2027-03-06T23:59:00+06:00', cutoffOutsideDhaka: '2027-03-03T23:59:00+06:00' };
    const params = r.live!.params.map((p) => (times[p.key] ? { ...p, value: times[p.key] } : p));
    await saveDraft(deps(), as(publisher), r.id, { content: { ...r.live!, params, status: 'ACTIVE' } });
    await publishRule(deps(), as(publisher), r.id);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('off as shipped: nothing on any place, and checkout keeps its usual promise', async () => {
    expect(await festiveFor(deps(), A, { place: 'home' })).toEqual([]);
    expect(await festiveFor(deps(), A, { place: 'product' })).toEqual([]);
    expect((await checkoutEta(deps(), A, { place: { band: 'outside-dhaka', areaId: null }, at: at('2027-03-05') })).lines).toEqual([]);
  });

  it('on: the short words before the times, the after words once every band passed; an unticked place stays empty', async () => {
    await turn({ enabled: true, places: { home: true, product: false, checkout: true }, title: null, linkHref: null, linkLabel: null });
    const [home] = await festiveFor(deps(), A, { place: 'home', locale: 'en-BD' });
    expect(home).toMatchObject({ key: 'festive', state: 'open', name: 'Festival delivery cut-off' });
    expect(home!.text).toMatch(/^Order by .+ for delivery before the festival \(inside Dhaka\)$/);
    expect((await festiveFor(deps(), A, { place: 'home', locale: 'bn-BD' }))[0]!.text).toContain('উৎসবের আগে পেতে');
    expect(await festiveFor(deps(), A, { place: 'product' })).toEqual([]);
    clock = at('2027-03-08');
    expect((await festiveFor(deps(), A, { place: 'home', locale: 'en-BD' })).map((l) => [l.state, l.text])).toEqual([['closed', 'Orders placed now arrive after the festival.']]);
  });

  it('checkout: only the settled band past its time gets the after words instead of the promise (and the thank-you page by the order time)', async () => {
    clock = at('2027-03-05');
    expect((await checkoutEta(deps(), A, { place: { band: 'outside-dhaka', areaId: null }, locale: 'en-BD' })).lines).toEqual(['Orders placed now arrive after the festival.']);
    expect((await checkoutEta(deps(), A, { place: { band: 'dhaka-city', areaId: null } })).lines).toEqual([]);
    expect((await checkoutEta(deps(), A, { place: null })).lines).toEqual([]);
    // the thank-you page reads by when the order was placed: before the time, the usual promise
    expect((await checkoutEta(deps(), A, { place: { band: 'outside-dhaka', areaId: null }, at: at('2027-03-02') })).lines).toEqual([]);
    await turn({ enabled: true, places: { home: true, product: false, checkout: false }, title: null, linkHref: null, linkLabel: null });
    expect((await checkoutEta(deps(), A, { place: { band: 'outside-dhaka', areaId: null } })).lines).toEqual([]);
  });

  it('the product page: the line for a product the rule covers (the template covers every product)', async () => {
    clock = at('2027-03-05');
    await turn({ enabled: true, places: { home: false, product: true, checkout: false }, title: null, linkHref: null, linkLabel: null });
    const cat = await t.prisma.category.create({ data: { storeId: A, slug: 'festive-tops', nameEn: 'Sample tops' } });
    const p = await t.prisma.product.create({ data: { storeId: A, slug: 'festive-sample', nameEn: 'Sample panjabi', categoryId: cat.id } });
    expect((await festiveFor(deps(), A, { place: 'product', productId: p.id })).map((l) => l.state)).toEqual(['open']);
  });

  it('follow-up 653: the promise clock\'s check says the same as the checkout — after words for that band past its time, only while checkout is ticked', async () => {
    await turn({ enabled: false, places: { home: true, product: true, checkout: true }, title: null, linkHref: null, linkLabel: null });
    expect((await festiveAfterCheck(deps(), A))('outside-dhaka', at('2027-03-05'))).toBe(false);
    await turn({ enabled: true, places: { home: false, product: false, checkout: true }, title: null, linkHref: null, linkLabel: null });
    const after = await festiveAfterCheck(deps(), A);
    for (const [band, day] of [['outside-dhaka', '2027-03-05'], ['outside-dhaka', '2027-03-02'], ['dhaka-city', '2027-03-05'], ['dhaka-city', '2027-03-08']] as const) {
      const said = (await checkoutEta(deps(), A, { place: { band, areaId: null }, at: at(day) })).lines.length > 0;
      expect(after(band, at(day))).toBe(said);
    }
    expect(after('outside-dhaka', at('2027-03-05'))).toBe(true);
    expect(after('outside-dhaka', at('2027-03-02'))).toBe(false);
    await turn({ enabled: true, places: { home: true, product: true, checkout: false }, title: null, linkHref: null, linkLabel: null });
    expect((await festiveAfterCheck(deps(), A))('outside-dhaka', at('2027-03-05'))).toBe(false);
  });
});
