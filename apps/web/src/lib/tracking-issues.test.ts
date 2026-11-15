// PR 847 — which ticked platforms may miss sales.
import { describe, expect, it } from 'vitest';
import { platformsWithIssues } from './tracking-issues';

const p = (ticked: boolean, connected: boolean, ok: boolean | null) => ({ ticked, connected, lastTest: ok === null ? null : { ok } });

describe('platformsWithIssues', () => {
  it('counts a ticked platform that is on the practice copy, never tested, or failed its last test', () => {
    expect(platformsWithIssues([p(true, false, true), p(true, true, null), p(true, true, false)])).toBe(3);
  });
  it('does not count a platform that is connected and passed, or one that is not ticked', () => {
    expect(platformsWithIssues([p(true, true, true), p(false, false, null)])).toBe(0);
  });
});
