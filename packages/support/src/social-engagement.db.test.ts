// S23 · PR 443 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): Facebook Page comments share the
// `messenger` channel with that Page's DMs; Instagram comments and Direct messages share the Support core's own
// reserved `instagram` kind; a comment is marked public in the conversation; TikTok is not an addable kind (no
// inbound webhook exists for it — social-engagement/index.ts's header note). Every id and name here is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { receiveSocialEngagement, saveSupportChannel, SOCIAL_COMMENT_MARK, supportChannels, type SocialEngagementInbound, type SupportDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 443 · Facebook Page comments and Instagram engagement (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  const clock = { now: new Date('2026-11-12T06:00:00Z') };
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const base = (): Pick<SupportDeps, 'db' | 'settings' | 'now'> => ({ db: t.prisma, settings, now: () => clock.now });
  const who: Record<'lead' | 'reader', Who> = {} as never;
  let n = 0;
  const item = (channelExternalId: string, from: string, text: string, isPublicComment: boolean, extra: Partial<SocialEngagementInbound> = {}): SocialEngagementInbound => ({ channelExternalId, from, messageId: `mid.${++n}`, text, files: [], at: clock.now, isPublicComment, ...extra });

  beforeAll(async () => {
    t = await createTestDatabase('support_social_engagement');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { lead: await role('e-lead', ['support.read', 'support.settings']), reader: await role('e-reader', ['support.read']) };
    for (const k of ['lead', 'reader'] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `e-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('the owner can add an Instagram channel the same way as Messenger/WhatsApp; TikTok is refused (no inbound webhook exists)', async () => {
    expect(await code(saveSupportChannel(base(), who.lead, { action: 'add', kind: 'tiktok', externalId: '1780000001', name: 'Sample IG' }))).toBe('INVALID_INPUT');
    const { id } = await saveSupportChannel(base(), who.lead, { action: 'add', kind: 'instagram', externalId: '1780000001', name: 'Sample IG' });
    await saveSupportChannel(base(), who.lead, { action: 'switch', id, enabled: true });
    expect((await supportChannels(base(), who.reader)).rows.find((r) => r.id === id)).toMatchObject({ kind: 'instagram', enabled: true });
  });

  it('Facebook comments: only a channel added and switched on takes them; a comment is marked public, same channel as the Page`s own DMs', async () => {
    expect(await receiveSocialEngagement(base(), S2, 'messenger', [item('100200300', 'fb-user-1', 'Is the navy polo in L?', true)])).toEqual({ received: 0, duplicate: 0, skipped: 1 });
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'messenger', externalId: '100200300', name: 'Sample Page', enabled: true } });
    const r = await receiveSocialEngagement(base(), S, 'messenger', [item('100200300', 'fb-user-1', 'Is the navy polo in L?', true, { name: 'Sample Buyer' })]);
    expect(r).toEqual({ received: 1, duplicate: 0, skipped: 0 });
    const msg = await t.prisma.message.findFirstOrThrow({ where: { conversation: { storeId: S, channel: { kind: 'messenger' } } } });
    expect(msg.body).toBe(`${SOCIAL_COMMENT_MARK} Is the navy polo in L?`);
    const contact = await t.prisma.supportContact.findFirstOrThrow({ where: { storeId: S, channelKind: 'messenger', externalId: 'fb-user-1' } });
    expect(contact.displayName).toBe('Sample Buyer');
    // a DM on the SAME Page, through the same connector, carries no mark
    const dm = await receiveSocialEngagement(base(), S, 'messenger', [item('100200300', 'psid-1', 'Do you deliver to Rajshahi?', false)]);
    expect(dm).toEqual({ received: 1, duplicate: 0, skipped: 0 });
    const dmMsg = await t.prisma.message.findFirstOrThrow({ where: { conversation: { contact: { externalId: 'psid-1' } } } });
    expect(dmMsg.body).toBe('Do you deliver to Rajshahi?');
    // the same comment id again is one message, not two
    expect(await receiveSocialEngagement(base(), S, 'messenger', [item('100200300', 'fb-user-1', 'Is the navy polo in L?', true, { messageId: msg.externalMessageId! })])).toEqual({ received: 0, duplicate: 1, skipped: 0 });
  });

  it('Instagram: comments and Direct messages into the one `instagram` channel, each item marked correctly; empty words with no file are skipped', async () => {
    const id = (await t.prisma.supportChannel.findUniqueOrThrow({ where: { storeId_kind_externalId: { storeId: S, kind: 'instagram', externalId: '1780000001' } } })).id;
    const r = await receiveSocialEngagement(base(), S, 'instagram', [item('1780000001', 'ig-user-1', 'Price of this one?', true), item('1780000001', 'ig-user-1', '', false)]);
    expect(r).toEqual({ received: 1, duplicate: 0, skipped: 1 });
    const comment = await t.prisma.message.findFirstOrThrow({ where: { conversation: { channelId: id } } });
    expect(comment.body).toBe(`${SOCIAL_COMMENT_MARK} Price of this one?`);
    const dm = await receiveSocialEngagement(base(), S, 'instagram', [item('1780000001', 'ig-user-2', 'Do you deliver to Khulna?', false)]);
    expect(dm).toEqual({ received: 1, duplicate: 0, skipped: 0 });
    const dmMsg = await t.prisma.message.findFirstOrThrow({ where: { conversation: { contact: { externalId: 'ig-user-2' } } } });
    expect(dmMsg.body).toBe('Do you deliver to Khulna?');
    // switched off: nothing is taken (stays in the account's own inbox)
    await t.prisma.supportChannel.update({ where: { id }, data: { enabled: false } });
    expect(await receiveSocialEngagement(base(), S, 'instagram', [item('1780000001', 'ig-user-3', 'hi', true)])).toEqual({ received: 0, duplicate: 0, skipped: 1 });
  });
});
