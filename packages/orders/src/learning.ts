// S06 · PR 543 — the decision learning loop ("every approve and decline by the owner and by each employee, with its
// reason, is taken as training. The engine's judgement improves as volume grows, and it learns which employee rejects
// what and why. Switchable off").
//
// The decision log: every decision a person takes on what the engine stopped or proposed is one FraudDecision row
// (append-only, always written): a review approved, declined, held, asked or merged (duplicates.ts), a proposed hold held
// or let go (approval-gate.ts), a blocklist proposal blocked or not (blocklist.ts) — who, when, and the note.
//
// The learning (`risk.learning`, off as shipped) reads the last `days` days of the log. Each decision is a *let go* (the
// person let the engine's stop go: approve, a proposed hold or a block proposal let go), a *kept* (decline, hold, block)
// or *other* (ask the customer, one parcel). Per rule — a duplicate rule's letter, a risk section, the rule behind a
// proposed hold, the blocklist proposal — it counts the final decision of each review or proposal and how the orders let
// go ended (delivered, refused), so a rule people keep letting go, whose let-go orders are delivered, is shown as too
// strict, and a rule people keep is shown as doing its job. Per person it counts every decision, with their latest notes.
// A rule decided at least `minDecisions` times that people let go (or kept) at least `suggestPercent` of the time gets a
// suggestion for the owner; an open review shows what people did with ones like it. It only suggests: no rule, no order
// and no number changes by itself, and nothing is ever blocked (a blocklist proposal never gets a "keep" suggestion).
import { allow, nowOf, setting, type OrdersDeps, type Tx, type Who } from './context';
import type { ActorType, By } from './service';
import { HOLD_PROPOSED_EVENT } from './approval-gate';
import { outcomeOfStatus, type StopOutcome } from './stop-report';

/** What a decision was about (the first part of FraudDecision.decision). */
export const LEARN_KINDS = ['duplicate', 'risk', 'holdProposal', 'blockProposal'] as const;
export type LearnKind = (typeof LEARN_KINDS)[number];
export type Verdict = 'letGo' | 'kept' | 'other';

const LET_GO: Record<LearnKind, readonly string[]> = { duplicate: ['approve'], risk: ['approve'], holdProposal: ['dismiss'], blockProposal: ['dismiss'] };
const KEPT: Record<LearnKind, readonly string[]> = { duplicate: ['decline', 'hold'], risk: ['decline', 'hold'], holdProposal: ['hold'], blockProposal: ['block'] };

/** The kind and the verdict of a stored decision ("duplicate.approve" → duplicate, let go), or null for anything else. */
export function verdictOf(decision: string): { kind: LearnKind; decision: string; verdict: Verdict } | null {
  const dot = decision.indexOf('.');
  const kind = decision.slice(0, dot) as LearnKind;
  const what = decision.slice(dot + 1);
  if (dot < 1 || !LEARN_KINDS.includes(kind) || !what) return null;
  return { kind, decision: what, verdict: LET_GO[kind].includes(what) ? 'letGo' : KEPT[kind].includes(what) ? 'kept' : 'other' };
}

/** Keeps one decision in the log (inside the decision's own transaction). */
export async function recordDecision(tx: Tx, by: By, row: { storeId: number; kind: LearnKind; decision: string; orderId: string | null; alertId?: string | null; note: string | null }): Promise<void> {
  await tx.fraudDecision.create({ data: { storeId: row.storeId, alertId: row.alertId ?? null, orderId: row.orderId, decision: `${row.kind}.${row.decision}`, reason: row.note, actorType: by.actorType, actorId: by.actorId } });
}

/** One decision as the learning reads it. */
export interface LearnRow {
  /** The review or proposal decided (its final decision counts for the rule). */
  subject: string;
  kind: LearnKind;
  decision: string;
  verdict: Verdict;
  /** The rules it was about: "dup.A", "sec.address", "gate.levelHold", "blockProposal". */
  keys: string[];
  actorType: ActorType;
  actorId: string | null;
  note: string | null;
  at: string;
  outcome: StopOutcome | null;
}

export interface LearnTally {
  key: string;
  decided: number;
  letGo: number;
  kept: number;
  other: number;
  /** How the orders let go ended. */
  letGoDelivered: number;
  letGoRefused: number;
}

export interface LearnSuggestion {
  key: string;
  /** relax: people let most of these go (and those were delivered); keep: people keep most of them. */
  kind: 'relax' | 'keep';
  /** The share, 0–100. */
  share: number;
  decided: number;
}

export interface LearnPerson {
  actorType: ActorType;
  actorId: string | null;
  name: string | null;
  decided: number;
  letGo: number;
  kept: number;
  other: number;
  /** Orders this person let go that were refused at the door. */
  letGoRefused: number;
  /** The rules this person decided most, with what they did. */
  rules: { key: string; letGo: number; kept: number }[];
  /** The person's latest notes. */
  notes: { decision: string; kind: LearnKind; note: string; at: string }[];
}

export interface LearningReport {
  enabled: boolean;
  from: string;
  to: string;
  days: number;
  decisions: number;
  /** More decisions than one report reads: only the newest were read. */
  cut: boolean;
  rules: LearnTally[];
  suggestions: LearnSuggestion[];
  people: LearnPerson[];
  minDecisions: number;
  suggestPercent: number;
}

/** The tally per rule (pure): the final decision of each review or proposal, newest first in `rows`. */
export function tallyRules(rows: readonly LearnRow[]): LearnTally[] {
  const finals = new Map<string, LearnRow>();
  for (const r of rows) if (!finals.has(r.subject)) finals.set(r.subject, r);
  const out = new Map<string, LearnTally>();
  for (const r of finals.values())
    for (const key of r.keys) {
      const t = out.get(key) ?? { key, decided: 0, letGo: 0, kept: 0, other: 0, letGoDelivered: 0, letGoRefused: 0 };
      t.decided += 1;
      t[r.verdict] += 1;
      if (r.verdict === 'letGo' && r.outcome === 'delivered') t.letGoDelivered += 1;
      if (r.verdict === 'letGo' && r.outcome === 'refused') t.letGoRefused += 1;
      out.set(key, t);
    }
  return [...out.values()].sort((a, b) => b.decided - a.decided || a.key.localeCompare(b.key));
}

/**
 * The suggestions (pure): a rule decided at least `minDecisions` times that people let go at least `suggestPercent` of
 * the time, with fewer of the let-go orders refused than the rest of that share, is "relax"; one people kept at least
 * that share of the time is "keep" — never for the blocklist proposal (nothing is ever blocked by itself).
 */
export function suggestionsOf(rules: readonly LearnTally[], opts: { minDecisions: number; suggestPercent: number }): LearnSuggestion[] {
  const out: LearnSuggestion[] = [];
  for (const r of rules) {
    if (r.decided < opts.minDecisions) continue;
    const letGo = Math.round((r.letGo * 100) / r.decided);
    const kept = Math.round((r.kept * 100) / r.decided);
    const refusedShare = r.letGo ? (r.letGoRefused * 100) / r.letGo : 0;
    if (letGo >= opts.suggestPercent && refusedShare < 100 - opts.suggestPercent) out.push({ key: r.key, kind: 'relax', share: letGo, decided: r.decided });
    else if (kept >= opts.suggestPercent && r.key !== 'blockProposal') out.push({ key: r.key, kind: 'keep', share: kept, decided: r.decided });
  }
  return out;
}

/** The tally per person (pure): every decision counts. */
export function tallyPeople(rows: readonly LearnRow[], names: ReadonlyMap<string, string>, notesPerPerson: number): LearnPerson[] {
  const out = new Map<string, LearnPerson & { byRule: Map<string, { key: string; letGo: number; kept: number }> }>();
  for (const r of rows) {
    const id = `${r.actorType}:${r.actorId ?? ''}`;
    const p = out.get(id) ?? { actorType: r.actorType, actorId: r.actorId, name: r.actorId ? (names.get(r.actorId) ?? null) : null, decided: 0, letGo: 0, kept: 0, other: 0, letGoRefused: 0, rules: [] as LearnPerson['rules'], notes: [] as LearnPerson['notes'], byRule: new Map<string, { key: string; letGo: number; kept: number }>() };
    p.decided += 1;
    p[r.verdict] += 1;
    if (r.verdict === 'letGo' && r.outcome === 'refused') p.letGoRefused += 1;
    for (const key of r.keys) {
      const k = p.byRule.get(key) ?? { key, letGo: 0, kept: 0 };
      if (r.verdict === 'letGo') k.letGo += 1;
      if (r.verdict === 'kept') k.kept += 1;
      p.byRule.set(key, k);
    }
    if (r.note && p.notes.length < notesPerPerson) p.notes.push({ decision: r.decision, kind: r.kind, note: r.note, at: r.at });
    out.set(id, p);
  }
  return [...out.values()]
    .map(({ byRule, ...p }) => ({ ...p, rules: [...byRule.values()].sort((a, b) => b.letGo + b.kept - (a.letGo + a.kept) || a.key.localeCompare(b.key)).slice(0, 3) }))
    .sort((a, b) => b.decided - a.decided || Number(!a.name) - Number(!b.name) || (a.name ?? '').localeCompare(b.name ?? ''));
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The rule keys of a review (its duplicate rules' letters, or its risk section). */
export function reviewKeys(kind: 'duplicate' | 'risk', summary: unknown): string[] {
  const s = obj(summary);
  if (kind === 'risk') return [`sec.${str(s.section) ?? 'unknown'}`];
  const letters = Array.isArray(s.rules) ? [...new Set(s.rules.map((h) => str(obj(h).rule)).filter((x): x is string => !!x))] : [];
  return letters.length ? letters.map((l) => `dup.${l}`) : ['dup'];
}

/** Reads the decisions of the window (newest first) as the learning sees them. */
async function learnRows(deps: OrdersDeps, storeId: number, from: Date, to: Date, maxRows: number): Promise<{ rows: LearnRow[]; cut: boolean }> {
  const raw = await deps.db.fraudDecision.findMany({ where: { storeId, createdAt: { gte: from, lte: to } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: maxRows + 1 });
  const cut = raw.length > maxRows;
  const kept = raw.slice(0, maxRows).flatMap((d) => {
    const v = verdictOf(d.decision);
    return v ? [{ d, v }] : [];
  });
  const alertIds = [...new Set(kept.flatMap(({ d }) => (d.alertId ? [d.alertId] : [])))];
  const orderIds = [...new Set(kept.flatMap(({ d }) => (d.orderId ? [d.orderId] : [])))];
  const gatedOrders = [...new Set(kept.flatMap(({ d, v }) => (v.kind === 'holdProposal' && d.orderId ? [d.orderId] : [])))];
  const [alerts, orders, proposals] = await Promise.all([
    alertIds.length ? deps.db.fraudAlert.findMany({ where: { storeId, id: { in: alertIds } }, select: { id: true, summary: true } }) : [],
    orderIds.length ? deps.db.order.findMany({ where: { storeId, id: { in: orderIds } }, select: { id: true, status: true } }) : [],
    gatedOrders.length ? deps.db.orderEvent.findMany({ where: { storeId, orderId: { in: gatedOrders }, type: HOLD_PROPOSED_EVENT }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { orderId: true, data: true } }) : [],
  ]);
  const summaryOf = new Map(alerts.map((a) => [a.id, a.summary]));
  const statusOf = new Map(orders.map((o) => [o.id, o.status]));
  const ruleOf = new Map<string, string>();
  for (const p of proposals) if (!ruleOf.has(p.orderId)) ruleOf.set(p.orderId, str(obj(p.data).rule) ?? 'unknown');
  const rows: LearnRow[] = kept.map(({ d, v }) => {
    const keys = v.kind === 'duplicate' || v.kind === 'risk' ? reviewKeys(v.kind, summaryOf.get(d.alertId ?? '')) : v.kind === 'holdProposal' ? [`gate.${ruleOf.get(d.orderId ?? '') ?? 'unknown'}`] : ['blockProposal'];
    const status = d.orderId ? statusOf.get(d.orderId) : undefined;
    return {
      subject: d.alertId ?? `${v.kind}:${d.orderId ?? d.id}`,
      kind: v.kind,
      decision: v.decision,
      verdict: v.verdict,
      keys,
      actorType: d.actorType,
      actorId: d.actorId,
      note: d.reason,
      at: d.createdAt.toISOString(),
      outcome: status ? outcomeOfStatus(status) : null,
    };
  });
  return { rows, cut };
}

/** How many of a person's latest notes the report shows. */
const NOTES_PER_PERSON = 3;

/** Reports › Decisions & learning (`risk.report`). Off: says so and reads nothing. */
export async function learningReport(deps: OrdersDeps, who: Who): Promise<LearningReport> {
  await allow(deps, who, 'risk.report');
  const cfg = await setting(deps, who.storeId, 'risk.learning');
  const to = nowOf(deps);
  const from = new Date(to.getTime() - cfg.days * 86_400_000);
  const base = { enabled: cfg.enabled, from: from.toISOString(), to: to.toISOString(), days: cfg.days, minDecisions: cfg.minDecisions, suggestPercent: cfg.suggestPercent };
  if (!cfg.enabled) return { ...base, decisions: 0, cut: false, rules: [], suggestions: [], people: [] };
  const { rows, cut } = await learnRows(deps, who.storeId, from, to, cfg.maxRows);
  const staffIds = [...new Set(rows.flatMap((r) => (r.actorType === 'STAFF' && r.actorId ? [r.actorId] : [])))];
  const staff = staffIds.length ? await deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } }) : [];
  const rules = tallyRules(rows);
  return { ...base, decisions: rows.length, cut, rules, suggestions: suggestionsOf(rules, cfg), people: tallyPeople(rows, new Map(staff.map((s) => [s.id, s.displayName])), NOTES_PER_PERSON) };
}

export interface LearnHint extends LearnTally {
  minDecisions: number;
}

/**
 * What people did with reviews like these (open reviews on an order page): per review, its most-decided rule's tally,
 * once it has at least `minDecisions` decisions. Empty when the learning is off.
 */
export async function learnedHints(deps: OrdersDeps, storeId: number, reviews: readonly { alertId: string; kind: 'duplicate' | 'risk'; summary: unknown }[]): Promise<Map<string, LearnHint>> {
  const out = new Map<string, LearnHint>();
  if (!reviews.length) return out;
  const cfg = await setting(deps, storeId, 'risk.learning');
  if (!cfg.enabled) return out;
  const to = nowOf(deps);
  const { rows } = await learnRows(deps, storeId, new Date(to.getTime() - cfg.days * 86_400_000), to, cfg.maxRows);
  // the review itself is not its own lesson
  const own = new Set(reviews.map((r) => r.alertId));
  const byKey = new Map(tallyRules(rows.filter((r) => !own.has(r.subject))).map((t) => [t.key, t]));
  for (const r of reviews) {
    const best = reviewKeys(r.kind, r.summary)
      .map((k) => byKey.get(k))
      .filter((t): t is LearnTally => !!t && t.decided >= cfg.minDecisions)
      .sort((a, b) => b.decided - a.decided)[0];
    if (best) out.set(r.alertId, { ...best, minDecisions: cfg.minDecisions });
  }
  return out;
}
