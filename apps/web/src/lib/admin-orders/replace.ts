// S28 · PR 669 — "Send again free" on a delivered order's page (the service is @extas/orders replacement.ts): a defective,
// damaged or wrong piece is sent again with no charge, the old piece comes back, and the case waits on the returns board
// (Returns) like an exchange. The owner's rule `returns.replacement` (off as shipped) says which reasons and how many hours.
// No refund and no wallet credit is ever made here.
import * as od from '@extas/orders';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import type { CommandSpec, FieldSpec } from './spec';

/** `/api/admin/returns/orders/:orderId/replacement` (POST). */
export const replaceUrl = (orderId: string) => `/api/admin/returns/orders/${orderId}/replacement`;

type View = Pick<AdminView, 'dict' | 'lang' | 'locale'>;

/** What the dialog sends: the chosen line as the one item (all its pieces), the reason, the root cause and the note. */
export function replaceBody(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { reason: input.reason, items: [{ orderItemId: input.lineId }] };
  if (typeof input.rootCause === 'string' && input.rootCause) out.rootCause = input.rootCause;
  if (typeof input.reasonNote === 'string' && input.reasonNote.trim()) out.reasonNote = input.reasonNote.trim();
  return out;
}

/** "Send again free" (More actions), or null when this person cannot open one for this order now. */
export function replaceSpec(view: View, o: { id: string; number: string }, rv: od.ReplacementView): CommandSpec | null {
  if (!rv.canOpen || !rv.lines.length) return null;
  const d = view.dict;
  const bn = view.lang === 'bn';
  const fields: FieldSpec[] = [
    { name: 'lineId', kind: 'select', label: t(d, 'orders.dlg.replaceLine'), required: true, options: rv.lines.map((l) => ({ value: l.lineId, label: t(d, 'orders.dlg.replaceLineLabel', { name: l.name, detail: [l.colour, l.size].filter(Boolean).join(' / ') || '-', quantity: String(l.quantity) }) })) },
    { name: 'reason', kind: 'select', label: t(d, 'orders.dlg.replaceReason'), required: true, options: rv.reasons.map((x) => ({ value: x, label: t(d, `orders.dlg.replaceReasons.${x}`) })) },
    ...(rv.reasons.includes('wrong') && rv.rootCauses.length
      ? [{ name: 'rootCause', kind: 'select' as const, label: t(d, 'orders.dlg.replaceCause'), options: [{ value: '', label: t(d, 'orders.dlg.replaceCauseNone') }, ...rv.rootCauses.map((c) => ({ value: c.key, label: bn ? c.bn || c.en : c.en }))] }]
      : []),
    { name: 'reasonNote', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 500 },
  ];
  return {
    id: 'replace',
    label: t(d, 'orders.cmd.replace.label'),
    icon: 'uturn',
    url: replaceUrl(o.id),
    version: null,
    title: t(d, 'orders.cmd.replace.title', { n: o.number }),
    effects: [t(d, 'orders.eff.replaceFree'), t(d, 'orders.eff.replaceNoMoney'), t(d, 'orders.eff.replaceBack', { days: String(rv.oldPieceDays) }), t(d, 'orders.eff.replaceBoard')],
    fields,
    ok: t(d, 'orders.cmd.replace.ok'),
    okTone: 'pri',
    done: t(d, 'orders.cmd.replace.done', { n: o.number }),
  };
}
