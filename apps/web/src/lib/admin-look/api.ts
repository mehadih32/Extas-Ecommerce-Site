// PR 12 (CN-025, CN-026 (b)) — PUT /api/admin/look: one person's own look, or the team's.
//   { scope: "me",   page, design }  the person's design for a page (design null = follow the team again); kept on their
//                                    staff account (StaffUser.adminPrefs). Refused while `admin.look.perPerson` is off.
//   { scope: "me",   guide }         where the guide opens for them (panel | popup | page | null); while
//                                    `admin.guideOpens.perPerson` is on.
//   { scope: "team", page, design }  the team's design (`admin.look.pages`; null = the page's standard design). Needs
//                                    settings.write; written through the settings resolver with the person as actor
//                                    (the change log keeps who and when).
//   { scope: "team", guide }         where the guide opens for the team (`admin.guideOpens.desktop`), settings.write.
// PR 625 (CN-036) — the theme:
//   { scope: "me",   theme: { mode?, motion?, look? } }   the person's light or dark (the moon button), their own
//                                    "Reduce motion" and look (only a built look); null clears a part. Always their own
//                                    choice (no per-person switch): it changes only how the admin looks to them.
//                                    PR 630: `accent` too (#RRGGBB; their own accent instead of the team's).
//   { scope: "me",   seen: ISO time }  PR 626: the notifications panel's "Mark all read" (a note newer than it is unread).
//   { scope: "me",   recent: "/admin/…" }  PR 12 follow-up 209: the admin page the person just opened goes first in their
//                                    recent pages (lib/admin-shell/shortcuts.ts); refused while `admin.shell.recentPages`
//                                    is 0. Only an admin page's own path is kept.
//   { scope: "team", theme: { look?, accent?, reduceMotion? } }   the team's look, accent colour and "Reduce motion"
//                                    (`admin.theme`), settings.write, through the settings resolver (the change log).
// The page and the design are checked against the look registry; nothing here touches money, orders or customers.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { accentSchema, adminThemeSchema, BUILT_ADMIN_LOOKS, storeTarget, type AdminTheme } from '@extas/settings';
import { z } from 'zod';
import { adminDeps, body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { readPrefs, withGuide, withLook, type GuideDesktop, type LookTeam } from './pick';
import { RECENT_KEPT, recentPath, withRecent } from '../admin-shell/shortcuts';
import { withTheme } from './theme';

const GUIDES: readonly GuideDesktop[] = ['panel', 'popup', 'page'];

/** Page id → its design keys (components/admin/look/registry.ts lookCatalog). */
export type LookCatalog = Record<string, readonly string[]>;

type MeTheme = { look?: string | null; mode?: 'light' | 'dark' | null; motion?: 'full' | 'reduce' | null; accent?: string | null };
type TeamTheme = Partial<AdminTheme>;
type Ask =
  | { kind: 'look'; page: string; design: string | null }
  | { kind: 'guide'; guide: GuideDesktop | null }
  | { kind: 'theme'; me: MeTheme; team: TeamTheme }
  | { kind: 'seen'; at: string }
  | { kind: 'recent'; path: string };

const builtLook = z.string().refine((v) => (BUILT_ADMIN_LOOKS as readonly string[]).includes(v));
const meThemeSchema = z
  .object({ look: builtLook.nullable().optional(), mode: z.enum(['light', 'dark']).nullable().optional(), motion: z.enum(['full', 'reduce']).nullable().optional(), accent: accentSchema.nullable().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const teamThemeSchema = adminThemeSchema.partial().strict().refine((v) => Object.keys(v).length > 0);

function readAsk(b: Record<string, unknown>, catalog: LookCatalog): Ask | string {
  if ('recent' in b) {
    const path = recentPath(b.recent);
    return path && b.scope === 'me' ? { kind: 'recent', path } : 'recent';
  }
  if ('seen' in b) {
    const p = z.iso.datetime().safeParse(b.seen);
    return p.success && b.scope === 'me' ? { kind: 'seen', at: p.data } : 'seen';
  }
  if ('theme' in b) {
    const schema = b.scope === 'team' ? teamThemeSchema : meThemeSchema;
    const p = schema.safeParse(b.theme);
    if (!p.success) return 'theme';
    return b.scope === 'team' ? { kind: 'theme', me: {}, team: p.data as TeamTheme } : { kind: 'theme', me: p.data as MeTheme, team: {} };
  }
  if ('guide' in b) {
    const g = b.guide;
    if (g === null || (typeof g === 'string' && (GUIDES as readonly string[]).includes(g))) return { kind: 'guide', guide: g as GuideDesktop | null };
    return 'guide';
  }
  const page = b.page;
  if (typeof page !== 'string' || !Object.prototype.hasOwnProperty.call(catalog, page)) return 'page';
  const design = b.design;
  if (design === null) return { kind: 'look', page, design: null };
  if (typeof design !== 'string' || !catalog[page]!.includes(design)) return 'design';
  return { kind: 'look', page, design };
}

export async function lookHandler(request: Request, catalog: LookCatalog, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  if (request.method !== 'PUT') return fail(405, 'METHOD_NOT_ALLOWED');
  const b = await body(request);
  const scope = b.scope;
  if (scope !== 'me' && scope !== 'team') return fail(400, 'VALIDATION', ['scope']);
  const ask = readAsk(b, catalog);
  if (typeof ask === 'string') return fail(400, 'VALIDATION', [ask]);
  const g = await guardAdmin(request, deps, scope === 'team' ? { permission: 'settings.write', storeId: MOTHER_STORE_ID } : {});
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  const actorId = g.actor.staffUserId as string;
  const target = storeTarget(MOTHER_STORE_ID);
  const scopeOf = { storeId: MOTHER_STORE_ID };
  try {
    if (scope === 'me') {
      const [team, guide, row] = await Promise.all([
        d.resolver.value('admin.look', scopeOf) as Promise<LookTeam>,
        d.resolver.value('admin.guideOpens', scopeOf) as Promise<{ perPerson: boolean }>,
        d.db.staffUser.findUnique({ where: { id: actorId }, select: { adminPrefs: true } }),
      ]);
      if (ask.kind === 'look' && !team.perPerson) return fail(403, 'PER_PERSON_OFF');
      if (ask.kind === 'guide' && !guide.perPerson) return fail(403, 'PER_PERSON_OFF');
      const prefs = readPrefs(row?.adminPrefs);
      if (ask.kind === 'recent') {
        const shell = (await d.resolver.value('admin.shell', scopeOf)) as { recentPages?: number };
        const max = shell.recentPages ?? 0;
        if (max <= 0) return fail(403, 'RECENT_OFF');
        // Kept up to the most the setting allows, so raising the number later shows pages already opened.
        const recent = withRecent(prefs.recent ?? [], ask.path, RECENT_KEPT);
        if (recent.join('|') === (prefs.recent ?? []).join('|')) return json({ ok: true, scope, recent });
        await d.db.staffUser.update({ where: { id: actorId }, data: { adminPrefs: { ...prefs, recent } as object } });
        return json({ ok: true, scope, recent });
      }
      const next = ask.kind === 'look' ? withLook(prefs, ask.page, ask.design) : ask.kind === 'guide' ? withGuide(prefs, ask.guide) : ask.kind === 'seen' ? { ...prefs, seen: ask.at } : withTheme(prefs, ask.me);
      await d.db.staffUser.update({ where: { id: actorId }, data: { adminPrefs: next as object } });
      return json({ ok: true, scope, prefs: next });
    }
    if (ask.kind === 'seen' || ask.kind === 'recent') return fail(400, 'VALIDATION', ['scope']);
    if (ask.kind === 'theme') {
      const cur = (await d.resolver.value('admin.theme', scopeOf)) as AdminTheme;
      const next = adminThemeSchema.parse({ ...cur, ...ask.team });
      await d.resolver.set('admin.theme', next, target, { actorId, reason: `admin look: theme ${Object.keys(ask.team).join(', ')}` });
      return json({ ok: true, scope, theme: next });
    }
    if (ask.kind === 'look') {
      const team = (await d.resolver.value('admin.look', scopeOf)) as LookTeam;
      const pages = { ...team.pages };
      if (ask.design) pages[ask.page] = ask.design;
      else delete pages[ask.page];
      await d.resolver.set('admin.look', { ...team, pages }, target, { actorId, reason: `admin look: team design for ${ask.page} → ${ask.design ?? 'standard'}` });
      return json({ ok: true, scope, pages });
    }
    const cur = (await d.resolver.value('admin.guideOpens', scopeOf)) as { desktop: GuideDesktop; phone: 'sheet'; perPerson: boolean };
    const next = { ...cur, desktop: ask.guide ?? 'panel' };
    await d.resolver.set('admin.guideOpens', next, target, { actorId, reason: `admin look: the guide opens in ${next.desktop}` });
    return json({ ok: true, scope, guide: next });
  } catch (e) {
    return errorResponse(e);
  }
}
