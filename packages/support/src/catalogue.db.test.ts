// PR 429 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the catalogue drawer. Off as it ships, the
// search and the send are refused; on, the search finds live products by name, SKU or colour (every word), never a
// draft or another store's; one press sends a card (the picked colour's photos first, the name, the price, the link
// with the chat's reference) kept with its share and a log line, a second press is the same card, a sold-out size is
// refused; the customer's first click is noted once; only `support.reply` may search or send. Every name is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { chatCatalogue, openShare, receiveMessage, REF_CODE, shareProduct, supportThread, type SupportDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 429 · the catalogue drawer (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let OTHER: number;
  const overrides = new Map<string, unknown>();
  const clock = { now: new Date('2026-11-01T06:00:00Z') };
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'naming.productPathPrefix') return '/p' as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now });
  const who: Record<'agent' | 'reader', Who> = {} as never;
  const ids: Record<string, string> = {};
  let conversationId = '';
  const on = (v: Partial<Value<'support.catalogue'>> = {}) => overrides.set('support.catalogue', { enabled: true, photos: 2, results: 8, creditDays: 7, ...v });
  const filesOn = () => overrides.set('support.attachments', { ...registry['support.attachments'].default, enabled: true, kinds: { image: true, video: false, pdf: false } });

  beforeAll(async () => {
    t = await createTestDatabase('support_catalogue');
    [S, OTHER] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { agent: await role('t-agent', ['support.read', 'support.reply']), reader: await role('t-reader', ['support.read']) };
    for (const k of ['agent', 'reader'] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    const db = t.prisma;
    const navy = await db.colour.create({ data: { storeId: S!, key: 'navy', nameEn: 'Navy', nameBn: 'নেভি', hex: '#1F2A44', synonyms: ['blue'] } });
    const white = await db.colour.create({ data: { storeId: S!, key: 'white', nameEn: 'White', hex: '#FFFFFF' } });
    const m = await db.size.create({ data: { storeId: S!, key: 'm', label: 'M', sortOrder: 1 } });
    const l = await db.size.create({ data: { storeId: S!, key: 'l', label: 'L', sortOrder: 2 } });
    const polo = await db.product.create({ data: { storeId: S!, slug: 'sample-pique-polo', nameEn: 'Sample Pique Polo', nameBn: 'স্যাম্পল পোলো', status: 'PUBLISHED', publishedAt: clock.now } });
    ids.polo = polo.id;
    const v = (colourId: string, sizeId: string, sku: string, inStock: boolean, priceMinor: number) => db.productVariant.create({ data: { storeId: S!, productId: polo.id, colourId, sizeId, sku, active: true, inStock, priceMinor } });
    ids.navyM = (await v(navy.id, m.id, 'SPP-NVY-M', true, 145000)).id;
    ids.navyL = (await v(navy.id, l.id, 'SPP-NVY-L', false, 145000)).id;
    ids.whiteM = (await v(white.id, m.id, 'SPP-WHT-M', true, 135000)).id;
    const draft = await db.product.create({ data: { storeId: S!, slug: 'sample-draft-polo', nameEn: 'Sample Draft Polo', status: 'DRAFT' } });
    await db.productVariant.create({ data: { storeId: S!, productId: draft.id, sku: 'SDP-1', active: true, inStock: true, priceMinor: 1000 } });
    ids.draft = draft.id;
    await db.product.create({ data: { storeId: OTHER!, slug: 'sample-pique-polo', nameEn: 'Sample Pique Polo', status: 'PUBLISHED' } });
    // photos: a white one, a navy one, one for every colour; plus a navy video (never sent as a photo)
    const asset = (n: string, kind: 'IMAGE' | 'VIDEO' = 'IMAGE') =>
      db.mediaAsset.create({ data: { storeId: S!, kind, storage: 'LOCAL_DISK', storageKey: `sample/${n}`, mimeType: kind === 'IMAGE' ? 'image/jpeg' : 'video/mp4', bytes: BigInt(50_000), checksumSha256: n.padEnd(64, '0') } });
    const media = async (n: string, colourId: string | null, sortOrder: number, kind: 'IMAGE' | 'VIDEO' = 'IMAGE') => {
      const a = await asset(n, kind);
      await db.productMedia.create({ data: { storeId: S!, productId: polo.id, assetId: a.id, colourId, role: kind === 'IMAGE' ? 'FRONT' : 'VIDEO', sortOrder } });
      return a.id;
    };
    ids.whitePic = await media('white', white.id, 0);
    ids.anyPic = await media('any', null, 1);
    ids.navyPic = await media('navy', navy.id, 2);
    await media('navyvid', navy.id, 3, 'VIDEO');
    await db.supportChannel.create({ data: { storeId: S!, kind: 'messenger', externalId: 'sample-messenger', name: 'messenger', enabled: true } });
    const r = await receiveMessage(deps(), { storeId: S!, channel: { kind: 'messenger', externalId: 'sample-messenger' }, contact: { externalId: 'psid-429', name: 'Sample buyer' }, message: { externalId: 'm-429', text: 'Polo ache?', sentAt: clock.now } });
    conversationId = r.conversationId;
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('off as it ships: searching and sending are refused', async () => {
    expect(await code(chatCatalogue(deps(), who.agent, { q: 'polo' }))).toBe('CATALOGUE_OFF');
    expect(await code(shareProduct(deps(), who.agent, { conversationId, productId: ids.polo, requestKey: 'share-off-1' }, { origin: null }))).toBe('CATALOGUE_OFF');
    expect((await supportThread(deps(), who.agent, conversationId)).you.catalogue).toBe(false);
  });

  it('finds live products by name, SKU or colour (every word must match); never a draft, another store, or for a reader', async () => {
    on();
    const names = async (q: string) => (await chatCatalogue(deps(), who.agent, { q })).products.map((p) => p.id);
    expect(await names('pique')).toEqual([ids.polo]);
    expect(await names('spp-wht')).toEqual([ids.polo]);
    expect(await names('navy polo')).toEqual([ids.polo]);
    expect(await names('blue')).toEqual([ids.polo]); // a colour's synonym
    expect(await names('নেভি')).toEqual([ids.polo]);
    expect(await names('navy draft')).toEqual([]);
    expect(await names('')).toEqual([ids.polo]); // the draft never shows
    const [p] = (await chatCatalogue(deps(), who.agent, { q: 'polo' })).products;
    expect(p).toMatchObject({ slug: 'sample-pique-polo', priceMinor: 135000 });
    expect(p!.colours.map((c) => c.key)).toEqual(['navy', 'white']);
    expect(p!.variants.find((v) => v.id === ids.navyL)).toMatchObject({ colour: 'navy', size: { key: 'l', label: 'L' }, inStock: false });
    expect(await code(chatCatalogue(deps(), who.reader, { q: 'polo' }))).toBe('FORBIDDEN');
    expect((await supportThread(deps(), who.agent, conversationId)).you.catalogue).toBe(true);
  });

  it('one press sends the card: the colour’s photo first, the name, the price, the link with the reference; twice is one card', async () => {
    on();
    filesOn();
    const input = { conversationId, productId: ids.polo, variantId: ids.navyM, requestKey: 'share-navy-m-1' };
    const r = await shareProduct(deps(), who.agent, input, { origin: 'https://shop.example.test' });
    expect(r.replay).toBe(false);
    expect(REF_CODE.test(r.refCode)).toBe(true);
    expect(r.link).toBe(`https://shop.example.test/p/sample-pique-polo?color=navy&s=m&r=${r.refCode}`);
    expect(r.photos).toBe(2);
    const m = await t.prisma.message.findUniqueOrThrow({ where: { id: r.messageId }, include: { attachments: { orderBy: { createdAt: 'asc' } } } });
    expect(m.body).toBe(`Sample Pique Polo (Navy · M)\n${m.body!.split('\n')[1]}\n${r.link}`);
    expect(m.body!.split('\n')[1]).toMatch(/1,450/);
    expect(m.attachments.map((a) => a.assetId)).toEqual([ids.navyPic, ids.anyPic]);
    const share = await t.prisma.supportProductShare.findUniqueOrThrow({ where: { messageId: r.messageId } });
    expect(share).toMatchObject({ storeId: S, conversationId, productId: ids.polo, variantId: ids.navyM, refCode: r.refCode, sentById: who.agent.actor.staffUserId, clickedAt: null, orderId: null });
    const ev = await t.prisma.conversationEvent.findFirstOrThrow({ where: { conversationId, kind: 'PRODUCT_SENT' } });
    expect(ev).toMatchObject({ actorType: 'STAFF', actorName: 'Sample agent', messageId: r.messageId });
    expect(ev.data).toMatchObject({ productId: ids.polo, sku: 'SPP-NVY-M', ref: r.refCode, photos: 2 });

    const again = await shareProduct(deps(), who.agent, input, { origin: 'https://shop.example.test' });
    expect(again).toMatchObject({ replay: true, messageId: r.messageId, refCode: r.refCode, link: r.link, photos: 2 });
    expect(await t.prisma.supportProductShare.count({ where: { conversationId } })).toBe(1);
    expect(await code(shareProduct(deps(), who.agent, { ...input, variantId: ids.whiteM }, { origin: null }))).toBe('IDEMPOTENCY_MISMATCH');

    const th = await supportThread(deps(), who.agent, conversationId);
    expect(th.messages.find((x) => x.id === r.messageId)?.share).toMatchObject({ productId: ids.polo, refCode: r.refCode, openedAt: null, order: null });
  });

  it('a sold-out size, a draft, another store’s product or a reader are refused; no photos while files are off', async () => {
    on();
    const base = { conversationId, productId: ids.polo };
    expect(await code(shareProduct(deps(), who.agent, { ...base, variantId: ids.navyL, requestKey: 'share-sold-out' }, { origin: null }))).toBe('OUT_OF_STOCK');
    expect(await code(shareProduct(deps(), who.agent, { ...base, productId: ids.draft, requestKey: 'share-draft-1' }, { origin: null }))).toBe('NOT_FOUND');
    expect(await code(shareProduct(deps(), who.agent, { ...base, colour: 'red', requestKey: 'share-red-11' }, { origin: null }))).toBe('NOT_FOUND');
    expect(await code(shareProduct(deps(), who.reader, { ...base, requestKey: 'share-reader-1' }, { origin: null }))).toBe('FORBIDDEN');
    overrides.set('support.attachments', { ...registry['support.attachments'].default, enabled: false });
    const r = await shareProduct(deps(), who.agent, { ...base, colour: 'white', lang: 'bn', requestKey: 'share-white-bn' }, { origin: null });
    expect(r.photos).toBe(0);
    expect(r.link).toBe(`/p/sample-pique-polo?color=white&r=${r.refCode}`);
    const m = await t.prisma.message.findUniqueOrThrow({ where: { id: r.messageId } });
    expect(m.body!.split('\n')[0]).toBe('স্যাম্পল পোলো (White)');
  });

  it('the customer’s first click is noted once with a log line; an unknown reference or the switch off keeps nothing', async () => {
    on();
    const share = await t.prisma.supportProductShare.findFirstOrThrow({ where: { conversationId, variantId: ids.navyM } });
    clock.now = new Date('2026-11-01T07:00:00Z');
    expect(await openShare(deps(), S, share.refCode)).toEqual({ days: 7 });
    clock.now = new Date('2026-11-01T08:00:00Z');
    expect(await openShare(deps(), S, share.refCode)).toEqual({ days: 7 });
    expect((await t.prisma.supportProductShare.findUniqueOrThrow({ where: { id: share.id } })).clickedAt).toEqual(new Date('2026-11-01T07:00:00Z'));
    expect(await t.prisma.conversationEvent.count({ where: { conversationId, kind: 'PRODUCT_OPENED' } })).toBe(1);
    expect(await openShare(deps(), OTHER, share.refCode)).toBeNull();
    expect(await openShare(deps(), S, 'zzzzzzzzzz')).toBeNull();
    expect(await openShare(deps(), S, 'NOT A REF')).toBeNull();
    overrides.delete('support.catalogue');
    expect(await openShare(deps(), S, share.refCode)).toBeNull();
  });
});
