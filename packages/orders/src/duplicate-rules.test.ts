// S06 · PR 520 — the duplicate & re-order rules engine, pure: each scenario fires on its own facts and only then, each
// rule's switch, window and confidence count, the strongest proposal wins, and no rule ever proposes a block.
import { describe, expect, it } from 'vitest';
import { RULE_ACTIONS, riskRulesSettings, type DuplicateRules } from '@extas/settings';
import { duplicateRuleHits, itemConfidence, type RuleCandidate, type RuleFacts } from './duplicate-rules';
import type { LineFacts } from './pure';

const base = riskRulesSettings['risk.duplicateRules'].default;
const at = new Date('2026-10-24T10:00:00Z');
const ago = (min: number) => new Date(at.getTime() - min * 60_000);
const line = (variantId: string, productId: string, colourId = 'c1', cat = 'k1'): LineFacts => ({ variantId, productId, colourId, categoryIds: [cat] });
const shirtM = line('v-shirt-m', 'p-shirt');
const shirtL = line('v-shirt-l', 'p-shirt');
const pant = line('v-pant', 'p-pant', 'c2', 'k2');

/** Every rule on (the master too), the rest as the owner's defaults. */
function on(over: Partial<{ [K in keyof DuplicateRules['rules']]: Partial<DuplicateRules['rules'][K]> }> = {}): DuplicateRules {
  const rules = Object.fromEntries(Object.entries(base.rules).map(([k, r]) => [k, { ...r, enabled: true, ...(over as Record<string, object>)[k] }])) as DuplicateRules['rules'];
  return { enabled: true, rules };
}
const cand = (over: Partial<RuleCandidate>): RuleCandidate => ({ orderId: 'o1', number: '1001', status: 'PLACED', placedAt: ago(5), lines: [shirtM], pieces: 1, by: 'phone', ...over });
const facts = (over: Partial<RuleFacts> = {}): RuleFacts => ({ placedAt: at, lines: [shirtM], pieces: 1, candidates: [], addresses: [], blocked: [], ...over });
const rules = (f: RuleFacts, cfg: DuplicateRules) => duplicateRuleHits(f, cfg).hits.map((h) => h.rule);

describe('PR 520 · the duplicate rules engine', () => {
  it('off (the default): nothing fires, whatever the facts', () => {
    expect(base.enabled).toBe(false);
    expect(duplicateRuleHits(facts({ candidates: [cand({})] }), base)).toEqual({ hits: [], top: null });
  });

  it('no rule proposes a block: the actions are cancel, hold, warn and allow only', () => {
    expect([...RULE_ACTIONS].sort()).toEqual(['allow', 'cancel', 'hold', 'warn']);
  });

  it('item confidence: the very same pieces 100, the same SKU 90, another colour 60, the same category 30', () => {
    expect(itemConfidence([shirtM], [shirtM])).toEqual({ confidence: 100, severity: 'high' });
    expect(itemConfidence([shirtM, pant], [shirtM]).confidence).toBe(90);
    expect(itemConfidence([shirtM], [line('v-x', 'p-shirt', 'c9')]).confidence).toBe(60);
    expect(itemConfidence([shirtM], [line('v-y', 'p-other', 'c9')]).confidence).toBe(30);
    expect(itemConfidence([shirtM], [pant])).toEqual({ confidence: 0, severity: null });
  });

  it('A: the same items again before the courier; proposes cancel; an identity match counts a little less', () => {
    const r = duplicateRuleHits(facts({ candidates: [cand({})] }), on({ B: { enabled: false } }));
    expect(r.hits[0]).toMatchObject({ rule: 'A', action: 'cancel', suggest: 'cancel', confidence: 100, matches: [{ orderId: 'o1', number: '1001', confidence: 100, severity: 'high' }] });
    expect(r.top).toBe('cancel');
    expect(duplicateRuleHits(facts({ candidates: [cand({ by: 'identity' })] }), on()).hits.find((h) => h.rule === 'A')?.confidence).toBe(80);
    // with the courier already: not A (that is C)
    expect(rules(facts({ candidates: [cand({ status: 'IN_TRANSIT' })] }), on())).not.toContain('A');
  });

  it('A: its window and its confidence count, each on its own', () => {
    expect(rules(facts({ candidates: [cand({ placedAt: ago(200) })] }), on({ A: { windowMinutes: 60 } }))).not.toContain('A');
    expect(rules(facts({ candidates: [cand({ placedAt: ago(200) })] }), on({ A: { windowMinutes: 0 } }))).toContain('A');
    expect(rules(facts({ candidates: [cand({ by: 'identity' })] }), on({ A: { minConfidence: 90 } }))).not.toContain('A');
    expect(rules(facts({ candidates: [cand({})] }), on({ A: { enabled: false } }))).not.toContain('A');
  });

  it('B: different items in the window: a note (warn), suggests one parcel', () => {
    const r = duplicateRuleHits(facts({ candidates: [cand({ lines: [pant] })] }), on());
    expect(r.hits.map((h) => h.rule)).toEqual(['B']);
    expect(r.hits[0]).toMatchObject({ action: 'warn', suggest: 'merge', confidence: 100 });
    expect(r.top).toBe('warn');
  });

  it('C: a parcel of his with the courier: hold, suggests an add-on', () => {
    const r = duplicateRuleHits(facts({ candidates: [cand({ status: 'HANDED_OVER', lines: [pant] })] }), on());
    expect(r.hits.map((h) => h.rule)).toEqual(['C']);
    expect(r.hits[0]).toMatchObject({ action: 'hold', suggest: 'addOn', confidence: 40 });
    expect(r.top).toBe('hold');
  });

  it('D: an alike address under a new phone, at the owner\'s confidence', () => {
    const f = facts({ addresses: [{ orderId: 'o9', number: '0909', status: 'DELIVERED', placedAt: ago(60 * 24 * 30), similarity: 0.82 }] });
    expect(duplicateRuleHits(f, on()).hits).toEqual([expect.objectContaining({ rule: 'D', confidence: 82, suggest: 'identity', matches: [expect.objectContaining({ orderId: 'o9' })] })]);
    expect(rules(f, on({ D: { minConfidence: 90 } }))).toEqual([]);
    expect(rules(f, on({ D: { windowMinutes: 60 * 24 } }))).toEqual([]);
  });

  it('E: the same style in another size in his other open order: suggests an exchange', () => {
    const r = duplicateRuleHits(facts({ candidates: [cand({ lines: [shirtL] })] }), on());
    expect(r.hits.map((h) => h.rule)).toContain('E');
    expect(r.hits.find((h) => h.rule === 'E')).toMatchObject({ suggest: 'exchange', confidence: 80 });
  });

  it('H: a blocked number, account, identity or address: hold; an address by how alike it is', () => {
    const r = duplicateRuleHits(facts({ blocked: [{ entryId: 'b1', how: 'address', similarity: 0.75, blockedAt: ago(10) }, { entryId: 'b2', how: 'identity', blockedAt: null }] }), on());
    expect(r.hits).toEqual([expect.objectContaining({ rule: 'H', action: 'hold', suggest: 'blocked', confidence: 90, blocked: ['b1', 'b2'], values: expect.objectContaining({ how: 'address,identity' }) })]);
    expect(rules(facts({ blocked: [{ entryId: 'b1', how: 'address', similarity: 0.5, blockedAt: null }] }), on())).toEqual([]);
    expect(rules(facts({ blocked: [{ entryId: 'b1', how: 'phone', blockedAt: ago(10) }] }), on({ H: { enabled: false } }))).toEqual([]);
  });

  it('I: bulk-looking — the pieces of this order, or with his open orders in the window', () => {
    expect(duplicateRuleHits(facts({ pieces: 12 }), on()).hits).toEqual([expect.objectContaining({ rule: 'I', suggest: 'bulk', values: expect.objectContaining({ pieces: 12, atLeast: 10 }) })]);
    expect(rules(facts({ pieces: 9 }), on())).toEqual([]);
    const two = facts({ pieces: 6, candidates: [cand({ lines: [pant], pieces: 6 })] });
    expect(rules(two, on({ B: { enabled: false } }))).toEqual([]);
    expect(rules(two, on({ B: { enabled: false }, I: { windowMinutes: 60 } }))).toEqual(['I']);
  });

  it('the strongest proposal wins: cancel over hold over warn over allow', () => {
    const f = facts({ pieces: 12, candidates: [cand({}), cand({ orderId: 'o2', number: '1002', status: 'IN_TRANSIT' })] });
    const r = duplicateRuleHits(f, on({ I: { action: 'allow' } }));
    expect(r.hits.map((h) => h.rule).sort()).toEqual(['A', 'C', 'I']);
    expect(r.top).toBe('cancel');
    expect(duplicateRuleHits(f, on({ A: { action: 'warn' }, C: { action: 'warn' }, I: { action: 'allow' } })).top).toBe('warn');
    expect(duplicateRuleHits(facts({ pieces: 12 }), on({ I: { action: 'allow' } })).top).toBe('allow');
  });
});
