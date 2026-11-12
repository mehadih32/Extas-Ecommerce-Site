// S23 · PR 442 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): auto-schedule rules — add, edit,
// switch on/off, archive/restore, never deleted, and the unknown-reference guards.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { saveStudioAccount } from './accounts';
import type { StudioDeps, Who } from './context';
import { saveScheduleRule, scheduleRules } from './schedule';

describe.skipIf(!HAS_TEST_DB)('PR 442 · auto-schedule rules (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  let reader: Who;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const sd = (): StudioDeps => ({ db: t.prisma, settings });

  const makeCategory = (slug: string) => t.prisma.category.create({ data: { storeId: S, slug, nameEn: slug } });

  beforeAll(async () => {
    t = await createTestDatabase('studio_schedule');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('studio.read' | 'studio.write')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    who = await staff('t442-rule', ['studio.read', 'studio.write']);
    reader = await staff('t442-rule-reader', ['studio.read']);
  });

  afterAll(async () => t.drop());

  it('adds a rule off by default, lists it, switches it on, edits its cadence, then archives and restores it', async () => {
    const cat = await makeCategory('t-shirts-442');
    const made = await saveScheduleRule(sd(), who, { action: 'add', cadence: { postsPerDay: 3, reelsPerDay: 1, activeWeekdays: [0, 3, 5] }, categoryIds: [cat.id] });
    expect(made.enabled).toBe(false);
    expect(made.archived).toBe(false);
    expect(made.cadence).toEqual({ postsPerDay: 3, reelsPerDay: 1, activeWeekdays: [0, 3, 5] });
    expect(made.nextActiveDay).toBeNull(); // not enabled yet — no preview until it is on

    const list = await scheduleRules(sd(), reader);
    expect(list.some((r) => r.id === made.id)).toBe(true);

    const on = await saveScheduleRule(sd(), who, { action: 'switch', id: made.id, enabled: true, version: made.version });
    expect(on.enabled).toBe(true);
    expect(on.nextActiveDay).not.toBeNull();

    const edited = await saveScheduleRule(sd(), who, { action: 'edit', id: made.id, cadence: { postsPerDay: 5, reelsPerDay: 0, activeWeekdays: [] }, categoryIds: [], version: on.version });
    expect(edited.cadence.postsPerDay).toBe(5);
    expect(edited.categoryIds).toEqual([]);
    expect(edited.nextActiveDay).toBeNull(); // no weekday left active

    const archived = await saveScheduleRule(sd(), who, { action: 'archive', id: made.id, archived: true, version: edited.version });
    expect(archived.archived).toBe(true);
    expect(archived.enabled).toBe(false); // archiving also switches a rule off, the same as an account (PR 437)

    const restored = await saveScheduleRule(sd(), who, { action: 'archive', id: made.id, archived: false, version: archived.version });
    expect(restored.archived).toBe(false);
  });

  it('refuses an account or a category not in this store, and a stale save', async () => {
    await expect(saveScheduleRule(sd(), who, { action: 'add', accountId: '00000000-0000-0000-0000-000000000000', cadence: { postsPerDay: 1, reelsPerDay: 0, activeWeekdays: [] }, categoryIds: [] })).rejects.toMatchObject({ code: 'NOT_FOUND', details: ['accountId'] });
    await expect(saveScheduleRule(sd(), who, { action: 'add', cadence: { postsPerDay: 1, reelsPerDay: 0, activeWeekdays: [] }, categoryIds: ['00000000-0000-0000-0000-000000000000'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-442-rule', name: 'Rule page' });
    const made = await saveScheduleRule(sd(), who, { action: 'add', accountId: acc.id, cadence: { postsPerDay: 1, reelsPerDay: 0, activeWeekdays: [] }, categoryIds: [] });
    expect(made.accountId).toBe(acc.id);
    await expect(saveScheduleRule(sd(), who, { action: 'switch', id: made.id, enabled: true, version: 'not-the-real-version' })).rejects.toMatchObject({ code: 'STALE' });
  });

  it('only `studio.write` may add or change a rule; `studio.read` alone may only list', async () => {
    await expect(saveScheduleRule(sd(), reader, { action: 'add', cadence: { postsPerDay: 1, reelsPerDay: 0, activeWeekdays: [] }, categoryIds: [] })).rejects.toThrow();
  });
});
