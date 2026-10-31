// S11 · PR 235 — the 404 report's counter. The shop's "page not found" (app/(shop)/(store)/not-found.tsx) counts the
// address it was asked for (`seo.notFound`): one row per address with how often, the first and the last time and the
// site the visitor came from (its address without the query, which can hold someone's data). At most `maxRows`
// different addresses are kept, so a scan cannot fill the database; a counted address keeps counting. Never waits on
// the page: the count runs in the background and a lost count never stops a visitor.
import { getPrisma } from '@extas/db/client';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { redirectKey } from './redirect-table';

/** Addresses longer than this are not counted (no real page has one). */
export const NOT_FOUND_PATH_MAX = 300;

/** The referring page without its query or fragment, or null. */
export function refererOf(header: string | null | undefined): string | null {
  if (!header) return null;
  try {
    const u = new URL(header);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.origin}${u.pathname}`.slice(0, NOT_FOUND_PATH_MAX);
  } catch {
    return null;
  }
}

export interface NotFoundDb {
  notFoundHit: {
    findUnique(a: { where: { storeId_path: { storeId: number; path: string } }; select: { id: true } }): Promise<{ id: string } | null>;
    update(a: { where: { id: string }; data: { hits: { increment: number }; lastSeenAt: Date; referrer?: string } }): Promise<unknown>;
    count(a: { where: { storeId: number } }): Promise<number>;
    create(a: { data: { storeId: number; path: string; referrer: string | null; firstSeenAt: Date; lastSeenAt: Date } }): Promise<unknown>;
  };
}

/** Counts one visit to an address with no page (the caller has checked `seo.notFound.record`). */
export async function countNotFound(db: NotFoundDb, storeId: number, rawPath: string, referrer: string | null, maxRows: number, now = new Date()): Promise<'counted' | 'new' | 'full' | 'skipped'> {
  const path = redirectKey(rawPath);
  if (path === '/' || path.length > NOT_FOUND_PATH_MAX) return 'skipped';
  const row = await db.notFoundHit.findUnique({ where: { storeId_path: { storeId, path } }, select: { id: true } });
  if (row) {
    await db.notFoundHit.update({ where: { id: row.id }, data: { hits: { increment: 1 }, lastSeenAt: now, ...(referrer ? { referrer } : {}) } });
    return 'counted';
  }
  if ((await db.notFoundHit.count({ where: { storeId } })) >= maxRows) return 'full';
  try {
    await db.notFoundHit.create({ data: { storeId, path, referrer, firstSeenAt: now, lastSeenAt: now } });
    return 'new';
  } catch {
    // two visits at once: the other one made the row
    await db.notFoundHit.update({ where: { id: (await db.notFoundHit.findUnique({ where: { storeId_path: { storeId, path } }, select: { id: true } }))?.id ?? '' }, data: { hits: { increment: 1 }, lastSeenAt: now } }).catch(() => undefined);
    return 'counted';
  }
}

/** The not-found page's call: reads the setting and counts in the background. */
export function recordNotFound(storeId: number, path: string, refererHeader: string | null): void {
  const r = settingsResolver();
  if (!r || !process.env.DATABASE_URL) return;
  void (async () => {
    const set = await withTimeout(r.value('seo.notFound', { storeId }), settingsTimeoutMs());
    if (!set.record) return;
    await countNotFound(getPrisma() as unknown as NotFoundDb, storeId, path, refererOf(refererHeader), set.maxRows);
  })().catch(() => undefined);
}
