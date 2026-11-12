// S24 · PR 448 — pure tests for reference analysis and recommendation (no database).
import { describe, expect, it } from 'vitest';
import { analyzeReferenceCoverage, REQUIRED_REFERENCE_ROLES } from './referenceAnalysis';

describe('analyzeReferenceCoverage', () => {
  it('is not ready with nothing on file, and asks for all three required photos', () => {
    const r = analyzeReferenceCoverage([]);
    expect(r.ready).toBe(false);
    expect(r.missing.sort()).toEqual([...REQUIRED_REFERENCE_ROLES].sort());
    expect(r.asks).toHaveLength(3);
    expect(r.asks.some((a) => /back/i.test(a))).toBe(true);
  });

  it('counts a tagged primary_garment as covering the front requirement', () => {
    const r = analyzeReferenceCoverage([{ role: 'primary_garment', isOriginal: true }]);
    expect(r.roles.find((s) => s.role === 'front_reference')?.present).toBe(true);
    expect(r.missing).not.toContain('front_reference');
  });

  it('is ready once front, back and detail are all on file', () => {
    const r = analyzeReferenceCoverage([
      { role: 'front_reference', isOriginal: true },
      { role: 'back_reference', isOriginal: true },
      { role: 'detail_reference', isOriginal: true },
    ]);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.asks).toEqual([]);
  });

  it('ignores an archived or a generated row — only a live original counts', () => {
    const r = analyzeReferenceCoverage([
      { role: 'back_reference', isOriginal: true, archivedAt: new Date() },
      { role: 'detail_reference', isOriginal: false },
    ]);
    expect(r.missing).toContain('back_reference');
    expect(r.missing).toContain('detail_reference');
  });

  it('carries the C7.6 ghost-mannequin plan alongside the reference coverage', () => {
    const r = analyzeReferenceCoverage([
      { role: 'front_reference', isOriginal: true },
      { role: 'detail_reference', isOriginal: true },
    ]);
    const back = r.ghostMannequin.find((p) => p.view === 'back');
    expect(back?.ready).toBe(false);
    expect(back?.reason).toBe('NO_BACK_REFERENCE');
    const front = r.ghostMannequin.find((p) => p.view === 'front');
    expect(front?.ready).toBe(true);
  });

  it('a narrower `wanted` list changes what counts as missing', () => {
    const r = analyzeReferenceCoverage([{ role: 'front_reference', isOriginal: true }], ['front_reference']);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });
});
