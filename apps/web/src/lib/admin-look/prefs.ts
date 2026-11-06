// PR 12 (CN-025, CN-026 (b)) — the signed-in person's own look choices (StaffUser.adminPrefs), once per request, and the
// team's look settings beside them; PR 625 (CN-036): the theme this person's admin is drawn in. Server only.
import { cache } from 'react';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { shellSession } from '../admin-shell/session';
import { BUILT_ADMIN_LOOKS } from '@extas/settings';
import { readPrefs, type GuideDesktop, type LookPrefs, type LookTeam } from './pick';
import { themeOf, type AdminTheme, type ThemeTeam } from './theme';

export interface LookState {
  prefs: LookPrefs;
  team: LookTeam;
  guide: { desktop: GuideDesktop; phone: 'sheet'; perPerson: boolean };
  /** PR 625 (CN-036): what the admin is drawn in for this person (look, light or dark, motion, accent). */
  theme: AdminTheme;
}

const NONE: LookState = {
  prefs: { look: {} },
  team: { pages: {}, perPerson: false },
  guide: { desktop: 'panel', phone: 'sheet', perPerson: false },
  theme: themeOf(null, undefined, BUILT_ADMIN_LOOKS),
};

export const lookState = cache(async (): Promise<LookState> => {
  const s = await shellSession();
  if (s.kind !== 'ok') return NONE;
  const scope = { storeId: MOTHER_STORE_ID };
  const [row, team, guide, theme] = await Promise.all([
    s.deps.db.staffUser.findUnique({ where: { id: s.guard.actor.staffUserId as string }, select: { adminPrefs: true } }).catch(() => null),
    s.deps.resolver.value('admin.look', scope).catch(() => NONE.team) as Promise<LookTeam>,
    s.deps.resolver.value('admin.guideOpens', scope).catch(() => NONE.guide) as Promise<LookState['guide']>,
    s.deps.resolver.value('admin.theme', scope).catch(() => null) as Promise<ThemeTeam | null>,
  ]);
  const prefs = readPrefs(row?.adminPrefs);
  return { prefs, team, guide, theme: themeOf(theme, prefs.theme, BUILT_ADMIN_LOOKS) };
});
