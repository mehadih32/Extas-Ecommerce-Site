// S02 · PR 600 — the on-page edit mode on a shop request: who may see the bar, whether Edit mode is on for this tab
// (the `extas_pe` cookie the bar sets), and the owner's draft laid over the settings the page draws with.
// - Only while `shop.pageEdit` is on, and only for a signed-in owner (super admin) who may change page layouts
//   (`website.layout.write`): a customer has no admin session, so nothing is read for him and nothing is drawn.
// - Cookie names start with `extas_` / `__Host-admin`, so a page answered with either is never cached (lib/cache-policy).
// - The draft (lib/website/page-edit-admin.ts) changes only what this owner's own page draws until he publishes.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { isOwner } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PageEdit } from '@extas/settings';
import { adminDeps, guardAdmin, SESSION_COOKIE } from '../admin-auth';
import { forwardedRequest, permissionsIn } from '../admin-shell/session';
import type { ShopOverlay } from '../experiments/shop';
import { draftOf, findDraft } from './page-edit-admin';
import type { EditKey } from './page-edit-model';

/** Edit mode is on for this browser (set and cleared by the bar; it only matters with an owner's session). */
export const EDIT_COOKIE = 'extas_pe';

export interface PageEditState {
  staffUserId: string;
  /** Edit mode is on: sections carry their outline marks and the draft is drawn. */
  edit: boolean;
  cfg: PageEdit;
  draft: Partial<Record<EditKey, unknown>>;
}

/** The owner's on-page edit state for this request, or null (a customer, the switch off, anyone else). */
export const pageEditState = cache(async (): Promise<PageEditState | null> => {
  try {
    const jar = await cookies();
    if (!jar.get(SESSION_COOKIE)?.value) return null;
    const deps = adminDeps();
    if (!deps) return null;
    const cfg = (await deps.resolver.value('shop.pageEdit', { storeId: MOTHER_STORE_ID })) as PageEdit;
    if (!cfg?.enabled) return null;
    const g = await guardAdmin(await forwardedRequest(), deps, {});
    if (g instanceof Response) return null;
    const staffUserId = g.actor.staffUserId as string;
    const [owner, perms] = await Promise.all([isOwner(deps.db, staffUserId), permissionsIn(staffUserId, MOTHER_STORE_ID)]);
    if (!owner || !perms.has('website.layout.write')) return null;
    const edit = jar.get(EDIT_COOKIE)?.value === '1';
    const draft = edit ? draftOf((await findDraft(deps.db, staffUserId))?.payload).settings : {};
    return { staffUserId, edit, cfg, draft };
  } catch {
    return null;
  }
});

/** The owner's draft as an overlay on the page's settings (null: nothing to lay over). */
export async function pageEditOverlay(): Promise<ShopOverlay | null> {
  const st = await pageEditState();
  if (!st?.edit || !Object.keys(st.draft).length) return null;
  const draft = st.draft as Record<string, unknown>;
  return { b: { eye: {}, words: {} }, apply: (key, value) => (Object.prototype.hasOwnProperty.call(draft, key) ? draft[key] : value) };
}
