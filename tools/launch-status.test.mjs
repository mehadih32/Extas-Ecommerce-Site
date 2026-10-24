import { describe, expect, it } from 'vitest';
import { compareLaunch, launchCount, launchLabel, launchPrs, readmeLaunch } from './launch-status.mjs';

const track = `# Launch track

## Launch

| # | PR | Stage | What it does | Status |
|---:|---:|---|---|---|
| 1 | 602 | S02 | cache | to build |
| — | gate | CN-013 | the simulation rerun | to run |
| 2 | 165 | S07 | payment model | to build |

<details><summary>Launch PRs already built (2)</summary>

| PR | Stage | What it does | Status |
|---:|---|---|---|
| 1 | S0A | VPS | live |
| 165 | S07 | listed twice, counted once | merged |

</details>

## After launch

| # | PR | Stage | What it does | Status |
|---:|---:|---|---|---|
| 1 | 597 | S02 | launch default | to build |
`;

const register = `# Register

## Build status

| PR | Stage | State | Date | Note |
|---|---|---|---|---|
| 1 | S0A | live | 2026-10-20 | |
| 165 | S07 | merged | 2026-10-24 | |
| 597 | S02 | merged | 2026-10-24 | after launch, not counted |
`;

const readme = (row) => `# Project

## Status

| Item | Now |
|---|---|
| Stages | S0A 1/1 · total 3/600 |
${row}

## Next
`;

describe('CN-027 · Launch X/N', () => {
  it('reads the Launch section only (both tables, each PR once, the gate row skipped)', () => {
    expect(launchPrs(track)).toEqual([602, 165, 1]);
  });

  it('counts the merged and live ones', () => {
    const c = launchCount({ track, register });
    expect(c).toEqual({ done: 2, total: 3, left: 1 });
    expect(launchLabel(c)).toBe('Launch 2/3');
  });

  it("checks README's Launch row", () => {
    expect(readmeLaunch(readme('| Launch | **Launch 2/3** before real orders |'))).toBe('Launch 2/3 before real orders');
    expect(compareLaunch({ readme: readme('| Launch | **Launch 2/3** |'), track, register })).toEqual([]);
    expect(compareLaunch({ readme: readme('| Launch | **Launch 1/3** |'), track, register })[0]).toMatch(/README says "Launch 1\/3".*"Launch 2\/3"/);
    expect(compareLaunch({ readme: readme(''), track, register })[0]).toMatch(/no "Launch" row/);
  });
});
