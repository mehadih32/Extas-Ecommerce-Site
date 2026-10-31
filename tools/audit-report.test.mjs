// S21 · PR 570 — the checklist in the backend and the audit's report: the JSON is current with the checklist; marks,
// words and groups are read right; a group fails on its own pages or journeys, passes when its checks ran, and
// otherwise waits for the (mock) agents; the chosen groups only; no run at all is never a pass.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_OUT, CHECKLIST, markOf, OUT, parseChecklist, render } from './audit-checklist.mjs';
import { auditReport, readme } from './audit-report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the checklist in the backend (PR 570)', () => {
  it('docs/qa/audit-checklist.json is current with the checklist (run node tools/audit-checklist.mjs)', () => {
    expect(read(OUT)).toBe(render(read(CHECKLIST)));
    expect(read(APP_OUT)).toBe(read(OUT));
  });

  it('the newest mark wins; words come without marks and notes; L32/L33 are their own group', () => {
    expect(markOf('✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** x')).toBe('pass');
    expect(markOf('⬜ · **R15b ❌** text')).toBe('fail');
    expect(markOf('— · **R15b —** · **R15d —** Send bag')).toBe('notTestable');
    const md = [
      '## 8. Bag',
      '- [B05] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15d ✅** (bug 9 fixed — see "Fixed (R15 wave 2)"; for the QA re-check) Changing size works. *(R15b bug 9: no (size))*',
      '- [B06] 🔒 · **R15d 🔒** Real phone number shows.',
      '## Added 19 Oct 21:12 (owner catch)',
      '| ID | Check | Where |',
      '|---|---|---|',
      '| L32 | Sliders stop **TA-2 20 Oct: ✅ resumes** | all sliders, desktop |',
      '## Notes',
      '- [X01] ✅ not in a group',
    ].join('\n');
    expect(parseChecklist(md)).toEqual([
      { id: '8', title: 'Bag', points: [{ id: 'B05', text: 'Changing size works.', mark: 'pass' }, { id: 'B06', text: 'Real phone number shows.', mark: 'ownerData' }] },
      { id: 'timing', title: 'Pauses and resumes (L32, L33)', points: [{ id: 'L32', text: 'Sliders stop', mark: 'pass', where: 'all sliders, desktop' }] },
    ]);
  });
});

describe('the audit report (PR 570)', () => {
  const checklist = {
    groups: [
      { id: '6', title: 'Product page', points: [{}, {}] },
      { id: '8', title: 'Bag', points: [{}, {}, {}] },
      { id: '14', title: 'Accessibility', points: [{}] },
      { id: '23', title: 'Admin basics', points: [{}] },
    ],
  };
  const cover = { 6: { paths: ['^/(bn/)?p/'], journeys: ['customer'] }, 8: { paths: ['^/(bn/)?bag'], journeys: [] }, 23: { paths: ['*admin'], journeys: ['admin'] } };
  const rows = [
    { path: '/p/polo', screen: 'phone', ok: true },
    { path: '/bag', screen: 'phone', ok: false, problems: ['console error'] },
    { path: '/bn/bag', screen: 'desktop', ok: true },
    { path: '/admin/orders', screen: 'desktop', ok: true },
  ];
  const journeys = { ok: false, problems: ['admin (desktop) step 2 Open orders: answered 500'] };
  const base = { checklist, cover, rows, journeys, chosen: [], agents: 2, at: '2026-10-31 10:00', sha: 'abc', kind: 'run now' };

  it('each group from its own pages and journeys; the rest waits for the agents (a mock)', () => {
    const r = auditReport(base);
    expect(r.groups.map((g) => [g.id, g.status, g.pages, g.failedPages, g.failedSteps])).toEqual([
      ['6', 'pass', 1, 0, 0],
      ['8', 'fail', 2, 1, 0],
      ['14', 'agents', 0, 0, 0],
      ['23', 'fail', 1, 0, 1],
    ]);
    expect([r.ok, r.chosen, r.points, r.passedGroups, r.failedGroups, r.agentGroups]).toEqual([false, 4, 7, 1, 2, 1]);
    expect(r.agents).toEqual({ asked: 2, ran: 0, mode: 'mock' });
    expect(r.problems).toEqual(['8. Bag: /bag (phone): console error', '23. Admin basics: admin (desktop) step 2 Open orders: answered 500']);
    expect(readme(r)).toContain('| 8 | Bag | 3 | fail | 2 / 1 | 0 |');
  });

  it('only the chosen groups; a run with nothing at all is never a pass', () => {
    const r = auditReport({ ...base, chosen: ['6', '14'] });
    expect([r.ok, r.groups.map((g) => g.id)]).toEqual([true, ['6', '14']]);
    const none = auditReport({ ...base, rows: null, journeys: null });
    expect([none.ok, none.groups.map((g) => g.status)]).toEqual([false, ['agents', 'agents', 'agents', 'agents']]);
  });

  it('every group of the real checklist has a cover entry or waits for the agents; cover ids exist', () => {
    const real = JSON.parse(read('docs/qa/audit-checklist.json'));
    const groups = JSON.parse(read('docs/qa/audit-groups.json')).groups;
    const ids = new Set(real.groups.map((g) => g.id));
    for (const id of Object.keys(groups)) expect(ids.has(id)).toBe(true);
    for (const g of Object.values(groups)) for (const p of g.paths) if (!p.startsWith('*')) expect(() => new RegExp(p)).not.toThrow();
  });
});
