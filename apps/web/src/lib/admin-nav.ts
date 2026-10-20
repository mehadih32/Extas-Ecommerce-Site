// PR 500 — the admin's pages as data. Only pages that exist are listed (no dead links): each later PR adds its own
// entry when it builds its screen. Labels are keys into messages/admin.<lang>.json (`nav.<key>`). `system` pages also
// form the strip of tabs at the top of each System page (demo ZV_TABS: server, cache, images, speed, backup, keys).
export type AdminIcon = 'lock' | 'back' | 'logout';

export interface AdminPage {
  key: string;
  href: string;
  icon: AdminIcon;
  group: 'main' | 'system';
}

export const ADMIN_PAGES: readonly AdminPage[] = [{ key: 'integrations', href: '/admin/integrations', icon: 'lock', group: 'system' }];

export const ADMIN_HOME = ADMIN_PAGES[0]?.href ?? '/admin/login';
export const ADMIN_LOGIN = '/admin/login';
/** The EN | বাং switch's choice (not a secret; read by the server to pick the messages file). */
export const ADMIN_LANG_COOKIE = 'admin_lang';

/** Only a path inside the admin may be a "come back here after sign-in" target (no open redirect). */
export function safeNext(v: string | string[] | undefined | null, fallback: string = ADMIN_HOME): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\/admin(\/[a-z0-9-]+)*$/.test(s) && !s.startsWith(ADMIN_LOGIN) ? s : fallback;
}
