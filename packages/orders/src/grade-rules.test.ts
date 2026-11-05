// PR 534 — customer grading, the pure rules: the highest of the owner's grades whose rule the counts meet, his order and
// not the list's, a rule that no longer reads gives nothing, "good customer from" a grade or above, the verified mark
// (0 = none) and the key made from a name. Made-up grades: none ships.
import { describe, expect, it } from 'vitest';
import { atOrAbove, gradeCriteriaSchema, gradeKeyOf, isVerified, pickGrade, readCriteria, type GradeLevel } from './grade-rules';

const lvl = (key: string, sortOrder: number, minDelivered: number, maxRefused: number | null, minRefused = 0): GradeLevel => ({ id: key, key, nameEn: key, nameBn: null, sortOrder, criteria: { minDelivered, maxRefused, minRefused } });
// the demo's four, in a shuffled list: watch (2+ refusals), new (≤1 refusal), verified (1+ delivered, ≤1 refusal), gold (3+, none)
const LEVELS = [lvl('gold', 30, 3, 0), lvl('watch', 0, 0, null, 2), lvl('verified', 20, 1, 1), lvl('new', 10, 0, 1)];

describe('PR 534 · customer grades', () => {
  it('gives the highest grade in the owner\'s order whose rule the counts meet', () => {
    expect(pickGrade({ delivered: 0, refused: 0 }, LEVELS)?.key).toBe('new');
    expect(pickGrade({ delivered: 2, refused: 1 }, LEVELS)?.key).toBe('verified');
    expect(pickGrade({ delivered: 5, refused: 0 }, LEVELS)?.key).toBe('gold');
    expect(pickGrade({ delivered: 5, refused: 1 }, LEVELS)?.key).toBe('verified');
    expect(pickGrade({ delivered: 9, refused: 2 }, LEVELS)?.key).toBe('watch');
    expect(pickGrade({ delivered: 1, refused: 0 }, [])).toBeNull();
    expect(pickGrade({ delivered: 0, refused: 3 }, [lvl('gold', 1, 3, 0)])).toBeNull();
  });

  it('a rule must read: whole numbers, at most not below at least, nothing else in it', () => {
    expect(readCriteria({ minDelivered: 3, maxRefused: null, minRefused: 0 })).toEqual({ minDelivered: 3, maxRefused: null, minRefused: 0 });
    expect(readCriteria({ minDelivered: 3, maxRefused: 1, minRefused: 2 })).toBeNull();
    expect(readCriteria({ minDelivered: -1, maxRefused: null, minRefused: 0 })).toBeNull();
    expect(readCriteria({ minDelivered: 1.5, maxRefused: null, minRefused: 0 })).toBeNull();
    expect(gradeCriteriaSchema.safeParse({ minDelivered: 1, maxRefused: null, minRefused: 0, blockCod: true }).success).toBe(false);
    expect(readCriteria(null)).toBeNull();
  });

  it('"good customer from" counts that grade and the ones above it, never one below, an unknown key or none', () => {
    expect(atOrAbove(LEVELS[0]!, 'verified', LEVELS)).toBe(true);
    expect(atOrAbove(LEVELS[2]!, 'verified', LEVELS)).toBe(true);
    expect(atOrAbove(LEVELS[3]!, 'verified', LEVELS)).toBe(false);
    expect(atOrAbove(LEVELS[1]!, 'verified', LEVELS)).toBe(false);
    expect(atOrAbove(LEVELS[0]!, '', LEVELS)).toBe(false);
    expect(atOrAbove(LEVELS[0]!, 'platinum', LEVELS)).toBe(false);
    expect(atOrAbove(null, 'new', LEVELS)).toBe(false);
  });

  it('the verified mark needs the owner\'s number of true deliveries; 0 means no mark', () => {
    expect(isVerified(5, 0)).toBe(false);
    expect(isVerified(1, 2)).toBe(false);
    expect(isVerified(2, 2)).toBe(true);
  });

  it('a grade\'s key comes from its English name', () => {
    expect(gradeKeyOf('Gold')).toBe('gold');
    expect(gradeKeyOf('  Very Good — Buyer! ')).toBe('very-good-buyer');
    expect(gradeKeyOf('সোনা')).toBe('grade');
    expect(gradeKeyOf('x'.repeat(39) + ' y')).toBe('x'.repeat(39));
  });
});
