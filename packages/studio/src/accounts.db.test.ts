// S23 · PR 437 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the studio's social accounts. Added
// off and needing approval, a store's own, never deleted, every change audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { saveStudioAccount, StudioError, studioAccounts, type StudioDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 437 · studio social accounts (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  let reader: Who;
  let nobody: Who;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): StudioDeps => ({ db: t.prisma, settings });

  beforeAll(async () => {
    t = await createTestDatabase('studio_accounts');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('studio.read' | 'studio.write')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    who = await staff('t437-writer', ['studio.read', 'studio.write']);
    reader = await staff('t437-reader', ['studio.read']);
    nobody = await staff('t437-none', []);
  });

  afterAll(async () => t.drop());

  it('adds an account off and needing approval; refuses the same platform + page id twice', async () => {
    const d = deps();
    const a = await saveStudioAccount(d, who, { action: 'add', platform: 'facebook', externalId: 'page-1', name: 'EXTAS Page' });
    expect(a.enabled).toBe(false);
    expect(a.requireApproval).toBe(true);
    expect(a.directPostApproved).toBe(false);
    expect(a.dailyLimit).toBeNull();
    await expect(saveStudioAccount(d, who, { action: 'add', platform: 'facebook', externalId: 'page-1', name: 'again' })).rejects.toMatchObject({ code: 'ALREADY_ADDED' });
    const b = await saveStudioAccount(d, who, { action: 'add', platform: 'instagram', externalId: 'page-1', name: 'EXTAS IG' });
    expect(b.id).not.toBe(a.id); // the same page id is fine on a different platform
  });

  it('switches, renames, sets a daily limit, archives and restores; never deletes a row', async () => {
    const d = deps();
    const a = await saveStudioAccount(d, who, { action: 'add', platform: 'tiktok', externalId: 'tt-1', name: 'EXTAS TikTok' });
    const on = await saveStudioAccount(d, who, { action: 'switch', id: a.id, enabled: true, version: a.version });
    expect(on.enabled).toBe(true);
    const limited = await saveStudioAccount(d, who, { action: 'dailyLimit', id: a.id, dailyLimit: 10, version: on.version });
    expect(limited.dailyLimit).toBe(10);
    const renamed = await saveStudioAccount(d, who, { action: 'rename', id: a.id, name: 'EXTAS TikTok (BD)', version: limited.version });
    expect(renamed.name).toBe('EXTAS TikTok (BD)');
    const archived = await saveStudioAccount(d, who, { action: 'archive', id: a.id, archived: true, version: renamed.version });
    expect(archived.archived).toBe(true);
    expect(archived.enabled).toBe(false); // archiving switches it off too
    const restored = await saveStudioAccount(d, who, { action: 'archive', id: a.id, archived: false, version: archived.version });
    expect(restored.archived).toBe(false);
    const row = await t.prisma.socialAccount.findUnique({ where: { id: a.id } });
    expect(row).not.toBeNull(); // still there: nothing is ever deleted
  });

  it('refuses a stale save and an unknown account', async () => {
    const d = deps();
    const a = await saveStudioAccount(d, who, { action: 'add', platform: 'youtube', externalId: 'yt-1', name: 'EXTAS YouTube' });
    await saveStudioAccount(d, who, { action: 'switch', id: a.id, enabled: true, version: a.version });
    await expect(saveStudioAccount(d, who, { action: 'switch', id: a.id, enabled: false, version: a.version })).rejects.toMatchObject({ code: 'STALE' });
    await expect(saveStudioAccount(d, who, { action: 'switch', id: '00000000-0000-0000-0000-000000000000', enabled: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a reader sees the list but cannot write; someone with neither permission is refused outright', async () => {
    const d = deps();
    const { rows, canWrite } = await studioAccounts(d, reader);
    expect(canWrite).toBe(false);
    expect(rows.length).toBeGreaterThan(0);
    await expect(saveStudioAccount(d, reader, { action: 'add', platform: 'facebook', externalId: 'page-9', name: 'x' })).rejects.toThrow();
    await expect(studioAccounts(d, nobody)).rejects.toThrow();
  });

  it('every input is validated: bad platform, empty name, an out-of-range daily limit', async () => {
    const d = deps();
    await expect(saveStudioAccount(d, who, { action: 'add', platform: 'twitter', externalId: 'x-1', name: 'x' } as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' } as Partial<StudioError>);
    await expect(saveStudioAccount(d, who, { action: 'add', platform: 'facebook', externalId: 'page-2', name: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const a = await saveStudioAccount(d, who, { action: 'add', platform: 'instagram', externalId: 'ig-2', name: 'EXTAS IG 2' });
    await expect(saveStudioAccount(d, who, { action: 'dailyLimit', id: a.id, dailyLimit: 0, version: a.version })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
