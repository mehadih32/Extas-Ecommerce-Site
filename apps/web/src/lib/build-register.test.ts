// S21 · PR 594 — the PR register read from docs/MASTER-REGISTER.md: a small made-up register, then the real file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandRange, markerDate, parseRegister, prMatches, prRefs, splitUpdates, stateCounts, titleOf } from './build-register';

const SAMPLE = [
  '# Register',
  '',
  '**5 PRs · 2 stages · as of 25 October 2026**',
  '',
  '## Build status',
  '',
  '**Progress: SA 1/3 · SB 0/2 · total 1/5**',
  '',
  '| PR | Stage | State | Date | Note |',
  '|---|---|---|---|---|',
  '| 1 | SA | merged | 2026-10-20 | first cut |',
  '| 1 | SA | live | 2026-10-22 | on the server |',
  '| 2 | SA | merged | 2026-10-21 | |',
  '',
  '## The stage table',
  '',
  '| # | Stage | PRs | Range | Status |',
  '|---|---|---:|---|---|',
  '| S0A | Server | 3 | 1–2, 5 | locked |',
  '| S26 | Handover | 2 | 3–4 | **parked** |',
  '',
  '## S0A · Server — PR 1–2',
  '*Runs first.*',
  '',
  '| PR | What it does |',
  '|---:|---|',
  '| 1 | **Server set-up** — disks and users. **Updated 20 Oct 01:30 (CN-003):** a runner on the VM. **Updated 23 Oct 2026 (CN-014):** guides, see PR 2. |',
  '| 2 | Hardening — ~~old way~~ keys only; builds on PR 1 |',
  '| 5 | **Docs copy** on every deploy |',
  '',
  '## S26 · Handover',
  '',
  '| PR | What it does |',
  '|---:|---|',
  '| 3 | **Install pack** |',
  '',
  '> **CN-003 · 20 Oct 2026 (runner).** The server is reached through a runner (PR 1).',
  '>',
  '> **(2) Where.** Updated lines on PR 1 and 5.',
].join('\n');

const BLUEPRINT = [
  '# Appendix A · Every PR, 1–5',
  '',
  '| PR | Title | Stage | Status | Owner | Demo reference |',
  '|---:|---|---|---|---|---|',
  '| 1 | Server set-up | S0A | Filed | Prohori | |',
  '| 3 | Install pack | S26 | Parked | Gyani | |',
  '| 4 | Handover manual — stage scope item *(derived)* | S26 | Parked | Gyani | |',
  '| 9 | Not in any stage | S99 | Filed | Gyani | |',
].join('\n');

describe('PR 594 · reading the register', () => {
  const reg = parseRegister(SAMPLE, BLUEPRINT);

  it('reads the stages with their PRs, intro and parked flag', () => {
    expect(reg.asOf).toBe('5 PRs · 2 stages · as of 25 October 2026');
    expect(reg.progress).toBe('SA 1/3 · SB 0/2 · total 1/5');
    expect(reg.stages.map((s) => [s.id, s.count, s.prs, s.parked])).toEqual([
      ['S0A', 3, [1, 2, 5], false],
      ['S26', 2, [3, 4], true],
    ]);
    expect(reg.stages[0]!.intro).toBe('Runs first.');
  });

  it('reads each PR: title, what it does, dated updates, state, change notes and the PRs it names', () => {
    const one = reg.prs.get(1)!;
    expect(one).toMatchObject({ n: 1, stage: 'S0A', title: 'Server set-up', state: 'live', stateDate: '2026-10-22' });
    expect(one.text).toBe('**Server set-up** — disks and users.');
    expect(one.updates.map((u) => u.date)).toEqual(['20 Oct 01:30', '23 Oct 2026']);
    expect(one.updates[1]!.text).toContain('guides, see PR 2');
    expect(one.status).toHaveLength(2);
    expect(one.buildsOn).toEqual([2]);
    expect(one.notes).toEqual([{ id: 'CN-003', head: '20 Oct 2026 (runner)', text: 'The server is reached through a runner (PR 1).' }]);
    expect(reg.prs.get(5)!.notes[0]!.text).toContain('Updated lines on PR 1 and 5');
    expect(reg.prs.get(2)).toMatchObject({ title: 'Hardening', state: 'merged', buildsOn: [1] });
    expect(reg.prs.get(3)).toMatchObject({ state: 'parked', stage: 'S26', title: 'Install pack', derived: false, owner: 'Gyani' });
    expect(one.owner).toBe('Prohori');
    expect(reg.prs.has(9)).toBe(false);
    expect(reg.prs.get(4)).toMatchObject({ title: 'Handover manual', text: 'Handover manual — stage scope item', derived: true, state: 'parked', updates: [] });
    expect(reg.prs.get(5)).toMatchObject({ state: 'todo', stateDate: '' });
    expect(stateCounts(reg.prs.values())).toEqual({ live: 1, merged: 1, todo: 1, parked: 2 });
  });

  it('searches by number or by every word', () => {
    const one = reg.prs.get(1)!;
    expect(prMatches(one, '1')).toBe(true);
    expect(prMatches(one, '12')).toBe(false);
    expect(prMatches(one, 'runner DISKS')).toBe(true);
    expect(prMatches(one, 'runner photo')).toBe(false);
  });

  it('reads ranges, PR mentions, marker dates and titles', () => {
    expect(expandRange('1–3, 601, x, 5-6')).toEqual([1, 2, 3, 601, 5, 6]);
    expect(prRefs('see PRs 571–573 and PR 4/17, PR 148, 292 and 545')).toEqual([571, 572, 573, 4, 17, 148, 292, 545]);
    expect(prRefs('PR 1–900')).toEqual([]);
    expect(markerDate('Updated 20 Oct 01:30 (CN-003)').date).toBe('20 Oct 01:30');
    expect(markerDate('Updated 23 Oct 2026 (CN-014)').date).toBe('23 Oct 2026');
    expect(markerDate('Updated 20 Oct').key).toBeLessThan(markerDate('Updated 21 Oct').key);
    expect(markerDate('no date').date).toBe('');
    expect(splitUpdates('plain text').updates).toEqual([]);
    expect(titleOf('~~Old~~ New thing — more')).toBe('New thing');
  });
});

describe('PR 594 · the real register', () => {
  const md = readFileSync(join(__dirname, '../../../../docs/MASTER-REGISTER.md'), 'utf8');
  const reg = parseRegister(md, readFileSync(join(__dirname, '../../../../docs/BLUEPRINT.md'), 'utf8'));

  it('has S0A and S00–S27, every numbered PR of them, and this PR on its card', () => {
    expect(reg.stages).toHaveLength(29); // hardcode-ok: S0A plus S00–S27 (the register's "28 stages" leaves S0A out)
    const numbered = reg.stages.flatMap((s) => s.prs);
    const missing = numbered.filter((n) => !reg.prs.has(n));
    expect(missing).toEqual([]);
    const total = Number(/^\*\*(\d+) PRs/m.exec(md)![1]);
    expect(reg.prs.size).toBe(total);
    const me = reg.prs.get(594)!;
    expect(me.stage).toBe('S21');
    expect(me.title).toMatch(/PR register inside the backend/);
    expect(me.updates.length).toBeGreaterThan(0);
    expect(me.owner).not.toBe('');
    expect(reg.prs.get(1)!.state).toBe('live');
    // a PR only the blueprint's index names (S16 is stage scope in the register)
    expect(reg.prs.get(343)).toMatchObject({ stage: 'S16', derived: true });
  });
});
