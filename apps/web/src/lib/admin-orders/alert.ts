// S06 · PR 521 — the alert summary's words on one order's admin page: inside the review card, one click ("Why this
// alert, and the options") opens why it fired (each duplicate rule that fired with how sure it is and what it proposes,
// PR 520; the old look-back's "how alike"; the risk signals, PR 541), the earlier orders that matched (with the rule that
// matched each and how it is the same person, PR 519), what the riders wrote on this customer's parcels, his number's
// and his identity's history, and the decisions open to this person with the proposed one first. Also the duplicate
// check's timeline line when the rules ran. Words from messages/admin-orders.<lang>.json (`orders.alert.*`). Read only.
import type { AlertSummary, Decision } from '@extas/orders';
import type { OrderState } from '@extas/orders/pure';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { viaText } from './identity';
import { ORDER_TONE, orderHref, type Tone } from './model';
import { historyLine } from './risk';

export interface AlertExplainView {
  label: string;
  fired: string;
  why: string[];
  matchedTitle: string;
  matches: { key: string; number: string; href: string; status: string; tone: Tone; sub: string }[];
  noMatch: string | null;
  riderTitle: string;
  riders: { key: string; number: string; href: string; text: string; sub: string }[];
  noRider: string | null;
  historyTitle: string;
  history: string[];
  proposed: string | null;
  options: string;
  yours: string;
}

const MIN_PER_HOUR = 60;
const MIN_PER_DAY = 1_440;

/** A rule's window in words: "within 5 days", "within 3 hours", "within 45 minutes", or "any time". */
export function windowText(view: AdminView, minutes: number): string {
  const d = view.dict;
  if (!(minutes > 0)) return t(d, 'orders.alert.anyTime');
  if (minutes % MIN_PER_DAY === 0) return t(d, 'orders.alert.within', { time: t(d, 'orders.alert.days', { n: minutes / MIN_PER_DAY }) });
  if (minutes % MIN_PER_HOUR === 0) return t(d, 'orders.alert.within', { time: t(d, 'orders.alert.hours', { n: minutes / MIN_PER_HOUR }) });
  return t(d, 'orders.alert.within', { time: t(d, 'orders.alert.minutes', { n: minutes }) });
}

/** One fired rule in words: "A · Same customer, same items again · 100% sure · within 5 days · proposes cancel". */
export function ruleText(view: AdminView, h: { rule: string; confidence: number; action: string; values: Record<string, number | string | null> }): string {
  const d = view.dict;
  const v = h.values;
  const parts = [`${h.rule} · ${t(d, `orders.alert.rule.${h.rule}`)}`, t(d, 'orders.alert.sure', { pct: h.confidence })];
  if (typeof v.windowMinutes === 'number') parts.push(windowText(view, v.windowMinutes));
  if (typeof v.pieces === 'number') parts.push(t(d, 'orders.alert.pieces', { pieces: v.pieces, atLeast: Number(v.atLeast ?? 0) }));
  if (typeof v.how === 'string' && v.how)
    parts.push(
      v.how
        .split(',')
        .map((k) => t(d, `orders.alert.how.${k}`))
        .join(' · '),
    );
  parts.push(t(d, 'orders.alert.proposes', { action: t(d, `orders.alert.action.${h.action}`) }));
  return parts.join(' · ');
}

/** The duplicate check's timeline line when the rules ran (null: the old look-back, whose reason line stays as it was). */
export function duplicateCheckSummary(view: AdminView, data: unknown): string | null {
  const x = (data ?? {}) as { rules?: { rule?: unknown }[]; proposed?: unknown; after?: unknown };
  if (!Array.isArray(x.rules)) return null;
  const d = view.dict;
  const fired = x.rules.map((h) => (typeof h?.rule === 'string' ? `${h.rule} · ${t(d, `orders.alert.rule.${h.rule}`)}` : null)).filter(Boolean);
  const parts = [fired.length ? t(d, 'orders.alert.fired', { rules: fired.join(', ') }) : t(d, 'orders.alert.noneFired')];
  if (typeof x.proposed === 'string') parts.push(t(d, 'orders.alert.proposes', { action: t(d, `orders.alert.action.${x.proposed}`) }));
  if (x.after === 'edit') parts.push(t(d, 'orders.identity.afterEdit'));
  return parts.join(' · ');
}

const decisionLabel = (view: AdminView, kind: AlertSummary['kind'], dec: Decision) => t(view.dict, `orders.${kind === 'risk' ? 'riskReview' : 'review'}.${dec}.label`);

/** The summary inside one review card. */
export function alertExplainView(view: AdminView, s: AlertSummary, fmt: { money: (minor: number) => string; date: (at: Date) => string }): AlertExplainView {
  const d = view.dict;
  const why: string[] = [];
  for (const h of s.rules) why.push(ruleText(view, h));
  if (!s.rules.length && s.kind === 'duplicate' && s.severity) why.push(t(d, 'orders.alert.lookback', { sev: t(d, `orders.review.sev.${s.severity}`) }));
  if (s.because.length) why.push(t(d, 'orders.alert.signals', { why: s.because.map((k) => t(d, `orders.risk.sig.${k}`)).join(' · ') }));
  if (s.afterEdit) why.push(t(d, 'orders.identity.afterEdit'));
  if (!why.length) why.push(t(d, 'orders.alert.noWhy'));

  const matches = s.matches.map((m) => ({
    key: m.orderId,
    number: m.number,
    href: orderHref(m.orderId),
    status: t(d, `orders.st.${m.status}`),
    tone: ORDER_TONE[m.status as OrderState] ?? ('line' as Tone),
    sub: [fmt.date(m.placedAt), fmt.money(m.totalMinor), m.severity ? t(d, 'orders.alert.alike', { sev: t(d, `orders.review.sev.${m.severity}`) }) : null, m.rules.length ? t(d, 'orders.alert.byRules', { rules: m.rules.join(', ') }) : null, m.via.length ? viaText(view, m.via) : null]
      .filter(Boolean)
      .join(' · '),
  }));
  const riders = s.riderNotes.map((r, i) => ({
    key: `${r.orderId}-${r.from}-${i}`,
    number: r.number,
    href: orderHref(r.orderId),
    text: r.note,
    sub: [t(d, `orders.alert.from.${r.from}`), fmt.date(r.at)].join(' · '),
  }));
  const history = [t(d, 'orders.alert.phone', { line: historyLine(view, s.history.phone) })];
  if (s.history.identity) history.push(t(d, 'orders.alert.identity', { phones: s.history.otherPhones, line: historyLine(view, s.history.identity) }));

  const open = s.status === 'OPEN';
  return {
    label: t(d, 'orders.alert.label'),
    fired: t(d, 'orders.alert.why'),
    why,
    matchedTitle: t(d, 'orders.alert.matched'),
    matches,
    noMatch: matches.length ? null : t(d, 'orders.alert.noMatch'),
    riderTitle: t(d, 'orders.alert.rider'),
    riders,
    noRider: riders.length ? null : t(d, 'orders.alert.noRider'),
    historyTitle: t(d, 'orders.alert.history'),
    history,
    proposed: open ? t(d, 'orders.alert.proposed', { decision: decisionLabel(view, s.kind, s.proposed) }) : null,
    options: !open ? t(d, 'orders.alert.decided') : s.options.length ? t(d, 'orders.alert.options', { list: s.options.map((o) => decisionLabel(view, s.kind, o)).join(' · ') }) : t(d, 'orders.alert.noRights'),
    yours: t(d, 'orders.alert.yours'),
  };
}
