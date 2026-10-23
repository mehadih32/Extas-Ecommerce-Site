// PR 12 — the shell's admin API (GET only; nothing here changes anything):
//   GET /api/admin/shell/badges      the sidebar badges: waiting work per section, only what the person may open
//   GET /api/admin/dashboard/queues  "Needs you now": each waiting list with its count, oldest age and link (dashboard.read)
//   GET /api/admin/search?q=         the command palette (lib/admin-shell/search.ts)
//   GET /api/admin/notifications     the person's own notifications (none yet: no staff notification store exists)
//   GET /api/admin/help/<slug>       one admin guide, parsed (lib/admin-shell/guide.ts)
// Every route runs guardAdmin (session, password change, 2FA, and its key when it has one); results are filtered by
// the person's keys in the store, and counts come from one short per-store cache (`admin.shell.badgeCacheSeconds`).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { isOwner, permissionsFor, type PermissionKey } from '@extas/auth';
import { adminDeps, errorResponse, fail, guardAdmin, json, readCookie, type AdminDeps, type Guarded } from '../admin-auth';
import { ADMIN_LANG_COOKIE, pickAdminLang, type AdminLang } from '../admin-i18n';
import { guideDir, readGuide } from './guide';
import { badgesFrom, cachedQueues, visibleQueues } from './queues';
import { adminSearch } from './search';
import type { ShellViewer } from './sections';

interface ShellCall {
  g: Guarded;
  deps: AdminDeps;
  viewer: ShellViewer;
}

async function shellCall(request: Request, deps: AdminDeps | null, permission?: PermissionKey): Promise<ShellCall | Response> {
  const g = await guardAdmin(request, deps, permission ? { permission, storeId: MOTHER_STORE_ID } : {});
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  const staffUserId = g.actor.staffUserId as string;
  const [perms, owner] = await Promise.all([g.permissions ?? permissionsFor(d.db, staffUserId, { storeId: MOTHER_STORE_ID }), isOwner(d.db, staffUserId)]);
  return { g, deps: d, viewer: { perms, owner } };
}

const shellSettings = async (deps: AdminDeps) =>
  (await deps.resolver.value('admin.shell', { storeId: MOTHER_STORE_ID })) as { badgeCacheSeconds: number; searchPerGroup: number; searchMinChars: number };

const queuesFor = async (c: ShellCall) => {
  const s = await shellSettings(c.deps);
  const counts = await cachedQueues({ db: c.deps.db, settings: c.deps.resolver, now: c.deps.now }, MOTHER_STORE_ID, s.badgeCacheSeconds);
  return visibleQueues(counts, c.viewer);
};

export async function badgesHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  try {
    return json({ ok: true, badges: badgesFrom(await queuesFor(c)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function queuesHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps, 'dashboard.read');
  if (c instanceof Response) return c;
  try {
    const rows = await queuesFor(c);
    return json({ ok: true, queues: rows.map((r) => ({ id: r.id, n: r.n, oldest: r.oldest, href: r.def.href, section: r.def.section })) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** The admin's language for an API answer: the switch's cookie, else the store's language. */
async function langOf(request: Request, deps: AdminDeps): Promise<AdminLang> {
  const locale = (await deps.resolver.value('store.locale', { storeId: MOTHER_STORE_ID }).catch(() => null)) as string | null;
  return pickAdminLang(readCookie(request, ADMIN_LANG_COOKIE), locale);
}

export async function searchHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  try {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const [s, lang] = await Promise.all([shellSettings(c.deps), langOf(request, c.deps)]);
    const groups = await adminSearch({ db: c.deps.db, storeId: MOTHER_STORE_ID, lang, viewer: c.viewer, limits: { perGroup: s.searchPerGroup, minChars: s.searchMinChars } }, q);
    return json({ ok: true, q, groups });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function notificationsHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  // No staff notification store yet (approvals, failed syncs and backups, mentions arrive with their PRs): an honest
  // empty list, never a sample.
  return json({ ok: true, items: [], unread: 0, source: 'none' });
}

export async function helpHandler(request: Request, slug: string, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  try {
    const guide = await readGuide(slug, guideDir());
    return guide ? json({ ok: true, guide }) : fail(404, 'NOT_FOUND');
  } catch (e) {
    return errorResponse(e);
  }
}
