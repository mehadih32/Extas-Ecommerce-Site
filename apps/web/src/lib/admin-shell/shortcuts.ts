// PR 12 follow-up 209 (demo V12.3) — two shortcuts of the admin shell, each behind `admin.shell` and off as it ships:
// - the recent pages: each admin page a person opens is kept on their own staff account (StaffUser.adminPrefs.recent,
//   newest first, PUT /api/admin/look { scope: "me", recent }); the empty palette lists the last `recentPages` of them
//   that the person may still open (lib/admin-shell/search.ts), above "Jump to";
// - the key jumps (`keyJumps`): "g" then a letter opens a section ("g d" the Dashboard, "g o" Orders …), never while
//   typing in a field or with a dialog open; only sections the person may open.
// No React and no database here: the shell, the API and the tests share it.
import type { AdminSectionId } from '@extas/settings';

/** The most recent pages ever kept per person (the setting picks how many of them show, up to this). */
export const RECENT_KEPT = 10;

/** How long after "g" the letter may come. */
export const JUMP_WAIT_MS = 1500;

/** The letter after "g" → the section it opens. */
export const JUMP_KEYS: Readonly<Record<string, AdminSectionId>> = {
  d: 'dashboard',
  o: 'orders',
  p: 'products',
  c: 'customers',
  m: 'messages',
  r: 'reports',
  s: 'settings',
  h: 'help',
};

const PATH = /^\/admin(\/[a-z0-9][a-z0-9-]{0,63}){0,4}$/;

/** An admin page's own path, or null (a query, a hash, the sign-in page or anything else is not kept). */
export function recentPath(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 160 || !PATH.test(v)) return null;
  if (v === '/admin/login' || v.startsWith('/admin/login/')) return null;
  return v;
}

/** The stored list, read leniently: broken entries and repeats are dropped, at most RECENT_KEPT. */
export function readRecent(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const p = recentPath(v);
    if (p && !out.includes(p)) out.push(p);
    if (out.length >= RECENT_KEPT) break;
  }
  return out;
}

/** The list with `path` first (once), cut to `max`. */
export function withRecent(list: readonly string[], path: string, max: number): string[] {
  const keep = Math.max(0, Math.min(RECENT_KEPT, max));
  return [path, ...list.filter((p) => p !== path)].slice(0, keep);
}

/**
 * One key press of a jump: "g" starts waiting (`pending` = when), and a letter of JUMP_KEYS inside the wait names its
 * section. Any other key, or a late letter, ends the wait without a jump.
 */
export function jumpStep(pending: number | null, key: string, now: number): { pending: number | null; section: AdminSectionId | null } {
  if (pending !== null && now - pending <= JUMP_WAIT_MS) {
    const section = JUMP_KEYS[key.toLowerCase()] ?? null;
    if (section) return { pending: null, section };
  }
  if (key === 'g' || key === 'G') return { pending: now, section: null };
  return { pending: null, section: null };
}
