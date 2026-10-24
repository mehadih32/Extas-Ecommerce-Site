// S06 · PR 519 — the identity graph's words on one order's admin page: the timeline line of the link step ("the same
// person as 1001 (same phone) · 1005 (same device)", "a new identity", "2 identities joined into one") and how one
// earlier order of the same person is tied to this one. Words from messages/admin-orders.<lang>.json
// (`orders.identity.*`). Read only.
import type { IdentityVia } from '@extas/orders';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

/** How one order of the identity is tied to this one, in words ("same phone · same device"). */
export function viaText(view: AdminView, via: readonly IdentityVia[]): string {
  return via.map((v) => t(view.dict, `orders.identity.via.${v}`)).join(' · ');
}

/** The link step's timeline line, from its event data (`order.identityLinked`). */
export function identitySummary(view: AdminView, data: unknown): string | null {
  const x = (data ?? {}) as { created?: boolean; joined?: Partial<Record<'phone' | 'device' | 'nameAddress', string[]>>; merged?: number; after?: string };
  const d = view.dict;
  const parts: string[] = [];
  const joined = (['phone', 'device', 'nameAddress'] as const).flatMap((k) => (x.joined?.[k]?.length ? [`${x.joined[k]!.join(', ')} (${t(d, `orders.identity.via.${k}`)})`] : []));
  if (joined.length) parts.push(t(d, 'orders.identity.joined', { orders: joined.join(' · ') }));
  else if (x.created) parts.push(t(d, 'orders.identity.new'));
  if (x.merged) parts.push(t(d, 'orders.identity.merged', { n: x.merged + 1 }));
  if (x.after === 'edit') parts.push(t(d, 'orders.identity.afterEdit'));
  return parts.length ? parts.join(' · ') : null;
}
