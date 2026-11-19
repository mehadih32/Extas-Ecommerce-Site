// PR 1155 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the prototype's money world is written on the sample
// store only, once, and never on a working shop, a store with its own cashbook or a store whose salary list is already set.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB, createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, registry, staffCostsSchema, syncSettings } from '@extas/settings';
import { isSampleStore, seedSampleBooks, seedSampleExtras } from './sample-books';
import { SAMPLE_BOOKS, SAMPLE_EXTRAS } from './data';

const NOW = new Date('2026-11-13T08:00:00Z');
const SAMPLE_PACK_KEY = 'sample-catalogue'; // hardcode-ok: the sample seed's marker (packages/seed/src/sample.ts)
const minor = (taka: number) => Math.round(taka * 100);

describe.skipIf(!HAS_TEST_DB)('the sample store money world (PR 1155)', () => {
  let t: TestDatabase;
  let sample = 0;
  let other = 0;

  beforeAll(async () => {
    t = await createTestDatabase('practice-books');
    [sample, other] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await t.prisma.defaultPackApplication.create({ data: { storeId: sample, packKey: SAMPLE_PACK_KEY, version: 1, summary: {} } });
  }, 120_000);
  afterAll(async () => {
    await t?.drop();
  });

  it('writes nothing on a store that is not the sample store', async () => {
    expect(await isSampleStore(t.prisma, other!)).toBe(false);
    const r = await seedSampleBooks(t.prisma, other!, minor, NOW);
    expect(r).toEqual({ cashEntries: 0, staff: 0, payRows: 0 });
    expect(await t.prisma.cashEntry.count({ where: { storeId: other! } })).toBe(0);
    expect(await t.prisma.storeSettingValue.count({ where: { storeId: other!, key: 'books.staffCosts' } })).toBe(0);
  });

  it('writes the accounts, the movements, the salary list and this month’s pay rows on the sample store', async () => {
    const db = t.prisma;
    const r = await seedSampleBooks(db, sample, minor, NOW);
    expect(r.cashEntries).toBeGreaterThan(SAMPLE_BOOKS.days);
    expect(r.staff).toBe(SAMPLE_BOOKS.staff.length);
    expect(r.payRows).toBe(3);
    const names = (await db.cashAccount.findMany({ where: { storeId: sample }, orderBy: { sortOrder: 'asc' }, select: { nameEn: true } })).map((a) => a.nameEn);
    expect(names).toEqual(SAMPLE_BOOKS.accounts.map((a) => a.nameEn));
    // every row is marked as practice and recorded once
    expect(await db.cashEntry.count({ where: { storeId: sample, source: { not: 'practice' } } })).toBe(0);
    const set = await db.storeSettingValue.findUnique({ where: { storeId_key: { storeId: sample, key: 'books.staffCosts' } } });
    const people = staffCostsSchema.parse(set!.value).people;
    expect(people).toHaveLength(SAMPLE_BOOKS.staff.length + SAMPLE_BOOKS.heads.length);
    // the three paid on the 7th have their salary in the cashbook, at the net the real rule gives (salary + bonus - deduction)
    const rafi = await db.cashEntry.findFirst({ where: { storeId: sample, requestKey: 'salary:2026-11:practice-rafi' } });
    expect(rafi?.amountMinor).toBe(-minor(13_000 + 1_000));
  });

  it('a second run, or a store with its own cashbook, changes nothing', async () => {
    const db = t.prisma;
    const before = await db.cashEntry.count({ where: { storeId: sample } });
    const r = await seedSampleBooks(db, sample, minor, NOW);
    expect(r).toEqual({ cashEntries: 0, staff: 0, payRows: 0 });
    expect(await db.cashEntry.count({ where: { storeId: sample } })).toBe(before);
  });

  it('PR 1156: questions go on practice products only, calendar lines only on the sample store, each once', async () => {
    const db = t.prisma;
    // no practice product: no question anywhere
    expect((await seedSampleExtras(db, other!, NOW)).questions).toBe(0);
    for (const storeId of [sample, other!]) await db.product.create({ data: { storeId, slug: `practice-q-${storeId}`, nameEn: 'Practice polo', isPractice: true } });
    const a = await seedSampleExtras(db, sample, NOW);
    expect(a).toEqual({ questions: SAMPLE_EXTRAS.questions.length, calendar: SAMPLE_EXTRAS.calendar.length });
    const b = await seedSampleExtras(db, other!, NOW);
    expect(b).toEqual({ questions: SAMPLE_EXTRAS.questions.length, calendar: 0 });
    expect(await db.calendarEntry.count({ where: { storeId: other! } })).toBe(0);
    const qs = await db.productQuestion.findMany({ where: { storeId: sample }, select: { productId: true } });
    const practice = await db.product.findMany({ where: { storeId: sample, isPractice: true }, select: { id: true } });
    expect(qs.every((q) => practice.some((x) => x.id === q.productId))).toBe(true);
    expect(await seedSampleExtras(db, sample, NOW)).toEqual({ questions: 0, calendar: 0 });
  });
});
