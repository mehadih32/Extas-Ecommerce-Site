// PR 214 follow-up — Eid order-by dates on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), through the real
// settings resolver: who may read, save dates, switch it on and touch pre-order (the owner's OK, CLAUDE.md rule 6),
// the checks before switching on, the settings change log and the audit log, the other store untouched, and what the
// storefront reads (SIM-F-019 per band, SIM-F-033 nothing by default). Every date and amount is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { getEidScreen, saveEidDates, setEidEnabled, setEidPreorder, storefrontEid, type EidDeps, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00+06:00`);

describe.skipIf(!HAS_TEST_DB)('Eid order-by dates on PostgreSQL (PR 214 follow-up)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let clock = at('2027-03-01');
  let settings: SettingsResolver<typeof registry>;
  const deps = (): EidDeps => ({ db: t.prisma, settings, now: () => clock });
  let reader: Actor;
  let writer: Actor;
  let publisher: Actor;
  let owner: Actor;
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  const dates = {
    eidDate: '2027-03-10',
    bandDates: [
      { band: 'dhaka-city', orderBy: '2027-03-06' },
      { band: 'outside-dhaka', orderBy: '2027-03-03' },
    ],
    districtDates: [{ district: 'bd.sample.far', orderBy: '2027-03-01' }],
  };

  beforeAll(async () => {
    t = await createTestDatabase('eid');
    [A, B] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    settings = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    const staff = async (email: string, perms: ('rules.read' | 'rules.write' | 'rules.publish' | 'rules.approve')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    reader = await staff('eid-reader@example.com', ['rules.read']);
    writer = await staff('eid-writer@example.com', ['rules.read', 'rules.write']);
    publisher = await staff('eid-publisher@example.com', ['rules.read', 'rules.write', 'rules.publish']);
    owner = await staff('eid-approver@example.com', ['rules.read', 'rules.write', 'rules.publish', 'rules.approve']);
    for (const [i, key] of ['dhaka-city', 'outside-dhaka'].entries()) {
      await t.prisma.deliveryBand.create({ data: { storeId: A, key, nameEn: key === 'dhaka-city' ? 'Dhaka city' : 'Outside Dhaka', nameBn: key === 'dhaka-city' ? 'ঢাকা শহর' : 'ঢাকার বাইরে', chargeMinor: 0, sortOrder: i } });
    }
    await t.prisma.geoArea.create({ data: { level: 'DISTRICT', code: 'bd.sample.far', nameEn: 'Sample far district', aliases: [], postcodes: [], ancestorIds: [] } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('a new installation: off, empty, and the storefront says nothing (SIM-F-033)', async () => {
    const s = await getEidScreen(deps(), as(reader));
    expect(s.config).toMatchObject({ enabled: false, eidDate: null, bandDates: null, districtDates: null, preorderEnabled: null, preorderAdvanceMinor: null });
    expect(s.issues).toEqual(expect.arrayContaining(['EID_DATE_MISSING', 'NO_DATES']));
    expect(s.bands.map((b) => b.key)).toEqual(['dhaka-city', 'outside-dhaka']);
    expect(s.districts.map((d) => d.code)).toContain('bd.sample.far');
    expect(s.perms).toEqual({ write: false, publish: false, approve: false });
    expect(await storefrontEid(deps(), A, { place: { band: 'dhaka-city' }, totalMinor: 200000 })).toEqual({ banner: null, status: { state: 'off' }, late: null, preorder: null });
  });

  it('each step needs its own permission', async () => {
    expect(await code(saveEidDates(deps(), as(reader), dates))).toBe('FORBIDDEN');
    expect(await code(setEidEnabled(deps(), as(writer), { enabled: true }))).toBe('FORBIDDEN');
    expect(await code(setEidPreorder(deps(), as(publisher), { preorderEnabled: true, preorderAdvanceMinor: 50000 }))).toBe('OWNER_OK_REQUIRED');
    expect(await code(getEidScreen(deps(), as(reader, B)))).toBe('FORBIDDEN');
    // Nothing was written by the refused calls.
    expect(await settings.value('rules.eid.preorder.advanceMinor', { storeId: A })).toBeNull();
  });

  it('cannot be switched on before the dates exist', async () => {
    expect(await code(setEidEnabled(deps(), as(publisher), { enabled: true }))).toBe('EID_INVALID');
    expect(await settings.value('rules.eid.enabled', { storeId: A })).toBe(false);
  });

  it('refuses a band or district the store does not know, and a broken date', async () => {
    expect(await code(saveEidDates(deps(), as(writer), { bandDates: [{ band: 'moon', orderBy: '2027-03-06' }] }))).toBe('INVALID_INPUT');
    expect(await code(saveEidDates(deps(), as(writer), { districtDates: [{ district: 'bd.sample.none', orderBy: '2027-03-06' }] }))).toBe('INVALID_INPUT');
    expect(await code(saveEidDates(deps(), as(writer), { eidDate: '2027-02-30' }))).toBe('INVALID_INPUT');
    expect(await code(saveEidDates(deps(), as(writer), { cutoffTime: '25:00' }))).toBe('INVALID_INPUT');
    expect(await code(saveEidDates(deps(), as(writer), { showDaysBefore: 0 }))).toBe('INVALID_INPUT');
  });

  it('saves dates through the settings (change log with who) and the audit log, in this store only', async () => {
    const s = await saveEidDates(deps(), as(writer), dates);
    expect(s.config).toMatchObject(dates);
    expect(s.issues).toEqual([]);
    expect(await settings.value('rules.eid.eidDate', { storeId: B })).toBeNull();
    const changes = await t.prisma.settingChange.findMany({ where: { key: 'rules.eid.bandDates' } });
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.at(-1)!.actorId).toBe(writer.staffUserId);
    expect(await t.prisma.auditLog.count({ where: { action: 'rules.eid.save', storeId: A } })).toBe(1);
    // Saving the same again changes nothing and logs nothing.
    await saveEidDates(deps(), as(writer), dates);
    expect(await t.prisma.auditLog.count({ where: { action: 'rules.eid.save', storeId: A } })).toBe(1);
  });

  it('switched on, the storefront promises each band its date, then "may arrive after Eid" (SIM-F-019)', async () => {
    await setEidEnabled(deps(), as(publisher), { enabled: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'rules.eid.on', storeId: A } })).toBe(1);

    clock = at('2027-03-03', '10:00');
    const open = await storefrontEid(deps(), A, { place: { band: 'outside-dhaka' }, locale: 'en-BD' });
    expect(open.status).toMatchObject({ state: 'open', orderBy: '2027-03-03', daysLeft: 0 });
    expect(open.late).toBeNull();
    expect(open.banner).toHaveLength(2);
    expect(open.banner![0]).toContain('Dhaka city');
    const bnOpen = await storefrontEid(deps(), A, { locale: 'bn-BD' });
    expect(bnOpen.banner![0]).toContain('ঢাকা শহর');

    clock = at('2027-03-04', '00:00');
    const closed = await storefrontEid(deps(), A, { place: { band: 'outside-dhaka' }, totalMinor: 200000, locale: 'en-BD' });
    expect(closed.status).toMatchObject({ state: 'closed', preorder: null });
    expect(closed.late).toContain('after Eid');
    expect(closed.preorder).toBeNull();
    expect(closed.banner).toHaveLength(1); // only Dhaka city is still open
    const city = await storefrontEid(deps(), A, { place: { band: 'dhaka-city' } });
    expect(city.status).toMatchObject({ state: 'open', daysLeft: 2 });

    // The far district's own date wins over its band's.
    const far = await storefrontEid(deps(), A, { place: { band: 'dhaka-city', district: 'bd.sample.far' } });
    expect(far.status).toMatchObject({ state: 'closed', source: 'district' });
  });

  it('while on, a save that would break it is refused; switch off first', async () => {
    expect(await code(saveEidDates(deps(), as(writer), { eidDate: null }))).toBe('EID_INVALID');
    expect(await code(saveEidDates(deps(), as(writer), { bannerText: { en: 'Order soon', bn: 'তাড়াতাড়ি' } }))).toBe('EID_INVALID');
    expect(await settings.value('rules.eid.eidDate', { storeId: A })).toBe('2027-03-10');
  });

  it("pre-order only with the owner's OK and an advance; the checkout line says the amount due", async () => {
    expect(await code(setEidPreorder(deps(), as(owner), { preorderEnabled: true }))).toBe('EID_INVALID');
    expect(await code(setEidPreorder(deps(), as(owner), { preorderAdvanceMinor: 0 }))).toBe('INVALID_INPUT');
    const s = await setEidPreorder(deps(), as(owner), { preorderEnabled: true, preorderAdvanceMinor: 50000 });
    expect(s.config).toMatchObject({ preorderEnabled: true, preorderAdvanceMinor: 50000 });
    expect(await t.prisma.auditLog.count({ where: { action: 'rules.eid.preorder', storeId: A } })).toBe(1);

    clock = at('2027-03-08');
    const r = await storefrontEid(deps(), A, { place: { band: 'dhaka-city' }, totalMinor: 200000, locale: 'en-BD' });
    expect(r.status).toMatchObject({ state: 'closed', preorder: { advanceMinor: 50000, dueMinor: 150000 } });
    expect(r.preorder).toMatch(/500/);
    expect(r.preorder).toMatch(/1,500/);
    expect(r.preorder).not.toMatch(/2,000/);
    expect(r.banner).toHaveLength(1);
    expect(r.banner![0]).toMatch(/500/);

    // A percentage advance (CN-018 answer 6): needs its percentage, then takes that share of the total.
    expect(await code(setEidPreorder(deps(), as(owner), { preorderAdvanceType: 'percent' }))).toBe('EID_INVALID');
    await setEidPreorder(deps(), as(owner), { preorderAdvanceType: 'percent', preorderAdvancePercent: 30 });
    const pct = await storefrontEid(deps(), A, { place: { band: 'dhaka-city' }, totalMinor: 200000, locale: 'en-BD' });
    expect(pct.status).toMatchObject({ state: 'closed', preorder: { advanceMinor: 60000, percent: 30, dueMinor: 140000 } });
    expect(pct.preorder).toMatch(/600/);
    expect(pct.preorder).toMatch(/1,400/);
    expect(pct.banner![0]).toMatch(/30\s?%/);
    expect(await code(setEidPreorder(deps(), as(publisher), { preorderAdvancePercent: 90 }))).toBe('OWNER_OK_REQUIRED');

    // Switched back off by the owner: nothing offered again.
    await setEidPreorder(deps(), as(owner), { preorderEnabled: false });
    expect((await storefrontEid(deps(), A, { place: { band: 'dhaka-city' }, totalMinor: 200000 })).preorder).toBeNull();
  });

  it('after Eid day everything stops by itself; switching off is logged', async () => {
    clock = at('2027-03-11');
    expect(await storefrontEid(deps(), A, { place: { band: 'dhaka-city' } })).toEqual({ banner: null, status: { state: 'off' }, late: null, preorder: null });
    await setEidEnabled(deps(), as(publisher), { enabled: false });
    expect(await t.prisma.auditLog.count({ where: { action: 'rules.eid.off', storeId: A } })).toBe(1);
    // Off, a list emptied in the admin is stored as "not set".
    const s = await saveEidDates(deps(), as(writer), { districtDates: [] });
    expect(s.config.districtDates).toBeNull();
  });
});
