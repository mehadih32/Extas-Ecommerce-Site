// S06 · PR 160 — the risk card on one order's admin page (ORD-07 "Risk panel · Phone history"; demo V12.3
// #/admin/orders/:id): the score and its band as they were stored, every signal that counted with its weight and what
// it saw, when and why it was scored (when the order came in, after an edit, again by hand), whether the owner's rules
// changed since, the earlier scores, and the number's history now (PR 157). Words from messages/admin-orders.<lang>.json
// (`orders.risk.*`); amounts as money and moments in the store's time zone. Read only, apart from "Score again" for a
// person with `orders.risk.decide` (a new dated score; the old one stays). The score only informs. PR 161: the steps the
// order's risk level took (watch, hold, a call) and the advance it proposes, as one line under the pill.
import type { FiredSignal, PhoneSummary, RiskPanel } from '@extas/orders';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { commandUrl } from './commands';
import type { CommandSpec } from './spec';

export interface RiskRow {
  key: string;
  label: string;
  detail: string;
  weight: string;
}

export interface RiskCardView {
  title: string;
  sub: string;
  /** "Medium · 45", coloured by the band's tone; null when the order was never scored. */
  pill: { text: string; tone: 'ok' | 'warn' | 'bad' } | null;
  rows: RiskRow[];
  /** Said when nothing counted, or the order was never scored. */
  empty: string | null;
  when: string | null;
  rulesChanged: string | null;
  earlier: { title: string; rows: string[] } | null;
  history: { label: string; line: string };
  informs: string;
  rescore: CommandSpec | null;
  /** PR 161: "Level High · held · confirmation call in the queue" and the advance it proposes (a person sends it). */
  level: { line: string; ask: string | null; askNote: string | null } | null;
}

/** PR 161 — the steps one level took, in words (the card's line and the timeline's). */
function levelSteps(view: AdminView, x: { watch?: unknown; hold?: unknown; call?: unknown }): string[] {
  const d = view.dict;
  const out: string[] = [];
  if (x.hold === 'held') out.push(t(d, 'orders.risk.level.held'));
  // PR 524: GOOD_CUSTOMER — the good-customer override skipped the hold
  // PR 540: GATED — the gate made the hold a proposal for a person
  else if (x.hold === 'NO_REASON' || x.hold === 'NOT_HOLDABLE' || x.hold === 'GOOD_CUSTOMER' || x.hold === 'GATED') out.push(t(d, `orders.risk.level.${x.hold}`));
  if (x.watch === true) out.push(t(d, 'orders.risk.level.watch'));
  if (x.call === true) out.push(t(d, 'orders.risk.level.call'));
  return out;
}

const ASKS = ['delivery', 'partial', 'full', 'codOff'];

/** PR 161 — the timeline line of a level's steps: "Level High · held · watch mark · Proposed: ask the whole amount first". */
export function levelSummary(view: AdminView, data: unknown, bands: readonly { key: string; en: string; bn: string }[] = []): string | null {
  const x = (data ?? {}) as { band?: string; watch?: unknown; hold?: unknown; call?: unknown; ask?: string };
  if (typeof x.band !== 'string') return null;
  const d = view.dict;
  const b = bands.find((y) => y.key === x.band);
  const ask = x.ask && ASKS.includes(x.ask) ? [t(d, `orders.risk.level.ask.${x.ask}`)] : [];
  const steps = levelSteps(view, x);
  return [t(d, 'orders.risk.level.line', { band: b ? bandName(view, b) : x.band }), ...(steps.length ? steps : ask.length ? [] : [t(d, 'orders.risk.level.none')]), ...ask].join(' · ');
}

const bandName = (view: AdminView, b: { en: string; bn: string }) => (view.lang === 'bn' ? b.bn : b.en);

/** One signal's words: what it saw, with the owner's window when it has one. */
export function signalDetail(view: AdminView, s: FiredSignal, currency: string): string {
  const d = view.dict;
  const v = s.values;
  const bn = view.lang === 'bn';
  const pick = (en: unknown, b: unknown) => String((bn && b ? b : en) ?? '');
  const money = (n: unknown) => (typeof n === 'number' ? formatMoney(n, moneyOf(currency, view.locale)) : '');
  const vars: Record<string, string | number> = {
    count: Number(v.count ?? 0),
    ourFault: Number(v.ourFault ?? 0),
    pct: Number(v.pct ?? 0),
    parcels: Number(v.parcels ?? 0),
    below: Number(v.belowPct ?? 0),
    number: String(v.number ?? ''),
    hours: Number(v.withinHours ?? 0),
    total: money(v.totalMinor),
    at: money(v.atLeastMinor),
    area: pick(v.area, v.areaBn),
    known: pick(v.known, v.knownBn),
    now: pick(v.now, v.nowBn),
    // PR 541: the pieces of one order and the owner's limit
    pieces: Number(v.pieces ?? 0),
    atLeast: Number(v.atLeast ?? 0),
    // PR 559: the pattern's source (our records, or a courier's own check by its key) and the owner's share
    source: v.source === 'own' ? t(d, 'orders.risk.source.own') : String(v.source ?? ''),
    failPct: Number(v.failPct ?? 0),
  };
  const parts = [t(d, `orders.risk.why.${s.key}`, vars)];
  if (s.key === 'refusals' && vars.ourFault) parts.push(t(d, 'orders.risk.ourFault', { n: vars.ourFault }));
  if (typeof v.windowDays === 'number' && v.windowDays > 0) parts.push(t(d, 'orders.risk.window', { days: v.windowDays }));
  if ((s.key === 'identityMatch' || s.key === 'deviceMatch') && v.refusedNumber) parts.push(t(d, 'orders.risk.refusedAs', { number: String(v.refusedNumber) }));
  if (s.key === 'areaMismatch' && v.from) parts.push(t(d, `orders.risk.known.${v.from === 'saved' ? 'saved' : 'order'}`));
  return parts.filter(Boolean).join(' · ');
}

/** The number's history in one line (the demo's a2HistLine): our-fault refusals shown, never counted. */
export function historyLine(view: AdminView, s: PhoneSummary): string {
  const d = view.dict;
  if (!s.orders) return t(d, 'orders.risk.hist.first');
  return [
    t(d, s.orders === 1 ? 'orders.risk.hist.order' : 'orders.risk.hist.orders', { n: s.orders }),
    t(d, 'orders.risk.hist.delivered', { n: s.delivered }),
    t(d, 'orders.risk.hist.refused', { n: s.refused }) + (s.ourFault ? ` ${t(d, 'orders.risk.ourFault', { n: s.ourFault })}` : ''),
    t(d, 'orders.risk.hist.cancelled', { n: s.cancelled }),
    ...(s.returns ? [t(d, 'orders.risk.hist.returns', { n: s.returns })] : []),
    ...(s.inTransit ? [t(d, 'orders.risk.hist.inTransit', { n: s.inTransit })] : []),
    t(d, 'orders.risk.hist.noAnswer', { n: s.noAnswer }),
  ].join(' · ');
}

/** The card, or null when it is not shown (the owner's switch, or never scored while the model is off). */
export function riskCardView(view: AdminView, p: RiskPanel, o: { id: string; number: string; currency: string }, perms: ReadonlySet<string>): RiskCardView | null {
  if (!p.showOnOrder || (!p.enabled && !p.current)) return null;
  const d = view.dict;
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const c = p.current;
  const rescore: CommandSpec | null =
    p.canRescore && perms.has('orders.risk.decide')
      ? {
          id: 'riskAssess',
          label: t(d, 'orders.cmd.riskAssess.label'),
          icon: 'refresh',
          tone: 'ghost',
          url: commandUrl(o.id, 'riskAssess'),
          version: null,
          title: t(d, 'orders.cmd.riskAssess.title', { n: o.number }),
          effects: [t(d, 'orders.eff.riskAssess'), t(d, p.levelsOn ? 'orders.eff.riskLevels' : 'orders.eff.riskInforms')],
          fields: [],
          ok: t(d, 'orders.cmd.riskAssess.ok'),
          okTone: 'pri',
          done: t(d, 'orders.cmd.riskAssess.done', { n: o.number }),
        }
      : null;
  return {
    title: t(d, 'orders.risk.title'),
    sub: t(d, 'orders.risk.sub'),
    pill: c ? { text: `${bandName(view, c.band)} · ${c.score}`, tone: c.band.tone } : null,
    rows: (c?.fired ?? []).map((s) => ({ key: s.key, label: t(d, `orders.risk.sig.${s.key}`), detail: signalDetail(view, s, o.currency), weight: `+${s.weight}` })),
    empty: c ? (c.fired.length ? null : t(d, 'orders.risk.none')) : t(d, 'orders.risk.notScored'),
    when: c ? t(d, `orders.risk.after.${c.after}`, { at: dt.format(new Date(c.at)) }) : null,
    rulesChanged: p.rulesChanged ? t(d, 'orders.risk.rulesChanged') : null,
    earlier: p.earlier.length
      ? { title: t(d, 'orders.risk.earlier'), rows: p.earlier.map((e) => t(d, 'orders.risk.earlierRow', { score: e.score, band: bandName(view, e.band), at: dt.format(new Date(e.at)), why: t(d, `orders.risk.afterShort.${e.after}`) })) }
      : null,
    history: { label: t(d, 'orders.risk.hist.label', { phone: p.phone.phone ?? t(d, 'orders.list.none') }), line: historyLine(view, p.phone.summary) },
    informs: t(d, p.levelsOn ? 'orders.risk.informsLevels' : 'orders.risk.informs'),
    rescore,
    level: p.level
      ? {
          line: [t(d, 'orders.risk.level.line', { band: c && c.band.key === p.level.band ? bandName(view, c.band) : p.level.band }), ...levelSteps(view, p.level)].join(' · '),
          ask: p.level.ask !== 'none' ? t(d, `orders.risk.level.ask.${p.level.ask}`) : null,
          askNote: p.level.ask !== 'none' ? t(d, 'orders.risk.level.askNote') : null,
        }
      : null,
  };
}

/** The timeline line of a score: "45 · Medium · Refused parcels before +30 · …". */
export function riskSummary(view: AdminView, data: unknown): string | null {
  const x = (data ?? {}) as { score?: number; band?: { en: string; bn: string }; fired?: { key: string; weight: number }[] };
  if (typeof x.score !== 'number' || !x.band) return null;
  const d = view.dict;
  return [`${x.score} · ${bandName(view, x.band)}`, ...(x.fired ?? []).map((s) => `${t(d, `orders.risk.sig.${s.key}`)} +${s.weight}`)].join(' · ');
}
