// S06 · PR 543 — Reports › Decisions & learning: the screen model of one learning report (@extas/orders learningReport),
// built on the server with the page's words (messages/admin-learning.*.json, `lrn.*`): the off and cut notes, the four
// figures, the suggestions, the table per rule and per person (with their latest notes). Also the rule names (the
// orders words `orders.learn.rule.*`, shared with the order page) and the line an open review shows ("Learned from the
// team: 9 of 10 reviews like this were let go …"). Nothing here acts.
import type { LearnHint, LearningReport } from '@extas/orders';
import { t, type Dict } from '../i18n';

export type Words = (key: string, vars?: Record<string, string | number>) => string;

/** A word of the dictionary, or null when it has none. */
function maybe(d: Dict, key: string, vars?: Record<string, string | number>): string | null {
  const v = t(d, key, vars);
  return v === key ? null : v;
}

/** The owner's name of a learning rule key ("dup.A", "sec.high", "gate.levelHold", "blockProposal"). */
export function learnRuleLabel(d: Dict, key: string): string {
  const dot = key.indexOf('.');
  const head = dot < 0 ? key : key.slice(0, dot);
  const rest = dot < 0 ? '' : key.slice(dot + 1);
  if (key === 'dup') return t(d, 'orders.learn.rule.dup');
  if (head === 'dup') return t(d, 'orders.learn.rule.dupLetter', { letter: rest, name: maybe(d, `orders.alert.rule.${rest}`) ?? rest });
  if (head === 'sec') return t(d, 'orders.learn.rule.sec', { name: maybe(d, `orders.section.${rest}`) ?? rest });
  if (head === 'gate') return maybe(d, `orders.learn.rule.gate.${rest}`) ?? t(d, 'orders.learn.rule.unknown');
  if (key === 'blockProposal') return t(d, 'orders.learn.rule.blockProposal');
  return t(d, 'orders.learn.rule.unknown');
}

/** The line an open review shows: what the team did with reviews like it, or null. */
export function learnedLine(d: Dict, hint: LearnHint | undefined, num: (n: number) => string): string | null {
  if (!hint) return null;
  return t(d, 'orders.learn.hint', { letGo: num(hint.letGo), decided: num(hint.decided), refused: num(hint.letGoRefused), rule: learnRuleLabel(d, hint.key) });
}

export interface LearningFormat {
  w: Words;
  num: (n: number) => string;
  pct: (share: number) => string;
  when: (iso: string) => string;
  rule: (key: string) => string;
}

export interface LearningKpi {
  id: 'decisions' | 'letGo' | 'kept' | 'refused';
  label: string;
  value: string;
  foot: string;
}

export interface LearningScreen {
  notes: string[];
  kpis: LearningKpi[];
  suggestNote: string;
  suggestions: { key: string; tone: 'warn' | 'ok'; text: string }[];
  ruleCols: string[];
  rules: { key: string; label: string; cells: string[] }[];
  peopleCols: string[];
  people: { key: string; name: string; cells: string[]; mostly: string; notes: { text: string; sub: string }[] }[];
}

export function learningScreen(r: LearningReport, f: LearningFormat): LearningScreen {
  const { w, num } = f;
  const sum = (k: 'letGo' | 'kept' | 'letGoRefused') => r.people.reduce((a, p) => a + p[k], 0);
  const notes = [...(r.enabled ? [] : [w('off')]), ...(r.cut ? [w('cut', { n: num(r.decisions) })] : [])];
  const letGo = sum('letGo');
  const kpis: LearningKpi[] = [
    { id: 'decisions', label: w('kpi.decisions'), value: num(r.decisions), foot: w('kpi.decisionsFoot', { people: num(r.people.length) }) },
    { id: 'letGo', label: w('kpi.letGo'), value: num(letGo), foot: r.decisions ? w('kpi.letGoFoot', { pct: f.pct(letGo / r.decisions) }) : '—' },
    { id: 'kept', label: w('kpi.kept'), value: num(sum('kept')), foot: w('kpi.keptFoot') },
    { id: 'refused', label: w('kpi.refused'), value: num(sum('letGoRefused')), foot: w('kpi.refusedFoot') },
  ];
  const share = (n: number, of: number) => (of ? f.pct(n / of) : '—');
  return {
    notes,
    kpis,
    suggestNote: w('sug.d', { n: num(r.minDecisions), pct: f.pct(r.suggestPercent / 100) }),
    suggestions: r.suggestions.map((s) => ({ key: s.key, tone: s.kind === 'relax' ? 'warn' : 'ok', text: w(`sug.${s.kind}`, { rule: f.rule(s.key), share: f.pct(s.share / 100), n: num(s.decided) }) })),
    ruleCols: ['rule', 'decided', 'letGo', 'kept', 'other', 'letGoDelivered', 'letGoRefused', 'letGoShare'].map((c) => w(`col.${c}`)),
    rules: r.rules.map((t) => ({ key: t.key, label: f.rule(t.key), cells: [num(t.decided), num(t.letGo), num(t.kept), num(t.other), num(t.letGoDelivered), num(t.letGoRefused), share(t.letGo, t.decided)] })),
    peopleCols: ['person', 'decided', 'letGo', 'kept', 'other', 'letGoRefused', 'mostly', 'notes'].map((c) => w(`col.${c}`)),
    people: r.people.map((p) => ({
      key: `${p.actorType}:${p.actorId ?? ''}`,
      name: p.name ?? w(`who.${p.actorType}`),
      cells: [num(p.decided), num(p.letGo), num(p.kept), num(p.other), num(p.letGoRefused)],
      mostly: p.rules.map((x) => w('ruleLine', { rule: f.rule(x.key), letGo: num(x.letGo), kept: num(x.kept) })).join('; ') || '—',
      notes: p.notes.map((n) => ({ text: `“${n.note}”`, sub: w('noteSub', { decision: w(`dec.${n.decision}`), when: f.when(n.at) }) })),
    })),
  };
}
