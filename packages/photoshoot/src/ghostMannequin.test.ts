// S24 · PR 446 — pure tests for the ghost-mannequin engine's view planner (no database).
import { describe, expect, it } from 'vitest';
import { GHOST_MANNEQUIN_VIEWS, ghostMannequinRole, planGhostMannequinViews } from './ghostMannequin';

describe('ghostMannequinRole', () => {
  it('maps each view to the matching C7.6 reference role', () => {
    expect(ghostMannequinRole('front')).toBe('front_reference');
    expect(ghostMannequinRole('back')).toBe('back_reference');
  });
});

describe('planGhostMannequinViews', () => {
  it('front is ready from a real primary_garment flat-lay', () => {
    const plan = planGhostMannequinViews([{ role: 'primary_garment', isOriginal: true, archivedAt: null }], ['front']);
    expect(plan).toEqual([{ view: 'front', ready: true }]);
  });

  it('front is ready from a real front_reference too', () => {
    const plan = planGhostMannequinViews([{ role: 'front_reference', isOriginal: true, archivedAt: null }], ['front']);
    expect(plan[0]?.ready).toBe(true);
  });

  it('front is not ready with no real flat-lay on file', () => {
    const plan = planGhostMannequinViews([], ['front']);
    expect(plan).toEqual([{ view: 'front', ready: false, reason: 'NO_FRONT_REFERENCE' }]);
  });

  it('a generated (not real) front_reference never counts for readiness', () => {
    const plan = planGhostMannequinViews([{ role: 'front_reference', isOriginal: false, archivedAt: null }], ['front']);
    expect(plan[0]).toMatchObject({ ready: false, reason: 'NO_FRONT_REFERENCE' });
  });

  it('back is not ready with no real back_reference on file — C7.6 hard rule', () => {
    const plan = planGhostMannequinViews([{ role: 'front_reference', isOriginal: true, archivedAt: null }], ['back']);
    expect(plan).toEqual([{ view: 'back', ready: false, reason: 'NO_BACK_REFERENCE' }]);
  });

  it('back is ready only with a real, non-archived back_reference', () => {
    const plan = planGhostMannequinViews([{ role: 'back_reference', isOriginal: true, archivedAt: null }], ['back']);
    expect(plan).toEqual([{ view: 'back', ready: true }]);
  });

  it('an archived back_reference no longer makes the back view ready', () => {
    const plan = planGhostMannequinViews([{ role: 'back_reference', isOriginal: true, archivedAt: new Date() }], ['back']);
    expect(plan[0]?.ready).toBe(false);
  });

  it('defaults to both views, independently assessed', () => {
    const plan = planGhostMannequinViews([{ role: 'primary_garment', isOriginal: true, archivedAt: null }]);
    expect(plan.map((p) => p.view)).toEqual([...GHOST_MANNEQUIN_VIEWS]);
    expect(plan.find((p) => p.view === 'front')?.ready).toBe(true);
    expect(plan.find((p) => p.view === 'back')?.ready).toBe(false);
  });
});
