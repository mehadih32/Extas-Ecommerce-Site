// PR 12 — the shell's admin API (GET only; nothing here changes anything):
//   GET /api/admin/shell/badges      the sidebar badges: waiting work per section, only what the person may open
//   GET /api/admin/dashboard/queues  "Needs you now": each waiting list with its count, oldest age and link (dashboard.read)
//   GET /api/admin/search?q=         the command palette (lib/admin-shell/search.ts); the empty box also lists the
//                                    person's recent pages while `admin.shell.recentPages` shows some (follow-up 209)
//   GET /api/admin/notifications     the person's own notifications (PR 380: new-device staff sign-ins for security.read;
//                                    PR 431: their late support chats)
//   GET /api/admin/help/<slug>       one admin guide, parsed (lib/admin-shell/guide.ts)
//   GET /api/admin/guide?path=|page= PR 594 (CN-026): the guide of the page at an address (or a page guide by its id),
//                                    with its section's overview and the section's other pages (lib/admin-shell/help-pages.ts)
//   POST /api/admin/guide/ask        PR 334 — the System Q&A agent: one AI-grounded Bengali answer to a question
//                                    about a page's own already-written guide text (lib/admin-ai/guide-qa-dispatch.ts);
//                                    `null` (AI off, Prohori paused, no connection ready, capped, or no guide text)
//                                    leaves the guide panel's own written text as the only answer, exactly as before.
// Every route runs guardAdmin (session, password change, 2FA, and its key when it has one); results are filtered by
// the person's keys in the store, and counts come from one short per-store cache (`admin.shell.badgeCacheSeconds`).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { isOwner, permissionsFor, type PermissionKey } from '@extas/auth';
import { adminDeps, body, errorResponse, fail, guardAdmin, json, readCookie, type AdminDeps, type Guarded } from '../admin-auth';
import { ADMIN_LANG_COOKIE, adminLocale, pickAdminLang, type AdminLang } from '../admin-i18n';
import { guideQaAnswer } from '../admin-ai/guide-qa-dispatch';
import { loginNotes } from '../admin-security/login-notes';
import { readPrefs } from '../admin-look/pick';
import { lateChatNotes } from '../admin-support/late-notes';
import { seasonalNotes } from '../marketing/seasonal-notes';
import { guideDir, readGuide, readPageGuide } from './guide';
import { guidePlace, PAGE_GUIDE_ID, sectionOfGuide, sectionPages } from './help-pages';
import { todoItems } from './model';
import { badgesFrom, cachedQueues, visibleQueues } from './queues';
import { adminSearch } from './search';
import type { ShellViewer } from './sections';
import { hiddenPartsOf } from '../stages/closed';

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
  const [perms, owner, hidden] = await Promise.all([g.permissions ?? permissionsFor(d.db, staffUserId, { storeId: MOTHER_STORE_ID }), isOwner(d.db, staffUserId), hiddenPartsOf(d)]);
  return { g, deps: d, viewer: { perms, owner, hidden } };
}

const shellSettings = async (deps: AdminDeps) =>
  (await deps.resolver.value('admin.shell', { storeId: MOTHER_STORE_ID })) as { badgeCacheSeconds: number; searchPerGroup: number; searchMinChars: number; recentPages?: number };

/** PR 12 follow-up 209: the person's last-opened pages for the empty palette, while `admin.shell.recentPages` shows some. */
async function recentOf(c: ShellCall, max: number, q: string): Promise<string[]> {
  if (max <= 0 || q.trim()) return [];
  const row = await c.deps.db.staffUser.findUnique({ where: { id: c.g.actor.staffUserId as string }, select: { adminPrefs: true } }).catch(() => null);
  return (readPrefs(row?.adminPrefs).recent ?? []).slice(0, max);
}

const queuesFor = async (c: ShellCall) => {
  const s = await shellSettings(c.deps);
  const counts = await cachedQueues({ db: c.deps.db, settings: c.deps.resolver, now: c.deps.now }, MOTHER_STORE_ID, s.badgeCacheSeconds);
  return visibleQueues(counts, c.viewer);
};

export async function badgesHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  try {
    // PR 12 (CN-025): the same rows feed the "To do" drawer, so the tray's dot and list stay current between pages.
    const rows = await queuesFor(c);
    return json({ ok: true, badges: badgesFrom(rows), todo: todoItems(rows) });
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
    const recent = await recentOf(c, s.recentPages ?? 0, q);
    const groups = await adminSearch({ db: c.deps.db, storeId: MOTHER_STORE_ID, lang, viewer: c.viewer, limits: { perGroup: s.searchPerGroup, minChars: s.searchMinChars }, recent }, q);
    return json({ ok: true, q, groups });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function notificationsHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  // No staff notification store yet (approvals, failed syncs and backups, mentions arrive with their PRs). PR 380: the
  // people who may see security (`security.read`) get the new-device staff sign-ins of the last
  // `security.newLoginNoteDays` days. PR 431: the people who may read support get their late chats (support.tickets).
  // Follow-up 650 (PR 280): the people who may see marketing get the seasonal home windows' starts and ends
  // (`marketing.seasonalHome.notes`, off as shipped). Everyone else an honest empty list, never a sample.
  const security = c.viewer.owner || c.viewer.perms.has('security.read');
  const support = c.viewer.owner || c.viewer.perms.has('support.read');
  const marketing = c.viewer.owner || c.viewer.perms.has('marketing.campaigns.read');
  if (!security && !support && !marketing) return json({ ok: true, items: [], unread: 0, source: 'none' });
  try {
    const lang = await langOf(request, c.deps);
    const clock = security || marketing ? Promise.all([c.deps.resolver.value('store.locale', { storeId: MOTHER_STORE_ID }) as Promise<string>, c.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID }) as Promise<string>]).then(([locale, timeZone]) => ({ locale: adminLocale(lang, locale), timeZone })) : null;
    const [late, logins, seasonal] = await Promise.all([
      support ? lateChatNotes(c.deps, c.g, lang) : [],
      security && clock ? clock.then((o) => loginNotes(c.deps, lang, o)) : [],
      marketing && clock ? clock.then((o) => seasonalNotes(c.deps, lang, o)) : [],
    ]);
    const items = [...late, ...logins, ...seasonal];
    const kinds = [late.length ? 'support' : '', logins.length ? 'security' : '', seasonal.length ? 'marketing' : ''].filter(Boolean);
    const source = kinds.length > 1 ? 'mixed' : (kinds[0] ?? 'none');
    return json({ ok: true, items, unread: items.length, source });
  } catch (e) {
    return errorResponse(e);
  }
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

/**
 * The page guide of an address (`?path=`) or by its id (`?page=`): the page's own guide, its section's overview and
 * the section's pages with their titles (a page links to itself when its address has no `[id]` part).
 */
export async function guideHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  try {
    const sp = new URL(request.url).searchParams;
    const id = sp.get('page');
    const place = id ? (PAGE_GUIDE_ID.test(id) ? { section: sectionOfGuide(id), page: id.endsWith('/index') ? null : id } : null) : guidePlace(sp.get('path') ?? '/admin');
    if (!place) return fail(404, 'NOT_FOUND');
    const dir = guideDir();
    const rows = sectionPages(place.section);
    const [overview, guide, titles] = await Promise.all([
      readPageGuide(`${place.section}/index`, dir),
      place.page ? readPageGuide(place.page, dir) : Promise.resolve(null),
      Promise.all(rows.map(async (r) => (await readPageGuide(r.id, dir))?.title ?? null)),
    ]);
    if (!overview && !guide) return fail(404, 'NOT_FOUND');
    const pages = rows.flatMap((r, i) => {
      const title = titles[i];
      return title ? [{ id: r.id, title, href: r.route.includes('[') ? null : r.route }] : [];
    });
    return json({ ok: true, section: place.section, page: guide ? place.page : null, overview, guide, pages });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * PR 334 — POST /api/admin/guide/ask {page, question}: the System Q&A agent, answering one question the owner typed
 * about the page's own already-written guide. Any signed-in staff member may ask (the same openness `guideHandler`
 * already gives the guide's own text — no extra permission, since explaining a page is never itself an action on
 * it). Re-reads the page's own guide server-side by `page` (never trusts anything else a client could send as the
 * "guide text"), so an answer can only ever be grounded in the real, current guide file. `answer` is the grounded
 * Bengali string, or `null` on any honest "no" (AI off, Prohori paused, no connection ready, the monthly cap
 * reached, the page has no guide, or the model answered with nothing usable) — the guide panel's own written text
 * stays the complete, correct answer either way.
 */
export async function guideAskHandler(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const c = await shellCall(request, deps);
  if (c instanceof Response) return c;
  try {
    const input = await body(request);
    const page = typeof input.page === 'string' ? input.page : '';
    const question = typeof input.question === 'string' ? input.question : '';
    const locale = input.locale === 'bn' ? 'bn' : 'en';
    if (!PAGE_GUIDE_ID.test(page) || page.endsWith('/index')) return fail(400, 'INVALID_INPUT', ['page']);
    const guide = await readPageGuide(page, guideDir());
    if (!guide) return fail(404, 'NOT_FOUND');
    const answer = await guideQaAnswer({ db: c.deps.db, resolver: c.deps.resolver, vault: c.deps.vault, now: c.deps.now }, MOTHER_STORE_ID, page, locale, question, guide);
    return json({ ok: true, answer });
  } catch (e) {
    return errorResponse(e);
  }
}
