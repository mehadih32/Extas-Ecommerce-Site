// S03 · PR 90 (with 571, 99, 575, 104) — what the combo pages read on the server before they draw: the combo services
// as the signed-in person in the mother store (the same checks the API makes), the permissions the buttons follow,
// the store's currency, and each set photo's smallest good rendition for the cards.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import type * as cb from '@extas/combos';
import type { PageAccess } from './admin-page';
import { cardPhotoUrls, combosDeps } from './combos-api';

type Ok = Extract<PageAccess, { kind: 'ok' }>;

export interface CombosAccess {
  deps: cb.CombosDeps;
  who: cb.Who;
  storeId: number;
  perms: { write: boolean; publish: boolean; prices: boolean };
}

export function combosAccess(access: Ok): CombosAccess {
  const storeId = MOTHER_STORE_ID;
  const can = (p: PermissionKey) => access.guard.permissions?.has(p) ?? false;
  return {
    deps: combosDeps(access.deps),
    who: { actor: access.guard.actor, storeId, ctx: access.guard.ctx },
    storeId,
    perms: { write: can('combos.write'), publish: can('combos.publish'), prices: can('combos.prices') },
  };
}

export const storeCurrency = (a: CombosAccess) => a.deps.settings.value('store.currency', { storeId: a.storeId }) as Promise<string>;

/** Each set photo's address for a card (rendered ones only; one still being made shows the drawn pieces). */
export function setPhotoUrls(a: CombosAccess, combos: readonly { id: string; setPhotoAssetId: string | null }[]): Promise<Record<string, string>> {
  return cardPhotoUrls(a.deps, a.storeId, combos);
}
