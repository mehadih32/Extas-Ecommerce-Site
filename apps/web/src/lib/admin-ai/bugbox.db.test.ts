// S15 · PR 320 — the "could not do" bug box writer and its read screen, on a real PostgreSQL. `reportCouldNotDo`
// is called straight, not through a route (no HTTP handler exists for it — nothing user-facing writes one; a
// future agent runner will, the same honest gap PR 315/319 already note of their own tables). `bugBoxView` is
// exercised directly, and through `/api/admin/ai/diary`'s `bugReports` field in `diary.db.test.ts`. A throwaway
// database (skipped without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { bugBoxView, reportCouldNotDo, type BugBoxDeps } from './bugbox';
import { isAiError } from './errors';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');

describe.skipIf(!HAS_TEST_DB)('AI 360 · the bug box writer and its read screen on PostgreSQL (PR 320)', () => {
  let t: TestDatabase;
  let deps: BugBoxDeps;

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    deps = { db: t.prisma, now: () => NOW };
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('throws for an unknown agent key, or an empty title/why — never inventing one', async () => {
    await expect(reportCouldNotDo(deps, { storeId: S, agentKey: 'nobody' as never, title: 'x', why: 'y' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'UNKNOWN_AGENT');
    await expect(reportCouldNotDo(deps, { storeId: S, agentKey: 'bhandari', title: '  ', why: 'y' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'INVALID_INPUT');
    await expect(reportCouldNotDo(deps, { storeId: S, agentKey: 'bhandari', title: 'x', why: '  ' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'INVALID_INPUT');
    expect(await t.prisma.aiBugReport.count()).toBe(0);
  });

  it('writes one report for a real agent, following the store, with status "open" and shows up on the view', async () => {
    const { id } = await reportCouldNotDo(deps, { storeId: S, agentKey: 'bhandari', title: 'Could not match 1 RedX parcel', why: 'RedX sent a tracking number we do not have — a person must look' });
    const row = await t.prisma.aiBugReport.findUniqueOrThrow({ where: { id } });
    expect(row.storeId).toBe(S);
    expect(row.status).toBe('open');
    expect(row.agentKey).toBe('bhandari');
    expect(row.reportedBy).toBe('bhandari');

    const view = await bugBoxView(deps, S);
    expect(view[0]?.id).toBe(id);
    expect(view[0]?.title).toContain('RedX');
    expect(view[0]?.status).toBe('open');
  });

  it('an installation-wide report (no store) still shows up, tagged whole-system by its null storeId', async () => {
    const { id } = await reportCouldNotDo(deps, { storeId: null, agentKey: 'prohori', title: 'Could not reach the backup target', why: 'Google Drive quota is full — a person must clear space' });
    const view = await bugBoxView(deps, S);
    expect(view.find((r) => r.id === id)?.storeId).toBeNull();
  });

  it('filters by agent, and refuses an unknown agent filter rather than silently showing everyone', async () => {
    const onlyBhandari = await bugBoxView(deps, S, { agentKey: 'bhandari' });
    expect(onlyBhandari.every((r) => r.agentKey === 'bhandari')).toBe(true);
    expect(onlyBhandari.length).toBeGreaterThan(0);
    await expect(bugBoxView(deps, S, { agentKey: 'nobody' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'UNKNOWN_AGENT');
  });

  it('a report older than the default window falls out of the view but is still in the database', async () => {
    const old = new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000);
    const { id } = await reportCouldNotDo(deps, { storeId: S, agentKey: 'tirondaj', title: 'Could not raise the TikTok budget', why: 'Budget raises always need the owner' });
    await t.prisma.aiBugReport.update({ where: { id }, data: { createdAt: old } });
    expect((await bugBoxView(deps, S)).some((r) => r.id === id)).toBe(false);
    expect((await bugBoxView(deps, S, { days: 30 })).some((r) => r.id === id)).toBe(true);
    expect(await t.prisma.aiBugReport.count({ where: { id } })).toBe(1); // never deleted, only out of the default window
  });
});
