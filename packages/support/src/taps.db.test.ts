// PR 624 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): taps on the shop's support buttons. Off as it
// ships, nothing is counted; with the Messenger button and its counting on, each tap adds one to its shop day, channel
// and place (many at once are all counted), a bad tap is dropped, the report sums the last days per channel and place
// for `support.read` only, and the Page is saved as its bare name from any address. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { registry, type Key, type Value } from '@extas/settings';
import { recordSupportTap, saveSupportSetting, supportSettingsView, supportTaps, SupportError, type SupportDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 624 · support button taps (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  let nobody: Who;
  const overrides = new Map<string, unknown>();
  // Sunday 1 Nov 2026, 23:30 in Dhaka (17:30 UTC): still 1 Nov in the shop, though the next tap is the 2nd
  let clock = new Date('2026-11-01T17:30:00Z').getTime();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'store.timeZone') return 'Asia/Dhaka' as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
    async set(key: string, value: unknown) {
      overrides.set(key, value);
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => new Date(clock) });
  const ON = { ...registry['support.messengerButton'].default, enabled: true };

  beforeAll(async () => {
    t = await createTestDatabase('support_taps');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't624-owner', nameEn: 'owner', nameBn: 'owner', permissions: ['support.read', 'support.settings'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't624-owner@example.com', displayName: 'Sample owner', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    who = { actor: { staffUserId: u.id }, storeId: S };
    const v = await t.prisma.staffUser.create({ data: { email: 't624-none@example.com', displayName: 'Sample nobody', passwordHash: 'not-a-login' } });
    nobody = { actor: { staffUserId: v.id }, storeId: S };
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('off as it ships: nothing is counted', async () => {
    expect(await recordSupportTap(deps(), S, { ch: 'messenger', place: 'header' })).toBe(false);
    expect(await t.prisma.supportChannelTap.count()).toBe(0);
  });

  it('on: each tap adds one to its shop day, channel and place; many at once are all counted; bad taps are dropped', async () => {
    overrides.set('support.messengerButton', ON);
    const taps = await Promise.all(Array.from({ length: 12 }, () => recordSupportTap(deps(), S, { ch: 'messenger', place: 'product' })));
    expect(taps.every(Boolean)).toBe(true);
    expect(await recordSupportTap(deps(), S, { ch: 'whatsapp', place: 'header' })).toBe(true);
    for (const bad of [{ ch: 'telegram', place: 'header' }, { ch: 'messenger', place: 'footer' }, { ch: 'messenger' }, { ch: 'messenger', place: 'header', who: 'x' }, null, 'messenger'])
      expect(await recordSupportTap(deps(), S, bad)).toBe(false);
    expect(await recordSupportTap(deps(), 0, { ch: 'messenger', place: 'header' })).toBe(false);
    const rows = await t.prisma.supportChannelTap.findMany({ orderBy: { count: 'desc' } });
    expect(rows.map((r) => [r.day.toISOString().slice(0, 10), r.channel, r.place, r.count])).toEqual([
      ['2026-11-01', 'messenger', 'product', 12],
      ['2026-11-01', 'whatsapp', 'header', 1],
    ]);
    clock += 60 * 60_000; // 00:30 on 2 Nov in Dhaka
    await recordSupportTap(deps(), S, { ch: 'call', place: 'contact' });
    expect(await t.prisma.supportChannelTap.count({ where: { day: new Date('2026-11-02T00:00:00Z') } })).toBe(1);
  });

  it('counting off keeps the button but counts nothing', async () => {
    overrides.set('support.messengerButton', { ...ON, countTaps: false });
    expect(await recordSupportTap(deps(), S, { ch: 'messenger', place: 'order' })).toBe(false);
    expect(await t.prisma.supportChannelTap.count({ where: { place: 'order' } })).toBe(0);
    overrides.set('support.messengerButton', ON);
  });

  it('the report sums the last days per channel and place, the most tapped place first; support.read only', async () => {
    await t.prisma.supportChannelTap.create({ data: { storeId: S, day: new Date('2026-09-01T00:00:00Z'), channel: 'messenger', place: 'header', count: 50 } });
    const r = await supportTaps(deps(), who);
    expect(r).toMatchObject({ from: '2026-10-04', to: '2026-11-02', days: 30, counting: true, total: { messenger: 12, whatsapp: 1, call: 1, total: 14 } });
    expect(r.byPlace.map((p) => [p.place, p.total])).toEqual([
      ['product', 12],
      ['header', 1],
      ['contact', 1],
    ]);
    expect((await supportTaps(deps(), who, { days: 90 })).total.messenger).toBe(62);
    await expect(supportTaps(deps(), who, { days: 0 })).rejects.toBeInstanceOf(SupportError);
    await expect(supportTaps(deps(), nobody)).rejects.toThrow();
  });

  it('the Page card: any address saved as the bare name, empty clears it, a wrong one is refused', async () => {
    const save = (page: string, version?: string) => saveSupportSetting(deps() as never, who, { key: 'contact.messenger', value: { page }, version });
    const v0 = await supportSettingsView(deps(), who);
    expect(v0['contact.messenger'].value).toEqual({ page: '' });
    expect(v0['support.messengerButton'].value.enabled).toBe(true);
    const v1 = await save('https://www.facebook.com/extas.sample/', v0['contact.messenger'].version);
    expect(overrides.get('contact.messenger')).toBe('extas.sample');
    expect(v1['contact.messenger'].value).toEqual({ page: 'extas.sample' });
    await expect(save('https://evil.example/x')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(save('', v0['contact.messenger'].version)).rejects.toMatchObject({ code: 'STALE' });
    await save('', v1['contact.messenger'].version);
    expect(overrides.get('contact.messenger')).toBeNull();
  });
});
