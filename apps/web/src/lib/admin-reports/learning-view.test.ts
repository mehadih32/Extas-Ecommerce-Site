// PR 543 — the decision learning on the admin screens without a database: the report's screen model (the off and cut
// notes, the four figures, the suggestions, the rule and people tables with notes, Western digits in Bengali), the rule
// names (a duplicate rule's letter and name, a risk section, a proposed hold's rule, the blocklist proposal), and the line
// an open review shows. Every word key exists in both languages. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import type * as od from '@extas/orders';
import { t, type Dict } from '../i18n';
import obn from '../../../messages/admin-orders.bn.json';
import oen from '../../../messages/admin-orders.en.json';
import bn from '../../../messages/admin-learning.bn.json';
import en from '../../../messages/admin-learning.en.json';
import { adminDicts } from '../admin-i18n';
import { learnedLine, learnRuleLabel, learningScreen, type LearningFormat } from './learning-view';

const dict = (lang: 'en' | 'bn'): Dict => ({ ...adminDicts[lang], ...((lang === 'bn' ? bn : en) as unknown as Dict) });
const num = (n: number) => new Intl.NumberFormat('en', { numberingSystem: 'latn' }).format(n);

function fmt(lang: 'en' | 'bn'): LearningFormat {
  const d = dict(lang);
  return {
    w: (k, vars) => t(d, `lrn.${k}`, vars),
    num,
    pct: (x) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' }).format(x),
    when: (iso) => iso.slice(0, 10),
    rule: (key) => learnRuleLabel(d, key),
  };
}

function report(over: Partial<od.LearningReport> = {}): od.LearningReport {
  return {
    enabled: true,
    from: '2026-08-02T06:00:00.000Z',
    to: '2026-10-31T06:00:00.000Z',
    days: 90,
    decisions: 12,
    cut: false,
    rules: [
      { key: 'dup.A', decided: 10, letGo: 9, kept: 1, other: 0, letGoDelivered: 8, letGoRefused: 0 },
      { key: 'gate.levelHold', decided: 2, letGo: 0, kept: 2, other: 0, letGoDelivered: 0, letGoRefused: 0 },
    ],
    suggestions: [{ key: 'dup.A', kind: 'relax', share: 90, decided: 10 }],
    people: [
      { actorType: 'STAFF', actorId: 'u1', name: 'Mim', decided: 10, letGo: 8, kept: 2, other: 0, letGoRefused: 1, rules: [{ key: 'dup.A', letGo: 8, kept: 1 }], notes: [{ decision: 'approve', kind: 'duplicate', note: 'a gift, called', at: '2026-10-30T06:00:00.000Z' }] },
      { actorType: 'STAFF', actorId: 'u2', name: null, decided: 2, letGo: 1, kept: 1, other: 0, letGoRefused: 0, rules: [], notes: [] },
    ],
    minDecisions: 10,
    suggestPercent: 80,
    ...over,
  };
}

describe('PR 543 · the learning screen', () => {
  it('the figures, the suggestion, the tables per rule and per person', () => {
    const s = learningScreen(report(), fmt('en'));
    expect(s.notes).toEqual([]);
    expect(s.kpis.map((k) => [k.id, k.value])).toEqual([
      ['decisions', '12'],
      ['letGo', '9'],
      ['kept', '3'],
      ['refused', '1'],
    ]);
    expect(s.kpis[0]!.foot).toBe('People deciding: 2');
    expect(s.kpis[1]!.foot).toBe("75% of the decisions: the engine's stop was let go");
    expect(s.suggestNote).toContain('at least 10 times');
    expect(s.suggestions).toEqual([{ key: 'dup.A', tone: 'warn', text: expect.stringContaining(`A · ${oen.orders.alert.rule.A}: people let 90% of 10 go`) }]);
    expect(s.rules[0]).toEqual({ key: 'dup.A', label: `A · ${oen.orders.alert.rule.A}`, cells: ['10', '9', '1', '0', '8', '0', '90%'] });
    expect(s.rules[1]!.label).toBe(oen.orders.learn.rule.gate.levelHold);
    expect(s.people[0]).toMatchObject({ name: 'Mim', cells: ['10', '8', '2', '0', '1'], mostly: `A · ${oen.orders.alert.rule.A}: 8 let go, 1 kept`, notes: [{ text: '“a gift, called”', sub: 'Let go · 2026-10-30' }] });
    expect(s.people[1]).toMatchObject({ name: en.lrn.who.STAFF, mostly: '—', notes: [] });
  });

  it('off, cut and empty; Bengali with Western digits', () => {
    const off = learningScreen(report({ enabled: false, decisions: 0, rules: [], suggestions: [], people: [] }), fmt('en'));
    expect(off.notes).toEqual([en.lrn.off]);
    expect(off.kpis[1]!.foot).toBe('—');
    expect(learningScreen(report({ cut: true }), fmt('en')).notes).toEqual([t(en as unknown as Dict, 'lrn.cut', { n: '12' })]);
    const b = learningScreen(report(), fmt('bn'));
    expect(b.kpis[0]!.foot).toBe('2 জন নিয়েছেন');
    expect(b.rules[0]!.cells).toEqual(['10', '9', '1', '0', '8', '0', '90%']);
    expect(b.suggestions[0]!.text.startsWith(`A · ${obn.orders.alert.rule.A}`)).toBe(true);
  });

  it('the rule names and the line on an open review', () => {
    const d = dict('en');
    expect(learnRuleLabel(d, 'dup')).toBe(oen.orders.learn.rule.dup);
    expect(learnRuleLabel(d, 'dup.Z')).toBe('Z · Z');
    expect(learnRuleLabel(d, 'sec.high')).toBe(`Risk review · ${oen.orders.section.high}`);
    expect(learnRuleLabel(d, 'sec.nope')).toBe('Risk review · nope');
    expect(learnRuleLabel(d, 'gate.blocklistHold')).toBe(oen.orders.learn.rule.gate.blocklistHold);
    expect(learnRuleLabel(d, 'gate.unknown')).toBe(oen.orders.learn.rule.unknown);
    expect(learnRuleLabel(d, 'blockProposal')).toBe(oen.orders.learn.rule.blockProposal);
    expect(learnRuleLabel(d, 'other')).toBe(oen.orders.learn.rule.unknown);
    const hint: od.LearnHint = { key: 'dup.A', decided: 10, letGo: 9, kept: 1, other: 0, letGoDelivered: 8, letGoRefused: 1, minDecisions: 10 };
    expect(learnedLine(d, hint, num)).toBe(`Learned from the team: 9 of 10 reviews like this (A · ${oen.orders.alert.rule.A}) were let go; 1 of those came back at the door.`);
    expect(learnedLine(dict('bn'), hint, num)).toContain('10টা');
    expect(learnedLine(d, undefined, num)).toBeNull();
  });

  it('every word exists in English and Bengali', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    expect(keys(obn.orders.learn).sort()).toEqual(keys(oen.orders.learn).sort());
  });
});
