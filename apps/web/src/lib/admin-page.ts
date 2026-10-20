// PR 500 — what an admin page needs before it draws: the language, the store name for the header, and the same guard
// the admin API uses (guardAdmin with a permission), so a page never shows more than its API would answer.
import { cookies, headers } from 'next/headers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import { adminDeps, guardAdmin, type AdminDeps, type Guarded } from './admin-auth';
import { ADMIN_LANG_COOKIE, adminDicts, adminLocale, pickAdminLang, type AdminLang } from './admin-i18n';
import type { Dict } from './i18n';
import { displaySettings, settingsTimeoutMs, withTimeout } from './settings';

export interface AdminView {
  lang: AdminLang;
  dict: Dict;
  locale: string;
  timeZone: string;
  /** The store's name (owner data, from settings), or null: the header then shows only "Admin". */
  storeName: string | null;
}

export async function adminView(deps: AdminDeps | null = adminDeps()): Promise<AdminView> {
  const [jar, display] = await Promise.all([cookies(), displaySettings({ resolver: deps?.resolver ?? null })]);
  const lang = pickAdminLang(jar.get(ADMIN_LANG_COOKIE)?.value, display.locale);
  let storeName: string | null = null;
  if (deps && display.source === 'settings') {
    try {
      storeName = await withTimeout(deps.resolver.value('store.name', { storeId: MOTHER_STORE_ID }), settingsTimeoutMs());
    } catch {
      storeName = null;
    }
  }
  return { lang, dict: adminDicts[lang], locale: adminLocale(lang, display.locale), timeZone: display.timeZone, storeName };
}

export type PageAccess =
  | { kind: 'ok'; guard: Guarded; deps: AdminDeps }
  | { kind: 'login' }
  | { kind: 'password' }
  | { kind: 'forbidden' }
  | { kind: 'unavailable' };

/**
 * Runs guardAdmin for the page's own request (its cookie, address and browser); null = only a valid session.
 * `storeId` checks the permission in that store (the catalogue pages, PR 21), like the store's own API routes do.
 */
export async function pageAccess(permission: PermissionKey | null, deps: AdminDeps | null = adminDeps(), storeId?: number): Promise<PageAccess> {
  if (!deps) return { kind: 'unavailable' };
  const h = await headers();
  const forward: Record<string, string> = {};
  for (const name of ['cookie', 'user-agent', 'x-forwarded-for', 'cf-connecting-ip', 'x-real-ip']) {
    const v = h.get(name);
    if (v) forward[name] = v;
  }
  // A GET carries no state change, so the same-site check passes; the session and permission checks are the API's own.
  const g = await guardAdmin(new Request('https://admin.invalid/admin', { headers: forward }), deps, permission ? { permission, ...(storeId ? { storeId } : {}) } : {});
  if (!(g instanceof Response)) return { kind: 'ok', guard: g, deps };
  const code = ((await g.json().catch(() => ({}))) as { error?: string }).error;
  if (g.status === 401) return { kind: 'login' };
  if (code === 'PASSWORD_CHANGE_REQUIRED' || code === 'TWO_FACTOR_SETUP_REQUIRED') return { kind: 'password' };
  if (g.status === 403) return { kind: 'forbidden' };
  return { kind: 'unavailable' };
}
