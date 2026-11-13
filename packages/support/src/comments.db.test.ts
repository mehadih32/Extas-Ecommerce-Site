// S28 · PR 693 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the comment desk. Off as shipped; a phone
// number or abuse hides a comment by the owner's rules; a price question gets one private and one public reply, once;
// a hidden comment is never answered; the four views and counts; hiding and showing by hand; a failed Page call changes
// nothing. The Page's connector is a recording stand-in. Every id and name is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { hideComment, listComments, messageCommenterPrivately, receiveSocialEngagement, unhideComment, type CommentSender, type SocialEngagementInbound, type SupportDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 693 · comment desk (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let on = false;
  let auto = false;
  let fail = false;
  const calls: string[] = [];
  const clock = { now: new Date('2026-11-13T06:00:00Z') };
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'support.commentDesk') return { ...registry['support.commentDesk'].default, enabled: on, autoPrivate: auto } as Value<K>;
      return registry[key].default as Value<K>;
    },
  };
  const sender: CommentSender = {
    hide: async (_t, h) => (fail ? { ok: false, error: 'meta-down' } : (calls.push(h ? 'hide' : 'show'), { ok: true })),
    privateReply: async () => (calls.push('private'), { ok: true }),
    publicReply: async () => (calls.push('public'), { ok: true }),
  };
  const base = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now, comments: sender });
  const who: Record<'lead' | 'reader', Who> = {} as never;
  let n = 0;
  const comment = (from: string, text: string): SocialEngagementInbound => ({ channelExternalId: '100200300', from, messageId: `cmt.${++n}`, text, files: [], at: clock.now, isPublicComment: true });
  const idOf = async (text: string) => (await t.prisma.message.findFirstOrThrow({ where: { body: { contains: text } } })).id;

  beforeAll(async () => {
    t = await createTestDatabase('comment_desk');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'messenger', externalId: '100200300', name: 'Sample Page', enabled: true } });
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { lead: await role('c-lead', ['support.read', 'support.reply']), reader: await role('c-reader', ['support.read']) };
    for (const k of ['lead', 'reader'] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `c-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped: comments arrive, nothing is hidden or sent, the desk lists nothing', async () => {
    await receiveSocialEngagement(base(), S, 'messenger', [comment('u1', 'call 01712559831 now')]);
    expect(calls).toEqual([]);
    expect((await t.prisma.message.findFirstOrThrow({ where: { body: { contains: '01712559831' } } })).hiddenAt).toBeNull();
    expect((await listComments(base(), who.reader)).enabled).toBe(false);
    expect(await code(hideComment(base(), who.lead, await idOf('01712559831')))).toBe('COMMENT_DESK_OFF');
  });

  it('hides a phone number and abuse by the owner rules, and never answers a hidden comment', async () => {
    on = true;
    auto = true;
    await receiveSocialEngagement(base(), S, 'messenger', [comment('u2', 'amar number 01819443322 price?'), comment('u3', 'Fake product, chor company')]);
    expect(calls).toEqual(['hide', 'hide']);
    const a = await t.prisma.message.findFirstOrThrow({ where: { body: { contains: '01819443322' } } });
    expect(a).toMatchObject({ hideReason: 'phone', autoRepliedAt: null });
    expect(a.hiddenAt).not.toBeNull();
    expect((await t.prisma.message.findFirstOrThrow({ where: { body: { contains: 'chor company' } } })).hideReason).toBe('abuse');
    expect(await code(messageCommenterPrivately(base(), who.lead, { messageId: a.id }))).toBe('COMMENT_HIDDEN');
  });

  it('answers a price question once: one private message and one public reply, and the same comment again is not answered twice', async () => {
    calls.length = 0;
    await receiveSocialEngagement(base(), S, 'messenger', [comment('u4', 'Price koto?')]);
    expect(calls).toEqual(['private', 'public']);
    const m = await t.prisma.message.findFirstOrThrow({ where: { body: { contains: 'Price koto' } } });
    expect(m.autoRepliedAt).not.toBeNull();
    await receiveSocialEngagement(base(), S, 'messenger', [{ ...comment('u4', 'Price koto?'), messageId: m.externalMessageId! }]);
    expect(calls).toEqual(['private', 'public']);
  });

  it('keeps a question unanswered when the auto reply is off, and lists it under Need a reply', async () => {
    auto = false;
    calls.length = 0;
    await receiveSocialEngagement(base(), S, 'messenger', [comment('u5', 'L size chest koto')]);
    expect(calls).toEqual([]);
    const l = await listComments(base(), who.reader);
    expect(l.counts).toEqual({ all: 5, need: 1, hidden: 2, auto: 1 });
    expect((await listComments(base(), who.reader, { view: 'need' })).rows.map((r) => r.words)).toEqual(['L size chest koto']);
    expect((await listComments(base(), who.reader, { view: 'hidden' })).rows).toHaveLength(2);
    expect(await code(listComments(base(), who.reader, { view: 'bogus' }))).toBe('INVALID_INPUT');
  });

  it('hides and shows by hand, only with the reply key; a failed Page call changes nothing', async () => {
    const id = await idOf('L size chest koto');
    expect(await code(hideComment(base(), who.reader, id))).not.toBe('ok');
    fail = true;
    expect(await code(hideComment(base(), who.lead, id))).toBe('COMMENT_SEND_FAILED');
    expect((await t.prisma.message.findUniqueOrThrow({ where: { id } })).hiddenAt).toBeNull();
    fail = false;
    await hideComment(base(), who.lead, id);
    expect((await t.prisma.message.findUniqueOrThrow({ where: { id } })).hideReason).toBe('manual');
    await unhideComment(base(), who.lead, id);
    expect((await t.prisma.message.findUniqueOrThrow({ where: { id } })).hiddenAt).toBeNull();
    const logs = await t.prisma.auditLog.findMany({ where: { entityId: id, entityType: 'Message' }, select: { action: true } });
    expect(logs.map((x) => x.action).sort()).toEqual(['support.comment.hide', 'support.comment.show']);
  });

  it('"Message privately" sends the desk text once to a visible comment and records who did it', async () => {
    calls.length = 0;
    const id = await idOf('L size chest koto');
    await messageCommenterPrivately(base(), who.lead, { messageId: id });
    expect(calls).toEqual(['private']);
    expect(await t.prisma.conversationEvent.count({ where: { messageId: id, kind: 'COMMENT_PRIVATE_REPLY' } })).toBe(1);
  });
});
