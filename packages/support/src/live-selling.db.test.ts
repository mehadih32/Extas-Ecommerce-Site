// S28 · PR 694 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): live selling. Off as shipped; one session
// runs at a time; a comment of the running session's Page is read ("P1 L 2 pcs") and kept; "Make draft" puts the piece
// in that person's chat bag (the chat-order path) and nothing becomes an order; sold out and no-chat are said, not
// guessed; "Make all" does every ready one; a comment twice is one capture; a Page with no running session keeps nothing.
// Every id and name is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpCheckout, type CheckoutFixture } from '@extas/checkout/testing';
import { addLiveCommentByHand, chatBag, endLiveSession, liveBoard, makeAllLiveDrafts, makeLiveDraft, receiveSocialEngagement, skipLiveCapture, startLiveSession, type ChatOrderDeps, type Who } from './index';
import { registry } from '@extas/settings';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 694 · live selling (PostgreSQL)', () => {
  let f: CheckoutFixture;
  const deps = (): ChatOrderDeps => ({ db: f.t.prisma, settings: f.deps().settings, now: () => f.clock.now, checkout: { ...f.deps(), advanceFlag: async () => null } });
  const who: Record<'agent' | 'reader', Who> = {} as never;
  let productId = '';
  let size = '';
  let otherSize = '';
  let n = 0;
  const comment = (from: string, text: string) => ({ channelExternalId: 'sample-694', from, name: `Buyer ${from}`, messageId: `lv.${++n}`, text, files: [], at: f.clock.now, isPublicComment: true });

  beforeAll(async () => {
    f = await setUpCheckout('support_live_selling');
    const db = f.t.prisma;
    const mk = (k: string, permissions: string[]) => createRole(db, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { agent: await mk('t-live-agent', ['support.read', 'support.reply', 'support.order']), reader: await mk('t-live-reader', ['support.read']) };
    for (const k of ['agent', 'reader'] as const) {
      const u = await db.staffUser.create({ data: { email: `${k}-694@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await db.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: f.S } });
      who[k] = { actor: { staffUserId: u.id }, storeId: f.S };
    }
    await db.supportChannel.create({ data: { storeId: f.S, kind: 'messenger', externalId: 'sample-694', name: 'Sample Page', enabled: true } });
    // a product with sellable sizes
    const v = await db.productVariant.findFirstOrThrow({ where: { storeId: f.S, active: true, inStock: true, archivedAt: null, size: { isNot: null }, product: { status: 'PUBLISHED', archivedAt: null } }, include: { size: true } });
    productId = v.productId;
    size = v.size!.label;
    otherSize = 'XXXL';
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('is off as shipped: nothing starts, nothing is kept', async () => {
    expect((await liveBoard(deps(), who.reader)).enabled).toBe(false);
    expect(await code(startLiveSession(deps(), who.agent, { title: 'x', channelKind: 'messenger', codes: [{ code: 'P1', productId }] }))).toBe('LIVE_OFF');
    expect(await f.t.prisma.liveCapture.count()).toBe(0);
  });

  it('starts one session at a time, only with this shop products, and only with the reply key', async () => {
    f.overrides.set('support.liveSelling', { enabled: true, maxQty: 5 });
    f.overrides.set('support.cart', { ...registry['support.cart'].default, enabled: true });
    const input = { title: 'Friday night live', channelKind: 'messenger', codes: [{ code: 'P1', productId }] };
    expect(await code(startLiveSession(deps(), who.reader, input))).not.toBe('ok');
    expect(await code(startLiveSession(deps(), who.agent, { ...input, codes: [{ code: 'P1', productId: '00000000-0000-4000-8000-000000000009' }] }))).toBe('NOT_FOUND');
    await startLiveSession(deps(), who.agent, input);
    expect(await code(startLiveSession(deps(), who.agent, input))).toBe('LIVE_RUNNING');
  });

  it('reads the comments of the Page: an order, a question, an unknown code, too many pieces; a repeat is one capture', async () => {
    await receiveSocialEngagement(deps(), f.S, 'messenger', [comment('a', `P1 ${size} 2 pcs`), comment('b', 'koto?'), comment('c', `P7 ${size} 1`), comment('d', `P1 ${size} 9`), comment('e', `P1 ${otherSize} 1`)]);
    const dup = comment('a', `P1 ${size} 2 pcs`);
    await receiveSocialEngagement(deps(), f.S, 'messenger', [{ ...dup, messageId: 'lv.1' }]);
    const b = await liveBoard(deps(), who.reader);
    expect(b.captures).toHaveLength(5);
    expect(b.captures.map((c) => c.state)).toEqual(['READY', 'NOT_ORDER', 'NOT_ORDER', 'NOT_ORDER', 'SOLD_OUT']);
    expect(b.captures.map((c) => c.reason)).toEqual([null, 'NOT_AN_ORDER', 'UNKNOWN_CODE', 'TOO_MANY', null]);
    expect(b.ready).toBe(1);
  });

  it('"Make draft" puts the piece in the chat bag and nothing becomes an order', async () => {
    const [first] = (await liveBoard(deps(), who.agent)).captures;
    const r = await makeLiveDraft(deps(), who.agent, first!.id);
    expect(r).toEqual({ captureId: first!.id, ok: true, code: null });
    const board = await liveBoard(deps(), who.agent);
    expect(board.captures[0]!.state).toBe('IN_BAG');
    expect(board.drafted).toBe(1);
    const bag = await chatBag(deps(), who.agent, first!.conversationId!);
    expect(bag.count).toBe(2);
    expect(await f.t.prisma.order.count({ where: { storeId: f.S, source: 'MESSENGER' } })).toBe(0);
    expect((await makeLiveDraft(deps(), who.agent, first!.id)).code).toBe('ALREADY');
    expect((await makeLiveDraft(deps(), who.agent, board.captures[1]!.id)).code).toBe('NOT_AN_ORDER');
    expect((await makeLiveDraft(deps(), who.agent, board.captures[4]!.id)).code).toBe('SOLD_OUT');
    expect(await code(makeLiveDraft(deps(), who.reader, first!.id))).not.toBe('ok');
  });

  it('a hand-added practice comment has no chat; "Make all" does the ready ones; a skip is kept', async () => {
    await receiveSocialEngagement(deps(), f.S, 'messenger', [comment('f', `P1 ${size} 1`)]);
    await addLiveCommentByHand(deps(), who.agent, { name: 'Practice', text: `P1 ${size} 1` });
    const b = await liveBoard(deps(), who.agent);
    expect(b.captures.find((c) => c.practice)?.state).toBe('NO_CHAT');
    const done = await makeAllLiveDrafts(deps(), who.agent);
    expect(done.map((d) => d.ok)).toEqual([true]);
    const skipped = (await liveBoard(deps(), who.agent)).captures.find((c) => c.practice)!;
    await skipLiveCapture(deps(), who.agent, skipped.id);
    expect((await liveBoard(deps(), who.agent)).captures.find((c) => c.practice)?.state).toBe('SKIPPED');
  });

  it('ends the session; its captures stay; a comment after the end is kept nowhere', async () => {
    await endLiveSession(deps(), who.agent);
    expect(await code(endLiveSession(deps(), who.agent))).toBe('NO_LIVE');
    const before = await f.t.prisma.liveCapture.count();
    await receiveSocialEngagement(deps(), f.S, 'messenger', [comment('g', `P1 ${size} 1`)]);
    expect(await f.t.prisma.liveCapture.count()).toBe(before);
    const b = await liveBoard(deps(), who.reader);
    expect(b.session?.status).toBe('ENDED');
    expect(b.captures.length).toBe(before);
  });
});
