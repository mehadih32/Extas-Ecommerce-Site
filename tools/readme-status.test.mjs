import { describe, expect, it } from 'vitest';
import { compare, parseCounts, readmeStages, registerProgress } from './readme-status.mjs';

const register = `# Register

**Progress: S0A 12/12 · S00 19/19 · S01 22/22 · total 53/598**

| PR | Stage |
`;

const readme = (stages) => `# Project

## Status (updated after every merged PR)

| Item | Now |
|---|---|
| Stages | ${stages} |
| Live on | somewhere |

## Where things are
`;

describe('readme status check', () => {
  it('reads the counts, ignoring bold, struck text and words like "next"', () => {
    expect(parseCounts('**S0A 12/12 · S01 19/22** · ~~S02 1/9~~ · S09 next · total **50/598** active PRs')).toEqual({
      stages: { S0A: '12/12', S01: '19/22' },
      total: '50/598',
    });
  });

  it('finds the register progress line and the README stages row', () => {
    expect(registerProgress(register)).toBe('S0A 12/12 · S00 19/19 · S01 22/22 · total 53/598');
    expect(readmeStages(readme('**S0A 12/12** · total **1/2**'))).toBe('**S0A 12/12** · total **1/2**');
  });

  it('passes when the README agrees', () => {
    expect(compare({ register, readme: readme('**S0A 12/12 · S00 19/19 · S01 22/22** (wave 1 done) · wave 2 started: S02 0/58 · S03 0/22 · total **53/598** active PRs') })).toEqual([]);
  });

  it('fails on a stale stage count, a stale total, a missing stage and an extra stage', () => {
    const problems = compare({ register, readme: readme('S0A 12/12 · S01 19/22 · S05 1/9 · total 50/598') });
    expect(problems).toEqual([
      'total: README says 50/598, the register says 53/598',
      'S00: README does not show it, the register says 19/19',
      'S01: README says 19/22, the register says 22/22',
      'S05: README says 1/9, the register progress line has no S05',
    ]);
  });

  it('fails when either side is missing', () => {
    expect(compare({ register: '# nothing', readme: readme('S0A 1/1') })).toHaveLength(1);
    expect(compare({ register, readme: '# no status' })).toHaveLength(1);
  });
});
