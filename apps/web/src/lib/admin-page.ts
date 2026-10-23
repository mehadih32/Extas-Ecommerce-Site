// PR 500 — what an admin page needs before it draws: the language, the store name for the header, and the same guard
// the admin API uses (guardAdmin with a permission), so a page never shows more than its API would answer.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import { adminDeps, type AdminDeps, type Guarded } from './admin-auth';
import { deniedMemo, permissionsIn, shellSession } from './admin-shell/session';
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

/** PR 12: once per request (the shell and the page both draw with it). */
export async function adminView(deps: AdminDeps | null = adminDeps()): Promise<AdminView> {
  return deps ? viewOnce() : computeView(null);
}

const viewOnce = cache(() => computeView(adminDeps()));

async function computeView(deps: AdminDeps | null): Promise<AdminView> {
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
 * The same checks as guardAdmin for the page's own request (its cookie, address and browser); null = only a valid
 * session. `storeId` checks the permission in that store (the catalogue pages, PR 21), like the store's own API routes
 * do; without it the key must come from an all-store role. PR 12: the session and the keys are read once per request
 * (lib/admin-shell/session.ts) and shared with the shell; a refused key is remembered so the "no access" state names it.
 */
export async function pageAccess(permission: PermissionKey | null, deps: AdminDeps | null = adminDeps(), storeId?: number): Promise<PageAccess> {
  if (!deps) return { kind: 'unavailable' };
  const s = await shellSession();
  if (s.kind !== 'ok') return s;
  if (!permission) return { kind: 'ok', guard: s.guard, deps: s.deps };
  try {
    const held = await permissionsIn(s.guard.actor.staffUserId as string, storeId ?? null);
    if (!held.has(permission)) {
      deniedMemo().permission = permission;
      return { kind: 'forbidden' };
    }
    return { kind: 'ok', guard: { ...s.guard, permissions: held }, deps: s.deps };
  } catch {
    return { kind: 'unavailable' };
  }
}
