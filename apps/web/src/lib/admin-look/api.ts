// PR 12 (CN-025, CN-026 (b)) — PUT /api/admin/look: one person's own look, or the team's.
//   { scope: "me",   page, design }  the person's design for a page (design null = follow the team again); kept on their
//                                    staff account (StaffUser.adminPrefs). Refused while `admin.look.perPerson` is off.
//   { scope: "me",   guide }         where the guide opens for them (panel | popup | page | null); while
//                                    `admin.guideOpens.perPerson` is on.
//   { scope: "team", page, design }  the team's design (`admin.look.pages`; null = the page's standard design). Needs
//                                    settings.write; written through the settings resolver with the person as actor
//                                    (the change log keeps who and when).
//   { scope: "team", guide }         where the guide opens for the team (`admin.guideOpens.desktop`), settings.write.
// The page and the design are checked against the look registry; nothing here touches money, orders or customers.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { storeTarget } from '@extas/settings';
import { adminDeps, body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { readPrefs, withGuide, withLook, type GuideDesktop, type LookTeam } from './pick';

const GUIDES: readonly GuideDesktop[] = ['panel', 'popup', 'page'];

/** Page id → its design keys (components/admin/look/registry.ts lookCatalog). */
export type LookCatalog = Record<string, readonly string[]>;

type Ask = { kind: 'look'; page: string; design: string | null } | { kind: 'guide'; guide: GuideDesktop | null };

function readAsk(b: Record<string, unknown>, catalog: LookCatalog): Ask | string {
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
      const next = ask.kind === 'look' ? withLook(prefs, ask.page, ask.design) : withGuide(prefs, ask.guide);
      await d.db.staffUser.update({ where: { id: actorId }, data: { adminPrefs: next as object } });
      return json({ ok: true, scope, prefs: next });
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
