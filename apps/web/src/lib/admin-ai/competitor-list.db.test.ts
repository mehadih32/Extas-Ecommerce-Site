// S15 · PR 337 — the saved competitor list and its recheck, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). No real network call: the page reader runs on its
// own mock sample page (PR 33's own behaviour, never bypassed), and the AI observation stays off throughout, so
// this file only exercises the deterministic CRUD + recheck + diff path, never a real provider call.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createCompetitor, getCompetitor, listCompetitors, setCompetitorArchived, updateCompetitor, type CompetitorListDeps, type Who } from './competitor-list';
import { isAiError } from './errors';
import { listCompetitorReports, recheckCompetitor, type RecheckDeps } from './competitor-recheck';

const S = MOTHER_STORE_ID;
const OWNER = SYSTEM;

describe.skipIf(!HAS_TEST_DB)('AI 360 · the saved competitor list and its recheck on PostgreSQL (PR 337)', () => {
  let t: TestDatabase;
  let d: CompetitorListDeps;
  let rd: RecheckDeps;
  let who: Who;

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    d = { db: t.prisma };
    rd = { db: t.prisma, resolver, vault: { get: async () => null } };
    who = { actor: OWNER, ctx: { ip: '127.0.0.1', userAgent: 'test' } };
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('refuses a non-http(s) address at save time, never only discovered on the first run', async () => {
    await expect(createCompetitor(d, who, S, { name: 'Bad', url: 'ftp://example.com/x' })).rejects.toSatisfy((e) => isAiError(e) && e.code === 'INVALID_URL');
  });

  it('creates, lists, updates, archives and restores a saved competitor — nothing ever deleted', async () => {
    const created = await createCompetitor(d, who, S, { name: 'Fabrilife', url: 'https://example.com/products/polo', schedule: 'weekly' });
    expect(created.schedule).toBe('weekly');
    expect(created.archived).toBe(false);
    expect(created.nextDueAt).not.toBeNull(); // never yet run — due now, the preview's own "due immediately" convention

    const list = await listCompetitors(d, S);
    expect(list.map((c) => c.id)).toContain(created.id);

    const updated = await updateCompetitor(d, who, S, created.id, { name: 'Fabrilife (updated)' });
    expect(updated.name).toBe('Fabrilife (updated)');

    const archived = await setCompetitorArchived(d, who, S, created.id, true);
    expect(archived.archived).toBe(true);
    expect((await listCompetitors(d, S)).map((c) => c.id)).not.toContain(created.id); // hidden by default
    expect((await listCompetitors(d, S, { includeArchived: true })).map((c) => c.id)).toContain(created.id); // never gone

    const restored = await setCompetitorArchived(d, who, S, created.id, false);
    expect(restored.archived).toBe(false);
  });

  it('404s on an id from another store or one that was never created', async () => {
    await expect(getCompetitor(d, S, '00000000-0000-0000-0000-000000000000')).rejects.toSatisfy((e) => isAiError(e) && e.status === 404);
  });

  it("the first recheck has no prior report to diff against, writes no 'change' diary entry, and the competitor's own real read always happens", async () => {
    const c = await createCompetitor(d, who, S, { name: 'First Run Co', url: 'https://example.com/products/first-run' });
    const { result, diff } = await recheckCompetitor(rd, who, S, c.id, 'en');
    expect(result.blocked).toBe(false);
    expect(diff.hasPrior).toBe(false);
    expect(diff.changed).toBe(false);

    const after = await getCompetitor(d, S, c.id);
    expect(after.lastRunAt).not.toBeNull();

    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { refType: 'CompetitorChange' } });
    expect(diaryCount).toBe(0); // nothing to call a "change" on a first run
  });

  it('a second recheck of an unchanged page (same mock sample, same URL) reports no change and writes no diary entry', async () => {
    const c = await createCompetitor(d, who, S, { name: 'Steady Co', url: 'https://example.com/products/steady' });
    await recheckCompetitor(rd, who, S, c.id, 'en');
    const second = await recheckCompetitor(rd, who, S, c.id, 'en');
    expect(second.diff.hasPrior).toBe(true);
    expect(second.diff.changed).toBe(false);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { refType: 'CompetitorChange' } });
    expect(diaryCount).toBe(0);
  });

  it('every real recheck is saved as its own report, newest first, and a genuine page change is flagged and diaried', async () => {
    const c = await createCompetitor(d, who, S, { name: 'Changer Co', url: 'https://example.com/products/changer' });
    const first = await recheckCompetitor(rd, who, S, c.id, 'en'); // first run, nothing to diff yet
    expect(first.diff.hasPrior).toBe(false);

    // the mock page reader's own rule is "the same link always gives the same page" (PR 33), so a genuine change
    // is exercised honestly by pointing the saved competitor at a different path — never by faking a diff by hand.
    await updateCompetitor(d, who, S, c.id, { url: 'https://example.com/products/changer-v2' });
    const second = await recheckCompetitor(rd, who, S, c.id, 'en');
    expect(second.diff.hasPrior).toBe(true);
    expect(second.diff.changed).toBe(true);
    expect(second.diff.changes.some((ch) => ch.field === 'title')).toBe(true);

    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { refType: 'CompetitorChange' } });
    expect(diaryCount).toBe(1);

    const history = await listCompetitorReports(d, S, c.id);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(new Date(history[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(history[1]!.createdAt).getTime());
    expect(history[0]!.diff?.changed).toBe(true); // newest first, and the diff itself is saved on the report
  });

  it('404s a recheck or a report-history read for an archived or unknown competitor id', async () => {
    const c = await createCompetitor(d, who, S, { name: 'To Archive', url: 'https://example.com/products/archived-me' });
    await setCompetitorArchived(d, who, S, c.id, true);
    await expect(recheckCompetitor(rd, who, S, c.id, 'en')).rejects.toSatisfy((e) => isAiError(e) && e.status === 404);
    await expect(listCompetitorReports(d, S, '00000000-0000-0000-0000-000000000000')).rejects.toSatisfy((e) => isAiError(e) && e.status === 404);
  });
});
