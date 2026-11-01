// S22 · PR 429 — the shape of a support chat's product-link reference as the shop keeps it (no database here: the
// product page, the beacon's route and the checkout share it). The reference rule itself is @extas/support's.
import { REF_CODE } from '@extas/support/pure';

/** The cookie that keeps the reference (first-party, httpOnly; only the checkout reads it). */
export const SUPPORT_REF_COOKIE = '__Host-extas_sref';

/** The reference a query word or a cookie holds, when it has the right shape; anything else is not ours. */
export function supportRefOf(raw: string | null | undefined): string | null {
  return raw && REF_CODE.test(raw) ? raw : null;
}
