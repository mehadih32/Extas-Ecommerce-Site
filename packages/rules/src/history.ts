// PR 218 — rule history: what changed, when, and by whom. Every publish writes the whole rule as a new version
// (SmartRuleVersion, append-only); nothing is overwritten or deleted, and an old version can be brought back — as a new
// version, so the history still shows that it happened. This module compares two versions field by field, so the
// history reads "Free delivery over: ৳1,500 → ৳2,000" instead of two blobs of JSON.
//
// Pure module.
import { TEXT_SLOTS, type Param, type RuleContent } from './model';

export type ChangeField = 'name' | 'text' | 'param' | 'paramAdded' | 'paramRemoved' | 'scope' | 'conditions' | 'actions' | 'placements' | 'priority' | 'stackable' | 'status' | 'startsAt' | 'endsAt' | 'kind' | 'key';

export interface Change {
  field: ChangeField;
  /** e.g. `text.short.bn`, `params.freeOver`, `placements`. */
  path: string;
  before: unknown;
  after: unknown;
  /** The param's type, for writing its values (money, hours …). */
  paramType?: Param['type'];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed from `a` to `b` (both whole rule contents). */
export function diffContent(a: RuleContent, b: RuleContent): Change[] {
  const out: Change[] = [];
  const push = (field: ChangeField, path: string, before: unknown, after: unknown, paramType?: Param['type']) => {
    if (!same(before, after)) out.push({ field, path, before: before ?? null, after: after ?? null, ...(paramType ? { paramType } : {}) });
  };
  push('key', 'key', a.key, b.key);
  push('kind', 'kind', a.kind, b.kind);
  push('name', 'nameEn', a.nameEn, b.nameEn);
  push('name', 'nameBn', a.nameBn, b.nameBn);
  push('status', 'status', a.status, b.status);
  for (const slot of TEXT_SLOTS) for (const lang of ['en', 'bn'] as const) push('text', `text.${slot}.${lang}`, a.text[slot]?.[lang], b.text[slot]?.[lang]);
  const pa = new Map(a.params.map((p) => [p.key, p as Param]));
  const pb = new Map(b.params.map((p) => [p.key, p as Param]));
  for (const [k, p] of pa) {
    const q = pb.get(k);
    if (!q) out.push({ field: 'paramRemoved', path: `params.${k}`, before: p.value ?? null, after: null, paramType: p.type });
    else {
      push('param', `params.${k}`, p.value, q.value, q.type);
      push('param', `params.${k}.label`, p.labelEn, q.labelEn);
      push('param', `params.${k}.type`, p.type, q.type);
    }
  }
  for (const [k, q] of pb) if (!pa.has(k)) out.push({ field: 'paramAdded', path: `params.${k}`, before: null, after: q.value ?? null, paramType: q.type });
  push('scope', 'scope', a.scope, b.scope);
  push('conditions', 'conditions', a.conditions, b.conditions);
  push('actions', 'actions', a.actions, b.actions);
  push('placements', 'placements', [...a.placements].sort(), [...b.placements].sort());
  push('priority', 'priority', a.priority, b.priority);
  push('stackable', 'stackable', a.stackable, b.stackable);
  push('startsAt', 'startsAt', a.startsAt, b.startsAt);
  push('endsAt', 'endsAt', a.endsAt, b.endsAt);
  return out;
}

/** Fields of a money rule that only change its words: the rest needs the owner's OK again (CLAUDE.md rule 6). */
const WORDS_ONLY: ReadonlySet<ChangeField> = new Set(['name', 'text', 'placements']);

/**
 * The changes of a money rule that move money: everything except its words (name, texts, where it is shown) and the
 * labels of its values. Switching it on or off, a value, the products it covers, its conditions, window, priority and
 * stacking all change what customers pay.
 */
export function moneyChanges(changes: Change[]): Change[] {
  return changes.filter((c) => !WORDS_ONLY.has(c.field) && !(c.field === 'param' && (c.path.endsWith('.label') || c.paramType === 'text')));
}
