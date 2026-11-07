// PR 286 follow-up 477: folding "Who looked at this customer" — repeated opens by the same person within the owner's
// minutes of each other become one line; a copy or a call, another person or a longer gap starts a new line.
import { describe, expect, it } from 'vitest';
import { foldAccess } from './access';

const at = (min: number) => new Date(Date.UTC(2026, 10, 7, 10, 0) - min * 60_000);
const row = (min: number, action: string, staffUserId: string | null = 'u1') => ({ createdAt: at(min), action, staffUserId });

describe('foldAccess', () => {
  it('folds a run of opens by one person whose gaps are within the minutes', () => {
    const out = foldAccess([row(0, 'profile.open'), row(3, 'profile.open'), row(6, 'profile.open'), row(20, 'profile.open')], 5);
    expect(out.map((r) => [r.count, r.createdAt, r.from])).toEqual([
      [3, at(0), at(6)],
      [1, at(20), at(20)],
    ]);
  });

  it('never folds copies or calls, another person, or anything while the fold is off', () => {
    expect(foldAccess([row(0, 'phone.copy'), row(1, 'phone.copy')], 5).map((r) => r.count)).toEqual([1, 1]);
    expect(foldAccess([row(0, 'profile.open'), row(1, 'profile.open', 'u2'), row(2, 'profile.open')], 5).map((r) => r.count)).toEqual([1, 1, 1]);
    expect(foldAccess([row(0, 'profile.open'), row(1, 'phone.call'), row(2, 'profile.open')], 5).map((r) => r.count)).toEqual([1, 1, 1]);
    expect(foldAccess([row(0, 'profile.open'), row(1, 'profile.open')], null).map((r) => r.count)).toEqual([1, 1]);
  });
});
