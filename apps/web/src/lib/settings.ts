// The app's door to the settings framework (PR 491/492). One resolver per server process, created on first use and
// only when the server gave the app a database (DATABASE_URL, through PgBouncer). CI and `next build` have no
// database: every caller then gets the environment fallback, and nothing waits on a connection.
import { getPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { listSettingsForAdmin, messages, prismaBackend, registry, SettingsResolver, type SettingsChange } from '@extas/settings';
import { locale as envLocale, timeZone as envTimeZone } from './format';

export type AppResolver = SettingsResolver<typeof registry>;

// Technical defaults; the server may set its own through the environment.
const intEnv = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
/** How long a page waits for the settings before using the fallback. */
export const settingsTimeoutMs = () => intEnv('SETTINGS_DB_TIMEOUT_MS', 1_500);
/** After a failed read, how long the fallback is used before the database is tried again. */
const retryAfterMs = () => intEnv('SETTINGS_DB_RETRY_MS', 30_000);

const holder = globalThis as unknown as { __settingsResolver?: AppResolver; __settingsDownUntil?: number; __settingsChanged?: (change: SettingsChange) => void };

/** PR 602: who hears that a setting changed (the cache, lib/cache.ts, sets it when it starts). */
export function onSettingsChanged(fn: (change: SettingsChange) => void): void {
  holder.__settingsChanged = fn;
}

export function settingsResolver(): AppResolver | null {
  if (!process.env.DATABASE_URL) return null;
  holder.__settingsResolver ??= new SettingsResolver(prismaBackend(getPrisma()), registry, {
    checkIntervalMs: intEnv('SETTINGS_CACHE_CHECK_MS', 2_000),
    onStale: (e) => console.warn(`settings: database unreachable, serving the last values (${errText(e)})`),
    onChange: (c) => holder.__settingsChanged?.(c),
  });
  return holder.__settingsResolver;
}

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error';
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface Display {
  locale: string;
  timeZone: string;
  source: 'settings' | 'env';
}

/** Locale and time zone for a page: through the resolver when the database answers, else from the environment. */
export async function displaySettings(
  opts: { resolver?: AppResolver | null; storeId?: number; timeoutMs?: number; now?: () => number } = {},
): Promise<Display> {
  const fallback: Display = { locale: envLocale(), timeZone: envTimeZone(), source: 'env' };
  const resolver = opts.resolver === undefined ? settingsResolver() : opts.resolver;
  const now = opts.now ?? Date.now;
  if (!resolver || (holder.__settingsDownUntil ?? 0) > now()) return fallback;
  const storeId = opts.storeId ?? MOTHER_STORE_ID;
  try {
    const [loc, tz] = await withTimeout(
      Promise.all([resolver.value('store.locale', { storeId }), resolver.value('store.timeZone', { storeId })]),
      opts.timeoutMs ?? settingsTimeoutMs(),
    );
    holder.__settingsDownUntil = undefined;
    return { locale: loc, timeZone: tz, source: 'settings' };
  } catch (e) {
    holder.__settingsDownUntil = now() + retryAfterMs();
    console.warn(`settings: using the environment fallback (${errText(e)})`);
    return fallback;
  }
}

/** Clears the "database down" pause (tests). */
export function resetSettingsPause(): void {
  holder.__settingsDownUntil = undefined;
}

/**
 * GET /api/admin/settings — every setting with its effective value and source (store, installation or default).
 * Owner data (PR 509) and vault references (PR 493) never leave with a value (listSettingsForAdmin redacts them).
 */
export async function adminSettingsResponse(url: string, resolver: AppResolver | null): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  if (!resolver) return Response.json({ ok: false, error: 'database-not-configured' }, { status: 503, headers });
  const raw = new URL(url).searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) {
    return Response.json({ ok: false, error: 'invalid-store-id' }, { status: 400, headers });
  }
  try {
    const settings = await withTimeout(listSettingsForAdmin(resolver, messages, { storeId }), settingsTimeoutMs());
    return Response.json({ ok: true, storeId, settings }, { headers });
  } catch (e) {
    console.warn(`settings: admin list failed (${errText(e)})`);
    return Response.json({ ok: false, error: 'database-unreachable' }, { status: 503, headers });
  }
}
