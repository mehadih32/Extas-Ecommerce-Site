// S12 · PR 593 — the author team's pure model: pillar coverage is exactly the demo's five-way split, every seed has
// an honest bio in both languages, the pillar matcher and the reviewer rotation (never the writer, least-loaded next,
// stable ties). Every value is made up.
import { describe, expect, it } from 'vitest';
import { AUTHOR_TEAM, PILLARS, authorForPillar, isPillarId, pickReviewer, type AiAuthorRow } from './authors-model';

describe('the author team (PR 593)', () => {
  it('covers every pillar exactly once across the five seeds, each with a non-empty bio in both languages', () => {
    const covered = AUTHOR_TEAM.flatMap((a) => a.pillars);
    expect(new Set(covered)).toEqual(new Set(PILLARS));
    expect(covered.length).toBe(PILLARS.length); // no pillar shared, none missing
    for (const a of AUTHOR_TEAM) {
      expect(a.bioEn.trim().length).toBeGreaterThan(0);
      expect(a.bioBn.trim().length).toBeGreaterThan(0);
      expect(a.agentKey).toMatch(/^A360-(0[89]|1[0-2])$/);
    }
  });

  it('isPillarId refuses anything outside the fixed six', () => {
    expect(isPillarId('care')).toBe(true);
    expect(isPillarId('budget')).toBe(false);
    expect(isPillarId(null)).toBe(false);
    expect(isPillarId(undefined)).toBe(false);
  });

  describe('authorForPillar', () => {
    const rows: AiAuthorRow[] = [
      { id: 'id-suta', agentKey: 'A360-08' },
      { id: 'id-jotno', agentKey: 'A360-09' },
      { id: 'id-rong', agentKey: 'A360-10' },
    ];
    it('matches the seed that covers the section, among the rows actually live', () => {
      expect(authorForPillar('fabric', rows)).toBe('id-suta'); // Suta covers fabric and fit
      expect(authorForPillar('fit', rows)).toBe('id-suta');
      expect(authorForPillar('care', rows)).toBe('id-jotno');
      expect(authorForPillar('style', rows)).toBe('id-rong');
    });
    it('answers null for an unknown pillar, or one whose seeded author is not live yet', () => {
      expect(authorForPillar(null, rows)).toBeNull();
      expect(authorForPillar('not-a-pillar', rows)).toBeNull();
      expect(authorForPillar('season', rows)).toBeNull(); // Ritu (A360-11) not among the rows passed
    });
  });

  describe('pickReviewer', () => {
    const rows: AiAuthorRow[] = [
      { id: 'a', agentKey: 'A360-08' },
      { id: 'b', agentKey: 'A360-09' },
      { id: 'c', agentKey: 'A360-10' },
    ];
    it('never the writer; the least-loaded of the rest goes next', () => {
      const load = new Map([
        ['a', 3],
        ['b', 0],
        ['c', 1],
      ]);
      expect(pickReviewer(rows, 'a', load)).toBe('b'); // a excluded as writer; b (0) beats c (1)
    });
    it('ties break by list order, so five authors share the queue evenly over repeated picks', () => {
      const load = new Map([
        ['a', 0],
        ['b', 0],
        ['c', 0],
      ]);
      expect(pickReviewer(rows, 'c', load)).toBe('a'); // a and b tie at 0; a is first in the list
    });
    it('answers null with no author, or only the writer, to choose from', () => {
      expect(pickReviewer([], 'a', new Map())).toBeNull();
      expect(pickReviewer([{ id: 'a', agentKey: 'A360-08' }], 'a', new Map())).toBeNull();
    });
  });
});
