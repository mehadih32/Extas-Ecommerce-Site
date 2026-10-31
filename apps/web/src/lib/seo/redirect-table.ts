// S11 · PR 235 — the redirect table the proxy follows (Blueprint C12.2, PR 590's no-chain rules). Every enabled row of
// the Redirect table forwards permanently with the store's status code (`naming.redirectStatusCode`, 301 as shipped):
// a renamed product or category, a link typed in by hand, a combo asked for with its colours in another order (PR 235),
// and the old shop's links (source `wordpress`), these only while `seo.redirects.wordpressMapLive` is on (go-live day,
// PR 587). A Bengali address forwards to the Bengali twin of the target (`/bn/old` → `/bn/new`); the query is kept.
//
// The proxy is in front of every shop page, so it never waits on the database: the table is kept in this process and
// read again in the background once it is older than `REDIRECT_TABLE_TTL_MS` (an admin change in this process clears it
// at once). Without a database (CI, `next build`) nothing forwards. A followed row counts its hit in the background.
import { getPrisma } from '@extas/db/client';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { BN_PREFIX } from '../shop/lang';

/** The source of the old shop's links (the WordPress map, PR 587). */
export const WORDPRESS_SOURCE = 'wordpress';

export interface RedirectEntry {
  id: string;
  to: string;
  source: string;
}

export interface RedirectTable {
  rows: ReadonlyMap<string, RedirectEntry>;
  status: 301 | 308;
  wordpressLive: boolean;
}

/**
 * The one way an address is written in the Redirect table (PR 590 `normalizePath`, kept in step with it): no scheme or
 * host, no query or fragment, %-escapes decoded, a leading slash, no trailing slash, lower case.
 */
export function redirectKey(path: string): string {
  let p = String(path ?? '').trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep as typed */
  }
  p = p.replace(/^https?:\/\/[^/]+/i, '').replace(/^#/, '').split('?')[0]!.split('#')[0]!;
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/^[/\\]+/, '/'); // never another site (`//other.site`, `/\\other.site`)
  p = p.replace(/\/+$/, '');
  return (p || '/').toLowerCase();
}

/** Where `pathname` (+ `search`) forwards to, or null. Pure: the proxy gives the table it holds. */
export function forwardOf(table: RedirectTable, pathname: string, search = ''): { location: string; status: 301 | 308; id: string } | null {
  const key = redirectKey(pathname);
  const bn = key === BN_PREFIX || key.startsWith(`${BN_PREFIX}/`);
  const own = bn ? key.slice(BN_PREFIX.length) || '/' : key;
  if (own === '/') return null;
  const hit = table.rows.get(own);
  if (!hit) return null;
  if (hit.source === WORDPRESS_SOURCE && !table.wordpressLive) return null;
  const target = redirectKey(hit.to);
  if (target === own) return null;
  const path = bn ? (target === '/' ? BN_PREFIX : `${BN_PREFIX}${target}`) : target;
  return { location: `${path}${search && search !== '?' ? search : ''}`, status: table.status, id: hit.id };
}

/** How long the process keeps the table before it reads it again in the background. */
export const REDIRECT_TABLE_TTL_MS = 30_000;

type Memo = { table: RedirectTable; at: number; loading: Promise<void> | null };
const holder = globalThis as unknown as { __redirectTables?: Map<number, Memo> };

const EMPTY: RedirectTable = { rows: new Map(), status: 301, wordpressLive: false };

async function readTable(storeId: number): Promise<RedirectTable> {
  const r = settingsResolver();
  const [rows, status, set] = await withTimeout(
    Promise.all([
      getPrisma().redirect.findMany({ where: { storeId, enabled: true, archivedAt: null }, select: { id: true, fromPath: true, toPath: true, source: true } }),
      r ? r.value('naming.redirectStatusCode', { storeId }) : Promise.resolve(301 as const),
      r ? r.value('seo.redirects', { storeId }) : Promise.resolve(null),
    ]),
    settingsTimeoutMs() * 4,
  );
  const map = new Map<string, RedirectEntry>();
  for (const row of rows) map.set(redirectKey(row.fromPath), { id: row.id, to: row.toPath, source: row.source });
  return { rows: map, status, wordpressLive: set?.wordpressMapLive ?? false };
}

/** The table as this process holds it now (never waits, except for the very first read of a store). */
export async function redirectTable(storeId: number, now = Date.now()): Promise<RedirectTable> {
  if (!process.env.DATABASE_URL) return EMPTY;
  const map = (holder.__redirectTables ??= new Map());
  let m = map.get(storeId);
  const refresh = (memo: Memo) => {
    memo.loading ??= readTable(storeId)
      .then((t) => {
        memo.table = t;
        memo.at = Date.now();
      })
      .catch((e: unknown) => {
        memo.at = Date.now(); // try again after the TTL, keep the last table
        console.warn(`redirects: table unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
      })
      .finally(() => {
        memo.loading = null;
      });
    return memo.loading;
  };
  if (!m) {
    m = { table: EMPTY, at: 0, loading: null };
    map.set(storeId, m);
    await refresh(m);
    return m.table;
  }
  if (now - m.at > REDIRECT_TABLE_TTL_MS) void refresh(m);
  return m.table;
}

/** An admin change in this process: the next request reads the table again. */
export function forgetRedirectTable(storeId?: number): void {
  const map = holder.__redirectTables;
  if (!map) return;
  if (storeId === undefined) map.clear();
  else map.delete(storeId);
}

/** Counts a followed forward (in the background; a lost count never stops a visitor). */
export function countRedirectHit(id: string, now = new Date()): void {
  if (!process.env.DATABASE_URL) return;
  void getPrisma()
    .redirect.update({ where: { id }, data: { hits: { increment: 1 }, lastHitAt: now } })
    .catch(() => undefined);
}
