// S28 · PR 665 — "Merge" on an order's page (the service is @extas/orders merge-into-one.ts):
//   · "Merge" and "Merge + call" in More actions, on the order that STAYS: which of the same person's other open orders to fold
//     in, which of their lines to leave out, and (only when an address differs) a yes to go on with this order's address;
//   · after it the page's own commands edit the kept order (take a moved line out, change a size, add a piece), then Confirm;
//   · the timeline words of the two events.
// Nothing here decides a rule: the switch, the look-back days and the address rule are the owner's settings read by the service.
import * as od from '@extas/orders';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import type { CommandSpec, FieldSpec } from './spec';

/** `/api/admin/orders/:id/merge-into` (GET: the panel; POST: fold orders into this one). */
export const mergeUrl = (orderId: string) => `/api/admin/orders/${orderId}/merge-into`;

type View = Pick<AdminView, 'dict' | 'lang' | 'locale'>;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** What the dialog sends, as the service takes it: the kept order is the page's own; `yes` flags become booleans. */
export function mergeBody(mainOrderId: string, input: Record<string, unknown>): Record<string, unknown> {
  const orders = list(input.orders);
  const leave = list(input.leaveOut);
  const out: Record<string, unknown> = { mainOrderId, sources: orders.map((orderId) => ({ orderId })) };
  if (leave.length) out.leaveOutLineIds = leave;
  if (input.confirmAddress === 'yes') out.confirmAddress = true;
  if (input.call === 'yes') out.call = true;
  if (typeof input.note === 'string' && input.note.trim()) out.note = input.note.trim();
  return out;
}

/** "Merge" and "Merge + call" (More actions), or [] when this person cannot merge into this order now or nothing can be folded in. */
export function mergeSpecs(view: View, o: { id: string; number: string; currency: string }, m: od.MergeView): CommandSpec[] {
  const usable = m.mates.filter((x) => x.blocked === null);
  if (!m.canMerge || !usable.length) return [];
  const d = view.dict;
  const money = moneyOf(o.currency, view.locale);
  const fmt = (v: number) => formatMoney(v, money);
  const orders: FieldSpec = {
    name: 'orders',
    kind: 'checks',
    label: t(d, 'orders.dlg.mergeOrders'),
    required: true,
    value: [],
    options: usable.map((x) => ({ value: x.orderId, label: t(d, 'orders.dlg.mergeOrderLine', { number: x.number, lines: String(x.lines.length), total: fmt(x.totalMinor) }) })),
  };
  const leave: FieldSpec = {
    name: 'leaveOut',
    kind: 'checks',
    label: t(d, 'orders.dlg.mergeLeaveOut'),
    value: [],
    options: usable.flatMap((x) => x.lines.map((l) => ({ value: l.lineId, label: t(d, 'orders.dlg.mergeLineLabel', { number: x.number, name: l.name, detail: [l.colour, l.size].filter(Boolean).join(' / ') || '-', quantity: String(l.quantity), total: fmt(l.lineTotalMinor) }) }))),
  };
  const differs = usable.filter((x) => !x.sameAddress);
  const fields: FieldSpec[] = [orders, leave];
  if (differs.length && m.differentAddress === 'ask') {
    fields.push({
      name: 'confirmAddress',
      kind: 'select',
      label: t(d, 'orders.dlg.mergeAddress'),
      value: '',
      options: [
        { value: '', label: t(d, 'orders.dlg.mergeAddressStop') },
        { value: 'yes', label: t(d, 'orders.dlg.mergeAddressGo') },
      ],
    });
  }
  fields.push({ name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 500 });
  const effects = [
    t(d, 'orders.eff.mergeMove'),
    t(d, 'orders.eff.mergeCancel'),
    t(d, 'orders.eff.mergeCharge'),
    ...(differs.length ? [t(d, 'orders.eff.mergeAddress', { numbers: differs.map((x) => x.number).join(', ') })] : []),
    t(d, 'orders.eff.mergeThenEdit'),
  ];
  const base = { icon: 'layers' as const, url: mergeUrl(o.id), version: null, effects, fields, okTone: 'pri' as const };
  return [
    { ...base, id: 'merge', label: t(d, 'orders.cmd.merge.label'), title: t(d, 'orders.cmd.merge.title', { n: o.number }), ok: t(d, 'orders.cmd.merge.ok'), done: t(d, 'orders.cmd.merge.done', { n: o.number }) },
    { ...base, id: 'mergeCall', label: t(d, 'orders.cmd.mergeCall.label'), fixed: { call: 'yes' }, title: t(d, 'orders.cmd.mergeCall.title', { n: o.number }), ok: t(d, 'orders.cmd.mergeCall.ok'), done: t(d, 'orders.cmd.mergeCall.done', { n: o.number }) },
  ];
}

/** The timeline words of the two events: "Merged into EX-1001" / "Took in EX-1002 (2 lines, ৳1,800)". */
export function mergeEventLine(view: View, type: string, data: unknown, currency: string): string | null {
  const x = (data ?? {}) as { mainNumber?: unknown; movedLines?: unknown; movedMinor?: unknown; folded?: unknown; movedMinor_?: unknown };
  const d = view.dict;
  const fmt = (v: number) => formatMoney(v, moneyOf(currency, view.locale));
  if (type === od.MERGED_INTO_EVENT && typeof x.mainNumber === 'string') {
    return t(d, 'orders.ev.mergedIntoLine', { number: x.mainNumber, lines: String(typeof x.movedLines === 'number' ? x.movedLines : 0), total: fmt(typeof x.movedMinor === 'number' ? x.movedMinor : 0) });
  }
  if (type === od.MERGED_FROM_EVENT && Array.isArray(x.folded)) {
    const parts = x.folded.flatMap((f: { number?: unknown; movedLines?: unknown; movedMinor?: unknown }) => (typeof f.number === 'string' ? [t(d, 'orders.ev.mergedFromOne', { number: f.number, lines: String(f.movedLines ?? 0), total: fmt(typeof f.movedMinor === 'number' ? f.movedMinor : 0) })] : []));
    return parts.length ? parts.join('; ') : null;
  }
  return null;
}
