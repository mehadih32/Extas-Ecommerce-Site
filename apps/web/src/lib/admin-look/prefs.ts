// PR 12 (CN-025, CN-026 (b)) — the signed-in person's own look choices (StaffUser.adminPrefs), once per request, and the
// team's look settings beside them. Server only.
import { cache } from 'react';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { shellSession } from '../admin-shell/session';
import { readPrefs, type GuideDesktop, type LookPrefs, type LookTeam } from './pick';

export interface LookState {
  prefs: LookPrefs;
  team: LookTeam;
  guide: { desktop: GuideDesktop; phone: 'sheet'; perPerson: boolean };
}

const NONE: LookState = { prefs: { look: {} }, team: { pages: {}, perPerson: false }, guide: { desktop: 'panel', phone: 'sheet', perPerson: false } };

export const lookState = cache(async (): Promise<LookState> => {
  const s = await shellSession();
  if (s.kind !== 'ok') return NONE;
  const scope = { storeId: MOTHER_STORE_ID };
  const [row, team, guide] = await Promise.all([
    s.deps.db.staffUser.findUnique({ where: { id: s.guard.actor.staffUserId as string }, select: { adminPrefs: true } }).catch(() => null),
    s.deps.resolver.value('admin.look', scope).catch(() => NONE.team) as Promise<LookTeam>,
    s.deps.resolver.value('admin.guideOpens', scope).catch(() => NONE.guide) as Promise<LookState['guide']>,
  ]);
  return { prefs: readPrefs(row?.adminPrefs), team, guide };
});
