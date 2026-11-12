// S24 · PR 465 — pure tests for the footwear / product-only studio engine's angle planner (no database).
// S24 · PR 466 pure tests (below PR 465's own): the "ask for the missing angle" message and request list.
import { describe, expect, it } from 'vitest';
import { FOOTWEAR_ANGLES, footwearAngleRole, footwearMissingAngleMessage, footwearMissingAngleRequests, missingFootwearAngles, planFootwearAngles } from './footwearStudio';

describe('FOOTWEAR_ANGLES', () => {
  it('is C7.12’s own six angles, in the blueprint’s own order, with no duplicates', () => {
    expect(FOOTWEAR_ANGLES).toEqual(['three_quarter', 'side', 'top', 'back', 'sole', 'detail']);
    expect(new Set(FOOTWEAR_ANGLES).size).toBe(FOOTWEAR_ANGLES.length);
  });
});

describe('footwearAngleRole', () => {
  it('maps each angle to its own reference role', () => {
    expect(footwearAngleRole('three_quarter')).toBe('three_quarter_reference');
    expect(footwearAngleRole('side')).toBe('side_reference');
    expect(footwearAngleRole('top')).toBe('top_reference');
    expect(footwearAngleRole('back')).toBe('back_reference');
    expect(footwearAngleRole('sole')).toBe('sole_reference');
    expect(footwearAngleRole('detail')).toBe('detail_reference');
  });
});

describe('planFootwearAngles', () => {
  it('an angle is ready from a real, non-archived reference of its own role', () => {
    const plan = planFootwearAngles([{ role: 'sole_reference', isOriginal: true, archivedAt: null }], ['sole']);
    expect(plan).toEqual([{ angle: 'sole', ready: true }]);
  });

  it('an angle is not ready with no real reference of its own role on file — C7.12’s "never invent" rule', () => {
    const plan = planFootwearAngles([], ['top']);
    expect(plan).toEqual([{ angle: 'top', ready: false, reason: 'NO_TOP_REFERENCE' }]);
  });

  it('never derives one angle from another — a side reference never makes "top" ready', () => {
    const plan = planFootwearAngles([{ role: 'side_reference', isOriginal: true, archivedAt: null }], ['top']);
    expect(plan[0]).toMatchObject({ ready: false, reason: 'NO_TOP_REFERENCE' });
  });

  it('a generated (not real) reference never counts for readiness', () => {
    const plan = planFootwearAngles([{ role: 'sole_reference', isOriginal: false, archivedAt: null }], ['sole']);
    expect(plan[0]).toMatchObject({ ready: false, reason: 'NO_SOLE_REFERENCE' });
  });

  it('an archived reference no longer counts', () => {
    const plan = planFootwearAngles([{ role: 'back_reference', isOriginal: true, archivedAt: new Date() }], ['back']);
    expect(plan[0]?.ready).toBe(false);
  });

  it('defaults to all six angles, each assessed independently, with its own reason', () => {
    const assets = [
      { role: 'three_quarter_reference', isOriginal: true, archivedAt: null },
      { role: 'side_reference', isOriginal: true, archivedAt: null },
      { role: 'back_reference', isOriginal: true, archivedAt: null },
    ];
    const plan = planFootwearAngles(assets);
    expect(plan.map((p) => p.angle)).toEqual([...FOOTWEAR_ANGLES]);
    expect(plan.find((p) => p.angle === 'three_quarter')?.ready).toBe(true);
    expect(plan.find((p) => p.angle === 'side')?.ready).toBe(true);
    expect(plan.find((p) => p.angle === 'back')?.ready).toBe(true);
    expect(plan.find((p) => p.angle === 'top')).toEqual({ angle: 'top', ready: false, reason: 'NO_TOP_REFERENCE' });
    expect(plan.find((p) => p.angle === 'sole')).toEqual({ angle: 'sole', ready: false, reason: 'NO_SOLE_REFERENCE' });
    expect(plan.find((p) => p.angle === 'detail')).toEqual({ angle: 'detail', ready: false, reason: 'NO_DETAIL_REFERENCE' });
  });
});

describe('missingFootwearAngles', () => {
  it('is empty once every wanted angle has a real reference on file', () => {
    const assets = FOOTWEAR_ANGLES.map((angle) => ({ role: footwearAngleRole(angle), isOriginal: true, archivedAt: null }));
    expect(missingFootwearAngles(assets)).toEqual([]);
  });

  it('names exactly the angles with nothing real on file, in the blueprint’s own order', () => {
    const assets = [
      { role: 'side_reference', isOriginal: true, archivedAt: null },
      { role: 'detail_reference', isOriginal: true, archivedAt: null },
    ];
    expect(missingFootwearAngles(assets)).toEqual(['three_quarter', 'top', 'back', 'sole']);
  });

  it('with no real references at all, every angle is missing', () => {
    expect(missingFootwearAngles([])).toEqual([...FOOTWEAR_ANGLES]);
  });
});

describe('PR 466 · footwearMissingAngleMessage', () => {
  it('turns an angle’s own name into C7.12’s own "ask for the missing angle" wording', () => {
    expect(footwearMissingAngleMessage('sole')).toBe('There is no real sole photo of this product yet — please add one sole photo before the product-only studio can produce that angle.');
    expect(footwearMissingAngleMessage('three_quarter')).toBe('There is no real three-quarter photo of this product yet — please add one three-quarter photo before the product-only studio can produce that angle.');
  });
});

describe('PR 466 · footwearMissingAngleRequests', () => {
  it('asks for every missing angle, and only those, in the blueprint’s own order', () => {
    const assets = [
      { role: 'side_reference', isOriginal: true, archivedAt: null },
      { role: 'detail_reference', isOriginal: true, archivedAt: null },
    ];
    const requests = footwearMissingAngleRequests(assets);
    expect(requests.map((r) => r.angle)).toEqual(['three_quarter', 'top', 'back', 'sole']);
    expect(requests[0]).toEqual({ angle: 'three_quarter', message: footwearMissingAngleMessage('three_quarter') });
  });

  it('is empty once every wanted angle has a real reference on file', () => {
    const assets = FOOTWEAR_ANGLES.map((angle) => ({ role: footwearAngleRole(angle), isOriginal: true, archivedAt: null }));
    expect(footwearMissingAngleRequests(assets)).toEqual([]);
  });

  it('asks again for an angle whose only reference is generated (not real) or archived', () => {
    const generated = [{ role: 'sole_reference', isOriginal: false, archivedAt: null }];
    expect(footwearMissingAngleRequests(generated, ['sole'])).toEqual([{ angle: 'sole', message: footwearMissingAngleMessage('sole') }]);
    const archived = [{ role: 'sole_reference', isOriginal: true, archivedAt: new Date() }];
    expect(footwearMissingAngleRequests(archived, ['sole'])).toEqual([{ angle: 'sole', message: footwearMissingAngleMessage('sole') }]);
  });
});
