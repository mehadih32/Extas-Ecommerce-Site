// Follow-up 505 (PR 425, 426; B4.8) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a customer's
// channel file is copied only while `support.fileCopy` is on; a copied file is STORED with its keeping date by kind; a
// passing problem waits for the next turn, a file refused for good, too big, or not given in time is FAILED; a channel
// with no fetcher waits; another store's files are never touched; a second turn writes nothing twice. Made-up values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { copyPendingFiles, receiveMessage, type FileCopyWiring, type SupportDeps, type SupportFileFetcher } from './index';

describe.skipIf(!HAS_TEST_DB)('follow-up 505 · copying a customer`s channel files (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  const overrides = new Map<string, unknown>();
  // The clock starts at the real time: a file's createdAt is the database's own now(), and the give-up rule compares the
  // two (a fixed date in the past made "past giveUpHours" depend on the hour the test ran).
  const clock = { now: new Date() };
  const settings = {
    async value<K extends Key>(key: K, at?: { storeId?: number }): Promise<Value<K>> {
      const k = `${key}@${at?.storeId ?? 0}`;
      return (overrides.has(k) ? overrides.get(k) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now });
  let n = 0;
  const file = async (storeId: number, kind: 'IMAGE' | 'VIDEO' | 'AUDIO', sourceUrl: string, channel: 'whatsapp' | 'messenger' = 'whatsapp') => {
    const r = await receiveMessage(deps(), { storeId, channel: { kind: channel, externalId: `sample-${channel}` }, contact: { externalId: `c-${++n}` }, message: { externalId: `m-${n}`, text: '', sentAt: clock.now, files: [{ kind, sourceUrl, fileName: `f-${n}` }] } });
    return t.prisma.messageAttachment.findFirstOrThrow({ where: { messageId: r.messageId } });
  };
  const state = async (id: string) => t.prisma.messageAttachment.findUniqueOrThrow({ where: { id }, select: { status: true, assetId: true, expiresAt: true, sizeBytes: true, contentType: true } });
  const saved: { storeId: number; kind: string; bytes: number }[] = [];
  const answers = new Map<string, () => { body: Uint8Array; contentType: string }>();
  const fetcher: SupportFileFetcher = {
    async fetch(f) {
      const a = answers.get(f.sourceUrl);
      if (!a) throw Object.assign(new Error('network'), { code: 'NETWORK' });
      return a();
    },
  };
  const wiring = (o: { none?: string[] } = {}): FileCopyWiring => ({
    fetcherFor: async (_s, kind) => (o.none?.includes(kind) ? null : fetcher),
    save: async (storeId, f) => {
      saved.push({ storeId, kind: f.kind, bytes: f.body.byteLength });
      return randomUUID();
    },
  });
  const on = (storeId: number, extra: Partial<Value<'support.fileCopy'>> = {}) => overrides.set(`support.fileCopy@${storeId}`, { ...registry['support.fileCopy'].default, enabled: true, ...extra });

  beforeAll(async () => {
    t = await createTestDatabase('support_file_copy');
    [S, S2] = await seedSampleStores(t.prisma);
    for (const storeId of [S, S2]) for (const kind of ['whatsapp', 'messenger']) await t.prisma.supportChannel.create({ data: { storeId, kind, externalId: `sample-${kind}`, name: kind, enabled: true } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('off as shipped: nothing is read or saved; the file stays "copying"', async () => {
    const a = await file(S, 'IMAGE', 'https://files.example.com/off.jpg');
    answers.set('https://files.example.com/off.jpg', () => ({ body: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' }));
    expect(await copyPendingFiles(deps(), S, wiring())).toEqual({ status: 'off', copied: 0, failed: 0, waiting: 0 });
    expect((await state(a.id)).status).toBe('PENDING');
    expect(saved).toEqual([]);
  });

  it('on: a photo is kept for photoDays, a video for videoDays; another store`s file is never touched; a second turn writes nothing twice', async () => {
    on(S);
    const v = await file(S, 'VIDEO', 'https://files.example.com/v.mp4');
    answers.set('https://files.example.com/v.mp4', () => ({ body: new Uint8Array(10), contentType: 'video/mp4' }));
    const other = await file(S2, 'IMAGE', 'https://files.example.com/off.jpg');
    expect(await copyPendingFiles(deps(), S, wiring())).toEqual({ status: 'ok', copied: 2, failed: 0, waiting: 0 });
    const photo = await t.prisma.messageAttachment.findFirstOrThrow({ where: { storeId: S, sourceUrl: 'https://files.example.com/off.jpg' } });
    expect(photo).toMatchObject({ status: 'STORED', sizeBytes: 3, contentType: 'image/jpeg', expiresAt: new Date(clock.now.getTime() + 730 * 86_400_000) });
    expect(photo.assetId).toBeTruthy();
    expect(await state(v.id)).toMatchObject({ status: 'STORED', expiresAt: new Date(clock.now.getTime() + 90 * 86_400_000) });
    expect((await state(other.id)).status).toBe('PENDING');
    expect(saved.map((x) => x.storeId)).toEqual([S, S]);
    expect(await copyPendingFiles(deps(), S, wiring())).toEqual({ status: 'ok', copied: 0, failed: 0, waiting: 0 });
  });

  it('a passing problem waits for the next turn; too big or refused for good is FAILED; not given in time is FAILED; no fetcher waits', async () => {
    on(S, { maxMb: 1, giveUpHours: 2 });
    const later = await file(S, 'IMAGE', 'https://files.example.com/later.jpg');
    const big = await file(S, 'VIDEO', 'https://files.example.com/big.mp4');
    answers.set('https://files.example.com/big.mp4', () => ({ body: new Uint8Array(1024 * 1024 + 1), contentType: 'video/mp4' }));
    const blocked = await file(S, 'IMAGE', 'https://files.example.com/blocked.jpg');
    answers.set('https://files.example.com/blocked.jpg', () => {
      throw Object.assign(new Error('blocked'), { code: 'BLOCKED_ADDRESS' });
    });
    const gone = await file(S, 'AUDIO', 'https://files.example.com/gone.ogg');
    answers.set('https://files.example.com/gone.ogg', () => {
      throw Object.assign(new Error('gone'), { code: 'HTTP_ERROR', retryable: false });
    });
    const busy = await file(S, 'AUDIO', 'https://files.example.com/busy.ogg');
    answers.set('https://files.example.com/busy.ogg', () => {
      throw Object.assign(new Error('busy'), { code: 'HTTP_ERROR', retryable: true });
    });
    const page = await file(S, 'IMAGE', 'https://files.example.com/page.jpg', 'messenger');
    expect(await copyPendingFiles(deps(), S, wiring({ none: ['messenger'] }))).toEqual({ status: 'ok', copied: 0, failed: 3, waiting: 3 });
    expect([(await state(later.id)).status, (await state(big.id)).status, (await state(blocked.id)).status, (await state(gone.id)).status, (await state(busy.id)).status, (await state(page.id)).status]).toEqual(['PENDING', 'FAILED', 'FAILED', 'FAILED', 'PENDING', 'PENDING']);
    // the channel gives it on a later turn
    answers.set('https://files.example.com/later.jpg', () => ({ body: new Uint8Array(5), contentType: 'image/png' }));
    expect(await copyPendingFiles(deps(), S, wiring({ none: ['messenger'] }))).toMatchObject({ copied: 1, waiting: 2 });
    expect((await state(later.id)).status).toBe('STORED');
    // past giveUpHours: what is still not given is FAILED (never retried for ever)
    clock.now = new Date(clock.now.getTime() + 3 * 3_600_000);
    expect(await copyPendingFiles(deps(), S, wiring({ none: ['messenger'] }))).toMatchObject({ copied: 0, failed: 2, waiting: 0 });
    expect([(await state(busy.id)).status, (await state(page.id)).status]).toEqual(['FAILED', 'FAILED']);
  });
});
