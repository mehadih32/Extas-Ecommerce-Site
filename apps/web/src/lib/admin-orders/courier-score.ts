// S28 · PR 662 — the courier score card on one order (staff only): the score out of 10 with a coloured pill, the one plain
// reason line, and the six checks with their points, source and age. Words from messages/admin-orders.<lang>.json
// (`orders.cs.*`). Unknown checks are shown as "Unknown" (never red). A read; nothing here moves an order.
import type { CourierScoreResult, ScoreBand } from '@extas/orders';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

export interface CourierScoreRow {
  key: string;
  label: string;
  value: string;
  points: string;
  source: string;
}

export interface CourierScoreCardView {
  title: string;
  pill: { text: string; tone: 'ok' | 'warn' | 'bad' };
  reason: string;
  rows: CourierScoreRow[];
  note: string;
}

const TONE: Record<ScoreBand, 'ok' | 'warn' | 'bad'> = { auto: 'ok', call: 'warn', person: 'bad' };

/** How old an answer is, in words ("35 min ago", "3 h ago"). */
export function ageText(view: AdminView, minutes: number | null): string {
  if (minutes === null) return t(view.dict, 'orders.cs.ownOrders');
  if (minutes < 60) return t(view.dict, 'orders.cs.minAgo', { n: String(minutes) });
  if (minutes < 2_880) return t(view.dict, 'orders.cs.hourAgo', { n: String(Math.round(minutes / 60)) });
  return t(view.dict, 'orders.cs.dayAgo', { n: String(Math.round(minutes / 1_440)) });
}

/** The plain one-line reason of a result (no AI call). */
export function reasonText(view: AdminView, r: CourierScoreResult): string {
  const v = Object.fromEntries(Object.entries(r.reason.values).map(([k, x]) => [k, String(x)]));
  return t(view.dict, `orders.cs.reason.${r.reason.key}`, v);
}

export function courierScoreCardView(view: AdminView, r: CourierScoreResult): CourierScoreCardView {
  const d = view.dict;
  return {
    title: t(d, 'orders.cs.title'),
    pill: { text: r.score === null ? t(d, 'orders.cs.noScore') : `${r.score}/10 · ${t(d, `orders.cs.band.${r.band}`)}`, tone: r.score === null ? 'warn' : TONE[r.band] },
    reason: reasonText(view, r),
    rows: r.metrics.map((m) => ({
      key: m.key,
      label: t(d, `orders.cs.metric.${m.key}`),
      value: m.value === null ? t(d, 'orders.cs.unknown') : m.key === 'success' || m.key === 'worst' ? `${m.value}%` : String(m.value),
      points: m.points === null ? '—' : t(d, 'orders.cs.points', { n: String(m.points) }),
      source: m.value === null ? t(d, 'orders.cs.noAnswer') : `${m.sources.map((s) => (s === 'own' ? t(d, 'orders.cs.ownOrders') : s)).join(' + ')} · ${ageText(view, m.ageMinutes)}`,
    })),
    note: t(d, 'orders.cs.staffOnly'),
  };
}
