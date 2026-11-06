// S02 · PR 83 — the running A/B tests as the shop sees them, kept in this process: the module's switch and numbers
// (`experiments.module`) and every running, unarchived test with its version B. The proxy and every shop page read it
// without waiting on the database after the first time; it is read again in the background once older than
// `LIVE_TTL_MS`, and an admin change in this process clears it at once. Without a database (CI, `next build`) nothing
// runs. A visitor seen in a test is written once (AbAssignment, append-only; unique per test and visitor).
import { getPrisma } from '@extas/db/client';
import type { ExperimentsModule } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { storedB, storedShare, type BChanges, type Version } from './model';

export interface LiveTest {
  id: string;
  shareB: number;
  b: BChanges;
  /** When it stops showing B (ms since 1970), or null. */
  endsAt: number | null;
}

export interface Live {
  on: boolean;
  cookieDays: number;
  tests: LiveTest[];
}

/** How long the process keeps the running tests before it reads them again in the background. */
export const LIVE_TTL_MS = 30_000;

const OFF: Live = { on: false, cookieDays: 0, tests: [] };

type Memo = { live: Live; at: number; loading: Promise<void> | null };
const holder = globalThis as unknown as { __abLive?: Map<number, Memo>; __abSeen?: Set<string> };
const memos = (): Map<number, Memo> => (holder.__abLive ??= new Map());

async function readLive(storeId: number): Promise<Live> {
  const r = settingsResolver();
  if (!r) return OFF;
  const mod = (await withTimeout(r.value('experiments.module', { storeId }), settingsTimeoutMs() * 4)) as ExperimentsModule;
  // off: no query for the tests at all
  if (!mod.enabled) return { on: false, cookieDays: mod.cookieDays, tests: [] };
  const rows = await withTimeout(
    getPrisma().abTest.findMany({ where: { storeId, status: 'RUNNING', archivedAt: null }, select: { id: true, split: true, variants: true, endsAt: true }, orderBy: { createdAt: 'asc' } }),
    settingsTimeoutMs() * 4,
  );
  return { on: true, cookieDays: mod.cookieDays, tests: rows.map((t) => ({ id: t.id, shareB: storedShare(t.split), b: storedB(t.variants), endsAt: t.endsAt ? t.endsAt.getTime() : null })) };
}

function refresh(storeId: number, m: Memo): Promise<void> {
  m.loading ??= readLive(storeId)
    .then((live) => {
      m.live = live;
    })
    .catch((e: unknown) => {
      console.warn(`experiments: running tests unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    })
    .finally(() => {
      m.at = Date.now();
      m.loading = null;
    });
  return m.loading;
}

/** The running tests: the first call waits for the database, later ones answer at once and refresh in the background. */
export async function liveTests(storeId: number): Promise<Live> {
  let m = memos().get(storeId);
  if (!m) {
    m = { live: OFF, at: 0, loading: null };
    memos().set(storeId, m);
    await refresh(storeId, m);
    return m.live;
  }
  if (Date.now() - m.at > LIVE_TTL_MS) void refresh(storeId, m);
  return m.live;
}

/** Tests that still show B at `now` (a test past its end shows the shop as it is). */
export const showing = (live: Live, now = Date.now()): LiveTest[] => (live.on ? live.tests.filter((t) => t.endsAt === null || t.endsAt > now) : []);

/** Forget the running tests (an admin change in this process); the next shop request reads them again. */
export function clearLive(): void {
  memos().clear();
}

/** The most visitor and test pairs remembered as written, so a page view does not write again. */
const SEEN_MAX = 50_000;

/** Count a visitor in a test once (in the background; a failure is only a missed count). */
export function recordSeen(storeId: number, testId: string, visitorId: string, variant: Version): void {
  const seen = (holder.__abSeen ??= new Set());
  const k = `${testId}:${visitorId}`;
  if (seen.has(k)) return;
  if (seen.size >= SEEN_MAX) seen.clear();
  seen.add(k);
  void getPrisma()
    .abAssignment.createMany({ data: [{ storeId, testId, visitorId, variant }], skipDuplicates: true })
    .catch(() => seen.delete(k));
}
