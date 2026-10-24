// S06 · PR 520 — the duplicate & re-order rules engine as one pure function (no database, no clock): the facts of one
// new order — the same customer's other open orders with their lines (the same account, phone or, PR 519, identity),
// the orders to an alike address under other numbers, the block register's matches, the pieces — and the owner's
// `risk.duplicateRules` in; every rule that fired, with its confidence, the orders it matched and what it proposes,
// out. The same facts and settings always give the same answer, so the review card says exactly why (PR 521).
//
// The scenarios (Blueprint B1.12, the owner's 18 Oct answer; demo V12.3): A the same items again while the first is
// not yet with the courier · B different items in the window · C a parcel of his with the courier · D an alike
// address, a new phone · E the same style in another size · H a blocked number, identity or address · I bulk-looking.
// A rule only marks and proposes (cancel · hold · warn · allow — there is no block action); the order service and a
// person decide.
import type { DuplicateRules, DuplicateScenario, RuleAction } from '@extas/settings';
import { WITH_COURIER } from './phone-summary';
import { OPEN_STATES, overlapOf, type LineFacts, type OrderState, type Severity } from './pure';

export type { DuplicateScenario, RuleAction };

/** How the other order is the same customer's: his account, his phone, or his identity (PR 519, another number). */
export type SameBy = 'customer' | 'phone' | 'identity';

/** One of the same customer's other open orders. */
export interface RuleCandidate {
  orderId: string;
  number: string;
  status: OrderState;
  placedAt: Date;
  lines: readonly LineFacts[];
  pieces: number;
  by: SameBy;
}

/** An earlier order under another number to an alike address (scenario D), with how alike (0–1). */
export interface AddressCandidate {
  orderId: string;
  number: string;
  status: OrderState;
  placedAt: Date;
  similarity: number;
}

/** A block-register entry this order matches (scenario H): by its phone, account, identity, or an alike address. */
export interface BlockedMatch {
  entryId: string;
  how: 'phone' | 'customer' | 'identity' | 'address';
  /** How alike the address is (0–1), for `address`. */
  similarity?: number;
  blockedAt: Date | null;
}

export interface RuleFacts {
  placedAt: Date;
  lines: readonly LineFacts[];
  pieces: number;
  candidates: readonly RuleCandidate[];
  addresses: readonly AddressCandidate[];
  blocked: readonly BlockedMatch[];
}

/** What the review card offers first for a rule (the decision stays a person's). */
export type RuleSuggest = 'cancel' | 'merge' | 'addOn' | 'identity' | 'exchange' | 'blocked' | 'bulk';

const SUGGEST: Readonly<Record<DuplicateScenario, RuleSuggest>> = { A: 'cancel', B: 'merge', C: 'addOn', D: 'identity', E: 'exchange', H: 'blocked', I: 'bulk' };

export interface RuleMatch {
  orderId: string;
  number: string;
  confidence: number;
  /** How alike the lines are (A, B, C, E), when they share anything. */
  severity: Severity | null;
}

export interface RuleHit {
  rule: DuplicateScenario;
  /** The strongest match's confidence (0–100). */
  confidence: number;
  action: RuleAction;
  suggest: RuleSuggest;
  matches: RuleMatch[];
  /** H: the block-register entries matched. */
  blocked: string[];
  /** The numbers the words need (the window, the pieces and the limit, how alike an address is). */
  values: Record<string, number | string | null>;
}

export interface RulesResult {
  hits: RuleHit[];
  /** The strongest proposal of all the hits (cancel > hold > warn > allow), or null when no rule fired. */
  top: RuleAction | null;
}

const ACTION_RANK: Readonly<Record<RuleAction, number>> = { allow: 0, warn: 1, hold: 2, cancel: 3 };
export const actionRank = (a: RuleAction): number => ACTION_RANK[a];

/** Not yet with the courier: the order can still be cancelled or join one parcel. */
const NOT_SHIPPED: ReadonlySet<OrderState> = new Set(OPEN_STATES.filter((s) => !WITH_COURIER.includes(s)));
const SAME_BY: Readonly<Record<SameBy, number>> = { customer: 100, phone: 100, identity: 80 };

/** How alike two orders' lines are, as a confidence: the very same pieces 100, high 90, medium 60, low 30, nothing 0. */
export function itemConfidence(a: readonly LineFacts[], b: readonly LineFacts[]): { confidence: number; severity: Severity | null } {
  const o = overlapOf(a, b);
  if (!o) return { confidence: 0, severity: null };
  const set = (l: readonly LineFacts[]) => [...new Set(l.map((x) => x.variantId ?? `p:${x.productId}`))].sort().join('|');
  if (o.severity === 'high' && set(a) === set(b)) return { confidence: 100, severity: 'high' };
  return { confidence: o.severity === 'high' ? 90 : o.severity === 'medium' ? 60 : 30, severity: o.severity };
}

/** The same product and colour in another size in both orders (E): an exchange, not a second parcel. */
function otherSize(a: readonly LineFacts[], b: readonly LineFacts[]): boolean {
  return a.some((x) => !!x.productId && b.some((y) => y.productId === x.productId && y.colourId === x.colourId && !!x.variantId && !!y.variantId && y.variantId !== x.variantId));
}

const inWindow = (at: Date, placedAt: Date, minutes: number) => minutes <= 0 || at.getTime() >= placedAt.getTime() - minutes * 60_000;
const scaled = (a: number, b: number) => Math.round((a * b) / 100);

/** PR 520 — every rule that fires for one order, and the strongest proposal. Off (`enabled`): nothing fires. */
export function duplicateRuleHits(f: RuleFacts, cfg: DuplicateRules): RulesResult {
  if (!cfg.enabled) return { hits: [], top: null };
  const r = cfg.rules;
  const hits: RuleHit[] = [];
  const add = (rule: DuplicateScenario, matches: RuleMatch[], extra: Partial<Pick<RuleHit, 'blocked' | 'values'>> & { confidence?: number } = {}) => {
    const c = r[rule];
    const kept = matches.filter((m) => m.confidence >= c.minConfidence).sort((a, b) => b.confidence - a.confidence || a.number.localeCompare(b.number));
    const confidence = extra.confidence ?? kept[0]?.confidence;
    if (confidence === undefined || confidence < c.minConfidence || (!kept.length && extra.confidence === undefined)) return;
    hits.push({ rule, confidence, action: c.action, suggest: SUGGEST[rule], matches: kept, blocked: extra.blocked ?? [], values: { windowMinutes: c.windowMinutes, minConfidence: c.minConfidence, ...extra.values } });
  };
  const cands = (rule: DuplicateScenario) => f.candidates.filter((x) => inWindow(x.placedAt, f.placedAt, r[rule].windowMinutes));

  if (r.A.enabled) {
    const m = cands('A').flatMap((x) => {
      if (!NOT_SHIPPED.has(x.status)) return [];
      const it = itemConfidence(f.lines, x.lines);
      return it.severity === 'high' || it.severity === 'medium' ? [{ orderId: x.orderId, number: x.number, confidence: scaled(it.confidence, SAME_BY[x.by]), severity: it.severity }] : [];
    });
    add('A', m);
  }
  if (r.B.enabled) {
    const m = cands('B').flatMap((x) => {
      if (!NOT_SHIPPED.has(x.status)) return [];
      const it = itemConfidence(f.lines, x.lines);
      return it.severity === null || it.severity === 'low' ? [{ orderId: x.orderId, number: x.number, confidence: SAME_BY[x.by], severity: it.severity }] : [];
    });
    add('B', m);
  }
  if (r.C.enabled) {
    const m = cands('C').flatMap((x) => {
      if (!WITH_COURIER.includes(x.status)) return [];
      const it = itemConfidence(f.lines, x.lines);
      return [{ orderId: x.orderId, number: x.number, confidence: scaled(Math.max(40, it.confidence), SAME_BY[x.by]), severity: it.severity }];
    });
    add('C', m);
  }
  if (r.D.enabled) {
    const m = f.addresses.filter((x) => inWindow(x.placedAt, f.placedAt, r.D.windowMinutes)).map((x) => ({ orderId: x.orderId, number: x.number, confidence: Math.round(x.similarity * 100), severity: null }));
    add('D', m);
  }
  if (r.E.enabled) {
    const m = cands('E').flatMap((x) => (otherSize(f.lines, x.lines) ? [{ orderId: x.orderId, number: x.number, confidence: scaled(80, SAME_BY[x.by]), severity: 'high' as const }] : []));
    add('E', m);
  }
  if (r.H.enabled) {
    const seen = f.blocked.filter((b) => !b.blockedAt || inWindow(b.blockedAt, f.placedAt, r.H.windowMinutes));
    const conf = (b: BlockedMatch) => (b.how === 'address' ? Math.round((b.similarity ?? 0) * 100) : b.how === 'identity' ? 90 : 100);
    const kept = seen.filter((b) => conf(b) >= r.H.minConfidence);
    if (kept.length) add('H', [], { confidence: Math.max(...kept.map(conf)), blocked: kept.map((b) => b.entryId), values: { how: kept.map((b) => b.how).join(',') } });
  }
  if (r.I.enabled) {
    const others = r.I.windowMinutes > 0 ? cands('I').filter((x) => NOT_SHIPPED.has(x.status)) : [];
    const pieces = f.pieces + others.reduce((n, x) => n + x.pieces, 0);
    if (pieces >= r.I.atLeast)
      add('I', others.map((x) => ({ orderId: x.orderId, number: x.number, confidence: 100, severity: null })), { confidence: 100, values: { pieces, atLeast: r.I.atLeast } });
  }
  const top = hits.reduce<RuleAction | null>((best, h) => (best === null || actionRank(h.action) > actionRank(best) ? h.action : best), null);
  return { hits, top };
}
