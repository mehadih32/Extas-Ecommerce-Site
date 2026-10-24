// PR 12 (CN-025) — which design an admin page is drawn in (demo V12.4 a3Cur), and the person's own look choices.
// The pick order: `?design=X` (a preview, never saved) → the person's own choice (kept on their staff account,
// StaffUser.adminPrefs, only while `admin.look.perPerson` is on) → the team's choice (`admin.look.pages`) → the page's
// standard design in the registry (components/admin/look/registry.ts) → the first design it has. A key the page does
// not have is skipped at every step, so a removed design can never leave a page blank.
// CN-026 (b): where the guide opens (`admin.guideOpens`) follows the same idea: the person's own choice while
// `perPerson` is on, else the team's. No React and no database here: the pages, the API and the tests share it.
import { z } from 'zod';

export type GuideDesktop = 'panel' | 'popup' | 'page';

/** What one person chose for themselves (StaffUser.adminPrefs). Unknown or broken parts are dropped when read. */
export interface LookPrefs {
  /** Page id → design key. */
  look: Record<string, string>;
  /** Where the guide opens on desktop, when they chose. */
  guide?: GuideDesktop;
}

const prefsSchema = z.object({
  look: z.record(z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), z.string().regex(/^[A-Z]$/)).optional(),
  guide: z.enum(['panel', 'popup', 'page']).optional(),
});

/** The stored JSON as prefs (anything unreadable becomes "no choice"). */
export function readPrefs(raw: unknown): LookPrefs {
  const p = prefsSchema.safeParse(raw ?? {});
  if (!p.success) return { look: {} };
  return { look: { ...(p.data.look ?? {}) }, ...(p.data.guide ? { guide: p.data.guide } : {}) };
}

/** The prefs with one page's design set (a key) or cleared (null = follow the team). */
export function withLook(prefs: LookPrefs, page: string, design: string | null): LookPrefs {
  const look = { ...prefs.look };
  if (design) look[page] = design;
  else delete look[page];
  return { ...prefs, look };
}

/** The prefs with the guide choice set or cleared. */
export function withGuide(prefs: LookPrefs, guide: GuideDesktop | null): LookPrefs {
  const out: LookPrefs = { look: { ...prefs.look } };
  if (guide) out.guide = guide;
  return out;
}

export interface LookTeam {
  pages: Record<string, string>;
  perPerson: boolean;
}

export type PickedFrom = 'preview' | 'mine' | 'team' | 'standard';

/** The design a page is drawn in, and where that choice came from. */
export function pickDesign(available: readonly string[], standard: string, q: { preview?: string | null; mine?: string | null; team: LookTeam; page: string }): { key: string; from: PickedFrom } {
  const has = (k: string | null | undefined): k is string => !!k && available.includes(k);
  if (has(q.preview)) return { key: q.preview, from: 'preview' };
  if (q.team.perPerson && has(q.mine)) return { key: q.mine, from: 'mine' };
  const team = q.team.pages[q.page];
  if (has(team)) return { key: team, from: 'team' };
  if (has(standard)) return { key: standard, from: 'standard' };
  return { key: available[0] ?? standard, from: 'standard' };
}

/** The design the team sees on a page (what "Team default" marks). */
export function teamDesign(available: readonly string[], standard: string, team: LookTeam, page: string): string {
  return pickDesign(available, standard, { team: { ...team, perPerson: false }, page }).key;
}

/** Where the guide opens for this person on desktop. */
export function guideModeOf(setting: { desktop: GuideDesktop; perPerson: boolean }, prefs: LookPrefs): GuideDesktop {
  return setting.perPerson && prefs.guide ? prefs.guide : setting.desktop;
}
