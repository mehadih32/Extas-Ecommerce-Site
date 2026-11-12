// PR 660 (CN-048, admin prototype v5, GAP-MAP O-28) — the Cancelled summary drawn above the Cancelled view of the order lists:
// how many orders were cancelled in the chosen days and the order value that did not come in, why (the owner's own reason
// words), at which stage and by whom. It only reads the order service's `cancelledSummary`; nothing is cancelled or refunded
// here. The file buttons use the order list's own export for the same view and days. No React, no database.
import type * as od from '@extas/orders';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

export interface CancelledRow {
  label: string;
  count: string;
}
export interface CancelledCardData {
  title: string;
  sub: string;
  tiles: { key: 'count' | 'money'; label: string; value: string }[];
  groups: { key: 'reasons' | 'stages' | 'who'; title: string; rows: CancelledRow[] }[];
  empty: string | null;
  note: string;
}

export function cancelledCard(view: AdminView, s: od.CancelledSummary, reasons: ReadonlyMap<string, string>): CancelledCardData {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const unknown = t(d, 'orders.cancelled.unknown');
  const reason = (code: string) => (code === 'none' ? t(d, 'orders.cancelled.noReason') : (reasons.get(code) ?? code));
  const stage = (code: string) => (code === 'unknown' ? unknown : t(d, `orders.st.${code}`));
  const who = (code: string) => (code === 'unknown' ? unknown : t(d, `orders.actor.${code}`));
  return {
    title: t(d, 'orders.cancelled.title'),
    sub: t(d, 'orders.cancelled.sub'),
    tiles: [
      { key: 'count', label: t(d, 'orders.cancelled.count'), value: n(s.count) },
      { key: 'money', label: t(d, 'orders.cancelled.money'), value: formatMoney(s.totalMinor, moneyOf(s.currency ?? 'BDT', view.locale)) },
    ],
    groups: s.count
      ? [
          { key: 'reasons', title: t(d, 'orders.cancelled.reasons'), rows: s.byReason.map((r) => ({ label: reason(r.code), count: n(r.count) })) },
          { key: 'stages', title: t(d, 'orders.cancelled.stages'), rows: s.byStage.map((r) => ({ label: stage(r.stage), count: n(r.count) })) },
          { key: 'who', title: t(d, 'orders.cancelled.who'), rows: s.byActor.map((r) => ({ label: who(r.actor), count: n(r.count) })) },
        ]
      : [],
    empty: s.count ? null : t(d, 'orders.cancelled.none'),
    note: t(d, 'orders.cancelled.note'),
  };
}

/** The file of the Cancelled view for the chosen days: the order list's own export (`orders.export`), as CSV. */
export function cancelledFileRequest(from: string | undefined, to: string | undefined, today: string): { url: string; body: Record<string, unknown>; fileName: string } {
  return { url: '/api/admin/orders/export', body: { view: 'cancelled', ...(from ? { from } : {}), ...(to ? { to } : {}) }, fileName: `cancelled-orders-${today}.csv` };
}
