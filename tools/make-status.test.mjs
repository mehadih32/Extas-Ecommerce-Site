import { describe, expect, it } from 'vitest';
import { buildStatus, expandRange, tableAfter } from './make-status.mjs';

const register = `
## Build status

| PR | Stage | State | Date | Note |
|---|---|---|---|---|
| 1 | S0A | live | 2026-10-20 | x |
| 2 | S0A | merged | 2026-10-20 | y |
| 11 | S00 | filed | | |

## The stage table

| Stage | Name | PRs | Range | Status |
|---|---|---|---|---|
| S0A | Server **foundation** | 3 | 1–3 | locked |
| S00 | Foundation | 2 | 11, 12 | locked |
| S26 | Old idea | 1 | 900 | **parked** |
`;
const blocked = `# BLOCKED — owner

| # | কী লাগবে | কেন | অবস্থা |
|---|---|---|---|
| 1 | ~~runner~~ | ssh | **হয়ে গেছে** |
| 2 | পাসওয়ার্ড দেখে নিন | বদলানো হয়েছে | আপনার জন্য অপেক্ষা |
| 3 | prices | default | ব্লক নয় |
`;

describe('expandRange', () => {
  it('expands dashes and lists', () => {
    expect(expandRange('1–3, 601, 604')).toEqual([1, 2, 3, 601, 604]);
    expect(expandRange('491-493')).toEqual([491, 492, 493]);
  });
});

describe('tableAfter', () => {
  it('reads the first table under a heading, without the header row', () => {
    expect(tableAfter(register, '## Build status').map((r) => r[0])).toEqual(['1', '2', '11']);
    expect(tableAfter(register, '## Missing')).toEqual([]);
  });
});

describe('buildStatus', () => {
  const s = buildStatus({ register, blocked, now: 'T', commit: 'abc' });
  it('counts merged and live PRs per stage', () => {
    expect(s.stages[0]).toMatchObject({ id: 'S0A', name: 'Server foundation', total: 3, done: 2, live: 1 });
    expect(s.stages[1]).toMatchObject({ id: 'S00', done: 0, total: 2 });
  });
  it('leaves parked stages out of the total', () => {
    expect(s.stages[2]).toMatchObject({ parked: true, total: 0 });
    expect(s.totals).toEqual({ active: 5, done: 2 });
  });
  it('lists only what still waits for the owner', () => {
    expect(s.waiting).toEqual([{ n: '2', what: 'পাসওয়ার্ড দেখে নিন', why: 'বদলানো হয়েছে', state: 'আপনার জন্য অপেক্ষা' }]);
  });
});
