// PR 217 — rule conflict detection and the resolution order. Four kinds of clash are found:
//   SAME_SLOT     two rules that are (or will be) live at the same time want the same thing for the same products: two
//                 charges for one band, two free-delivery thresholds, two COD rules, two cut-offs for one band, two
//                 exchange policies, two set-tier rules on the same products. The resolution order (match.ts) says
//                 which one wins; the clash is shown so the owner knows the other one is silent.
//   STACKING      two discounts on the same products that may not combine: only the winner applies to a line.
//   TEXT_DRIFT    a customer text (another rule's or a notice's) writes a duration or an amount by hand that no live
//                 rule of that topic has any more — the demo's "FAQ text still says 7 days; your Exchange rule says
//                 72 hours". "Fix everywhere" replaces the stale number with the rule's {token}, so it never drifts again.
//   SETTING_DRIFT the store setting a rule took over (exchange window, exchanges per item, free-delivery threshold, order
//                 edits) says something else than the live rule. The rule is what customers are told and what the
//                 engine uses; the setting is only the starting value.
//
// Pure module: the service (conflicts-service.ts) feeds it the rules, the notices and the settings, and stores what it
// finds in SmartRuleConflict (a fingerprint per clash, so a re-check updates it instead of adding a row).
import { conditionsCanMeet, decidedBy, resolutionOrder, scopesOverlap } from './match';
import { windowsOverlap, type Action, type Rule, type RuleKind, type TextSlot, TEXT_SLOTS } from './model';
import { literalsIn, tokensIn, unitOf, type Literal } from './text';

export type ConflictKind = 'SAME_SLOT' | 'STACKING' | 'TEXT_DRIFT' | 'SETTING_DRIFT';

export interface Finding {
  kind: ConflictKind;
  /** The rule the finding is about (for TEXT_DRIFT: the rule whose value the text should quote). */
  ruleA: string;
  /** The other side: a rule id, a notice id, or ruleA again for a setting. */
  other: { type: 'rule' | 'notice' | 'setting'; id: string; key: string };
  /** What is contested, e.g. `deliveryCharge:dhaka-city`. */
  slot: string;
  /** The rule that wins under the resolution order (SAME_SLOT, STACKING). */
  winner: string | null;
  decidedBy: ReturnType<typeof decidedBy> | null;
  detail: Record<string, unknown>;
  fingerprint: string;
}

/** A customer text that is not a rule's own: a notice (PR 216). */
export interface OtherText {
  id: string;
  key: string;
  /** The rule it belongs to (its topic); null = not linked. */
  ruleId: string | null;
  texts: { at: string; text: string }[];
}

/** A setting a rule took over, with its current value (the service reads it). */
export interface SettingFact {
  key: string;
  value: unknown;
}

/** Which setting mirrors which action field. */
export const SETTING_MIRRORS: { kind: RuleKind; action: Action['type']; field: 'windowParam' | 'perItemParam' | 'param'; setting: string }[] = [
  { kind: 'exchange', action: 'exchangePolicy', field: 'windowParam', setting: 'policy.exchange.windowHours' },
  { kind: 'exchange', action: 'exchangePolicy', field: 'perItemParam', setting: 'policy.exchange.perItem' },
  { kind: 'delivery', action: 'freeDeliveryOver', field: 'param', setting: 'delivery.freeOverMinor' },
];

/** Rules that are live now or will be (active, not archived, not ended), plus a candidate draft if given. */
const inPlay = (r: Rule, now: Date) => !r.archived && r.status === 'ACTIVE' && (!r.endsAt || Date.parse(r.endsAt) > now.getTime());

function slotsOf(a: Action): string[] {
  switch (a.type) {
    case 'deliveryCharge':
      return Object.keys(a.byBand).map((b) => `deliveryCharge:${b}`);
    case 'freeDeliveryOver':
      return ['freeDeliveryOver'];
    case 'cutoff':
      return Object.keys(a.byBand).map((b) => `cutoff:${b}`);
    case 'cod':
      return ['cod'];
    case 'exchangePolicy':
      return ['exchangePolicy'];
    case 'setTier':
      return ['setTier'];
    case 'freeDelivery':
    case 'discount':
      return [];
  }
}

/** `*` bands meet every band. */
function slotsMeet(a: string, b: string): boolean {
  if (a === b) return true;
  const [ka, ba] = a.split(':');
  const [kb, bb] = b.split(':');
  return ka === kb && ba !== undefined && bb !== undefined && (ba === '*' || bb === '*');
}

const fp = (kind: ConflictKind, ids: string[], slot: string) => `${kind}|${[...ids].sort().join('|')}|${slot}`;

export interface DetectInput {
  rules: readonly Rule[];
  notices?: readonly OtherText[];
  settings?: readonly SettingFact[];
  /** Category id → parent id, so scopes on a category and its child are seen to overlap. */
  parents?: ReadonlyMap<string, string | null>;
  currency: string;
  now: Date;
}

export function detectConflicts(input: DetectInput): Finding[] {
  const { rules, now } = input;
  const live = rules.filter((r) => inPlay(r, now));
  const out: Finding[] = [];
  const pairs = (fn: (a: Rule, b: Rule) => void) => {
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) fn(live[i]!, live[j]!);
  };

  pairs((a, b) => {
    if (!windowsOverlap(a, b) || !scopesOverlap(a.scope, b.scope, input.parents) || !conditionsCanMeet(a.conditions, b.conditions)) return;
    const [w, l] = resolutionOrder(a, b) <= 0 ? [a, b] : [b, a];
    const sa = a.actions.flatMap(slotsOf);
    const sb = b.actions.flatMap(slotsOf);
    const reported = new Set<string>();
    for (const x of sa) {
      for (const y of sb) {
        if (!slotsMeet(x, y)) continue;
        const slot = x.length <= y.length ? x : y;
        if (reported.has(slot)) continue;
        reported.add(slot);
        out.push({ kind: 'SAME_SLOT', ruleA: w.id, other: { type: 'rule', id: l.id, key: l.key }, slot, winner: w.id, decidedBy: decidedBy(a, b), detail: { winnerKey: w.key, loserKey: l.key }, fingerprint: fp('SAME_SLOT', [a.id, b.id], slot) });
      }
    }
    const da = a.actions.some((x) => x.type === 'discount');
    const db = b.actions.some((x) => x.type === 'discount');
    if (da && db && !(a.stackable && b.stackable)) {
      out.push({ kind: 'STACKING', ruleA: w.id, other: { type: 'rule', id: l.id, key: l.key }, slot: 'discount', winner: w.id, decidedBy: decidedBy(a, b), detail: { winnerKey: w.key, loserKey: l.key }, fingerprint: fp('STACKING', [a.id, b.id], 'discount') });
    }
  });

  // ---- TEXT_DRIFT: hand-written numbers in other texts of the same topic ----
  const byKind = new Map<RuleKind, Rule[]>();
  for (const r of live) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const known = (kind: RuleKind, lit: Literal) =>
    (byKind.get(kind) ?? []).some((r) => r.params.some((p) => unitOf(p.type) === lit.unit && p.value === lit.value));
  const sourceFor = (kind: RuleKind, lit: Literal) => {
    const cands = (byKind.get(kind) ?? []).flatMap((r) => r.params.filter((p) => unitOf(p.type) === lit.unit && p.value !== null && p.value !== undefined).map((p) => ({ r, p })));
    return cands.length === 1 ? cands[0]! : null;
  };
  const drift = (kind: RuleKind, other: Finding['other'], at: string, text: string, selfId: string | null) => {
    for (const lit of literalsIn(text, input.currency)) {
      // "৳0 if the mistake is ours" is a promise, not a setting; only a number a rule could hold can drift.
      if (lit.value === 0 || known(kind, lit)) continue;
      const src = sourceFor(kind, lit);
      if (!src && !(byKind.get(kind) ?? []).some((r) => r.params.some((p) => unitOf(p.type) === lit.unit && p.value !== null))) continue;
      const ruleA = src?.r.id ?? (byKind.get(kind) ?? [])[0]!.id;
      out.push({
        kind: 'TEXT_DRIFT',
        ruleA,
        other,
        slot: at,
        winner: null,
        decidedBy: null,
        detail: {
          literal: lit.raw,
          unit: lit.unit,
          literalValue: lit.value,
          ruleKey: src?.r.key ?? null,
          param: src?.p.key ?? null,
          ruleValue: src?.p.value ?? null,
          // In the rule's own text the token is its own; anywhere else it names the rule.
          token: src ? (src.r.id === selfId ? `{${src.p.key}}` : `{${src.r.key}.${src.p.key}}`) : null,
        },
        fingerprint: fp('TEXT_DRIFT', [ruleA, other.id], `${at}|${lit.raw}`),
      });
    }
  };
  for (const r of rules) {
    if (r.archived) continue;
    for (const slot of TEXT_SLOTS) {
      for (const lang of ['en', 'bn'] as const) {
        const s = r.text[slot as TextSlot]?.[lang];
        if (s) drift(r.kind, { type: 'rule', id: r.id, key: r.key }, `text.${slot}.${lang}`, s, r.id);
      }
    }
  }
  for (const n of input.notices ?? []) {
    const owner = n.ruleId ? rules.find((r) => r.id === n.ruleId) : undefined;
    if (!owner) continue;
    for (const t of n.texts) drift(owner.kind, { type: 'notice', id: n.id, key: n.key }, t.at, t.text, null);
  }

  // ---- SETTING_DRIFT ----
  for (const m of SETTING_MIRRORS) {
    const s = input.settings?.find((x) => x.key === m.setting);
    if (!s || s.value === null || s.value === undefined) continue;
    const r = live.filter((x) => x.kind === m.kind && x.actions.some((a) => a.type === m.action)).sort(resolutionOrder)[0];
    if (!r) continue;
    const a = r.actions.find((x) => x.type === m.action) as Record<string, unknown> | undefined;
    const param = a?.[m.field];
    if (typeof param !== 'string') continue;
    const value = r.params.find((p) => p.key === param)?.value;
    if (value === null || value === undefined || value === s.value) continue;
    out.push({ kind: 'SETTING_DRIFT', ruleA: r.id, other: { type: 'setting', id: r.id, key: m.setting }, slot: m.setting, winner: r.id, decidedBy: null, detail: { setting: m.setting, settingValue: s.value, ruleKey: r.key, param, ruleValue: value }, fingerprint: fp('SETTING_DRIFT', [r.id], m.setting) });
  }
  return out;
}

/** "Fix everywhere" for one TEXT_DRIFT: the text with the stale literal replaced by the token (null = cannot fix). */
export function fixDrift(text: string, f: Pick<Finding, 'kind' | 'detail'>): string | null {
  if (f.kind !== 'TEXT_DRIFT') return null;
  const lit = f.detail.literal as string | undefined;
  const token = f.detail.token as string | null | undefined;
  if (!lit || !token || !text.includes(lit)) return null;
  // Keep the unit word: "7 days" → "{exchange.windowHours} hours" would be wrong, so the whole literal becomes the
  // token followed by the unit word of the value's own text (hours for hours, nothing for money: the token writes ৳).
  const unit = f.detail.unit === 'hours' ? (/[ঀ-৿]/.test(lit) ? ' ঘণ্টা' : ' hours') : '';
  return text.split(lit).join(`${token}${unit}`);
}

/** Tokens a text already uses (a text that quotes the rule by token never drifts). */
export const quotes = (text: string) => tokensIn(text).map((t) => t.raw);
