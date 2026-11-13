// S28 · PR 692 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): quick replies. Off until switched on;
// the 8 starters appear once; a short name is unique per store; archive hides and restore brings back (never a
// delete); one store never sees another's; a reader without `support.settings` cannot change them. Sample data only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { archiveSavedReply, listSavedReplies, saveSavedReply, useSavedReply, type SupportDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 692 · quick replies (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  let on = false;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'support.savedReplies') return { enabled: on, maxChars: 60 } as Value<K>;
      return registry[key].default as Value<K>;
    },
  };
  const base = (): SupportDeps => ({ db: t.prisma, settings, now: () => new Date('2026-11-13T06:00:00Z') });
  const who: Record<'lead' | 'agent' | 'other', Who> = {} as never;

  beforeAll(async () => {
    t = await createTestDatabase('saved_replies');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { lead: await role('q-lead', ['support.read', 'support.reply', 'support.settings']), agent: await role('q-agent', ['support.read', 'support.reply']) };
    for (const k of ['lead', 'agent'] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `q-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    who.other = { ...who.lead, storeId: S2 };
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped: nothing is listed, nothing is changed, no starter is made', async () => {
    expect((await listSavedReplies(base(), who.agent)).enabled).toBe(false);
    expect(await code(saveSavedReply(base(), who.lead, { shortcut: 'a', bodyEn: 'x', bodyBn: '' }))).toBe('SAVED_REPLIES_OFF');
    expect(await t.prisma.supportSavedReply.count()).toBe(0);
  });

  it('makes the 8 starters once when switched on, and an agent can list but not change', async () => {
    on = true;
    const l = await listSavedReplies(base(), who.agent);
    expect(l.active).toHaveLength(8);
    await listSavedReplies(base(), who.lead);
    expect(await t.prisma.supportSavedReply.count({ where: { storeId: S } })).toBe(8);
    expect(await code(saveSavedReply(base(), who.agent, { shortcut: 'new', bodyEn: 'x', bodyBn: '' }))).not.toBe('ok');
  });

  it('adds, edits, refuses a taken short name and a too long text, and audits', async () => {
    const a = await saveSavedReply(base(), who.lead, { shortcut: '/Price', bodyEn: 'See the price on the page', bodyBn: 'দাম পাতায় আছে' });
    expect(a.shortcut).toBe('price');
    expect(await code(saveSavedReply(base(), who.lead, { shortcut: 'price', bodyEn: 'again', bodyBn: '' }))).toBe('SHORTCUT_TAKEN');
    expect(await code(saveSavedReply(base(), who.lead, { shortcut: 'long', bodyEn: 'x'.repeat(61), bodyBn: '' }))).toBe('INVALID_INPUT');
    const e = await saveSavedReply(base(), who.lead, { id: a.id, shortcut: 'price', bodyEn: 'Edited', bodyBn: '' });
    expect(e.bodyEn).toBe('Edited');
    const logs = await t.prisma.auditLog.findMany({ where: { entityType: 'SupportSavedReply', entityId: a.id }, select: { action: true } });
    expect(logs.map((x) => x.action).sort()).toEqual(['support.savedReply.add', 'support.savedReply.edit']);
  });

  it('archives and restores, never deletes; archived ones are not counted as used', async () => {
    const l = await listSavedReplies(base(), who.lead);
    const size = l.active.find((x) => x.shortcut === 'size')!;
    expect(await useSavedReply(base(), who.agent, size.id)).toBe(true);
    await archiveSavedReply(base(), who.lead, size.id, true);
    const after = await listSavedReplies(base(), who.lead);
    expect(after.active.find((x) => x.shortcut === 'size')).toBeUndefined();
    expect(after.archived.map((x) => x.shortcut)).toContain('size');
    expect(await useSavedReply(base(), who.agent, size.id)).toBe(false);
    await archiveSavedReply(base(), who.lead, size.id, false);
    const back = (await listSavedReplies(base(), who.lead)).active.find((x) => x.shortcut === 'size')!;
    expect(back.usedCount).toBe(1);
    expect(after.top?.shortcut).toBeUndefined();
  });

  it('keeps stores apart', async () => {
    const other = await listSavedReplies(base(), who.other).catch((e) => e);
    // the same person has no role in store 2: refused, and store 2 never sees store 1's rows
    expect(other).toBeInstanceOf(Error);
    expect(await t.prisma.supportSavedReply.count({ where: { storeId: S2 } })).toBe(0);
    expect(await code(archiveSavedReply(base(), who.lead, (await t.prisma.supportSavedReply.findFirstOrThrow({ where: { storeId: S } })).id, true))).toBe('ok');
  });
});
