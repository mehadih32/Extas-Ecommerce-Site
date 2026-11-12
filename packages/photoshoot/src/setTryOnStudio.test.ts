// S24 · PR 477 — pure tests for the set try-on engine's component/angle vocabulary, the "Set product type"
// mapping onto a TOP_BOTTOM combo's own two items, and the "never invent" angle planner (no database).
import { describe, expect, it } from 'vitest';
import {
  isSetTryOnAngle,
  isSetTryOnCombo,
  isSetTryOnComponent,
  missingSetTryOnAngles,
  planSetTryOnAngles,
  SET_TRY_ON_ANGLES,
  SET_TRY_ON_COMPONENTS,
  setTryOnComponentProductIds,
  type SetTryOnComponents,
} from './setTryOnStudio';

describe('SET_TRY_ON_COMPONENTS', () => {
  it('is C7.13’s own two components, with no duplicates', () => {
    expect(SET_TRY_ON_COMPONENTS).toEqual(['top', 'bottom']);
    expect(new Set(SET_TRY_ON_COMPONENTS).size).toBe(SET_TRY_ON_COMPONENTS.length);
  });
});

describe('isSetTryOnComponent', () => {
  it('accepts top and bottom and refuses anything else', () => {
    expect(isSetTryOnComponent('top')).toBe(true);
    expect(isSetTryOnComponent('bottom')).toBe(true);
    expect(isSetTryOnComponent('left')).toBe(false);
    expect(isSetTryOnComponent(3)).toBe(false);
  });
});

describe('SET_TRY_ON_ANGLES', () => {
  it('is C7.13’s own angle list, verbatim and in order, with no duplicates', () => {
    expect(SET_TRY_ON_ANGLES).toEqual(['front', 'three_quarter', 'back', 'motion_walking']);
    expect(new Set(SET_TRY_ON_ANGLES).size).toBe(SET_TRY_ON_ANGLES.length);
  });
});

describe('isSetTryOnAngle', () => {
  it('accepts every listed angle and refuses anything else', () => {
    for (const a of SET_TRY_ON_ANGLES) expect(isSetTryOnAngle(a)).toBe(true);
    expect(isSetTryOnAngle('side')).toBe(false);
    expect(isSetTryOnAngle('')).toBe(false);
  });
});

describe('isSetTryOnCombo / setTryOnComponentProductIds — "Set product type" onto an existing TOP_BOTTOM combo', () => {
  const topId = '11111111-1111-1111-1111-111111111111';
  const bottomId = '22222222-2222-2222-2222-222222222222';

  it('a real TOP_BOTTOM combo with two real products is recognised as a set', () => {
    expect(isSetTryOnCombo({ comboType: 'TOP_BOTTOM', itemProductIds: [topId, bottomId] })).toBe(true);
    expect(setTryOnComponentProductIds({ comboType: 'TOP_BOTTOM', itemProductIds: [topId, bottomId] })).toEqual({ topProductId: topId, bottomProductId: bottomId });
  });

  it('never invents a set from a combo of the wrong type', () => {
    expect(isSetTryOnCombo({ comboType: 'FIXED_SET', itemProductIds: [topId, bottomId] })).toBe(false);
    expect(isSetTryOnCombo({ comboType: 'COLOUR_PAIR', itemProductIds: [topId, bottomId] })).toBe(false);
    expect(setTryOnComponentProductIds({ comboType: 'FIXED_SET', itemProductIds: [topId, bottomId] })).toBeNull();
  });

  it('never invents a set from the wrong item count', () => {
    expect(isSetTryOnCombo({ comboType: 'TOP_BOTTOM', itemProductIds: [topId] })).toBe(false);
    expect(isSetTryOnCombo({ comboType: 'TOP_BOTTOM', itemProductIds: [topId, bottomId, bottomId] })).toBe(false);
  });

  it('never invents a set when an item slot has no real product yet (category- or variant-only)', () => {
    expect(isSetTryOnCombo({ comboType: 'TOP_BOTTOM', itemProductIds: [topId, null] })).toBe(false);
    expect(setTryOnComponentProductIds({ comboType: 'TOP_BOTTOM', itemProductIds: [null, bottomId] })).toBeNull();
  });
});

describe('planSetTryOnAngles', () => {
  const frontOnly: SetTryOnComponents = {
    top: [{ role: 'front_reference', isOriginal: true, archivedAt: null }],
    bottom: [{ role: 'primary_garment', isOriginal: true, archivedAt: null }],
  };
  const frontAndBack: SetTryOnComponents = {
    top: [
      { role: 'front_reference', isOriginal: true, archivedAt: null },
      { role: 'back_reference', isOriginal: true, archivedAt: null },
    ],
    bottom: [
      { role: 'front_reference', isOriginal: true, archivedAt: null },
      { role: 'back_reference', isOriginal: true, archivedAt: null },
    ],
  };
  const empty: SetTryOnComponents = { top: [], bottom: [] };

  it('a front-like angle is ready once BOTH components have a real front-like reference', () => {
    expect(planSetTryOnAngles(frontOnly, ['front'])).toEqual([{ angle: 'front', ready: true, reasons: [] }]);
    expect(planSetTryOnAngles(frontOnly, ['three_quarter'])).toEqual([{ angle: 'three_quarter', ready: true, reasons: [] }]);
    expect(planSetTryOnAngles(frontOnly, ['motion_walking'])).toEqual([{ angle: 'motion_walking', ready: true, reasons: [] }]);
  });

  it('names each missing component separately, never only the first — C7.13’s "the complete set" rule', () => {
    const topOnly: SetTryOnComponents = { top: [{ role: 'front_reference', isOriginal: true, archivedAt: null }], bottom: [] };
    expect(planSetTryOnAngles(topOnly, ['front'])).toEqual([{ angle: 'front', ready: false, reasons: ['NO_BOTTOM_REFERENCE'] }]);

    const neither: SetTryOnComponents = { top: [], bottom: [] };
    const plan = planSetTryOnAngles(neither, ['front'])[0]!;
    expect(plan.ready).toBe(false);
    expect(plan.reasons).toEqual(['NO_TOP_REFERENCE', 'NO_BOTTOM_REFERENCE']);
  });

  it('the back angle is never invented from a front-only reference on either component — C7.6’s hard rule, both halves', () => {
    expect(planSetTryOnAngles(frontOnly, ['back'])).toEqual([{ angle: 'back', ready: false, reasons: ['NO_TOP_BACK_REFERENCE', 'NO_BOTTOM_BACK_REFERENCE'] }]);
    expect(planSetTryOnAngles(frontAndBack, ['back'])).toEqual([{ angle: 'back', ready: true, reasons: [] }]);
  });

  it('a back reference on only one component still refuses the back angle, naming the one still missing', () => {
    const topBackOnly: SetTryOnComponents = {
      top: [
        { role: 'front_reference', isOriginal: true, archivedAt: null },
        { role: 'back_reference', isOriginal: true, archivedAt: null },
      ],
      bottom: [{ role: 'front_reference', isOriginal: true, archivedAt: null }],
    };
    expect(planSetTryOnAngles(topBackOnly, ['back'])).toEqual([{ angle: 'back', ready: false, reasons: ['NO_BOTTOM_BACK_REFERENCE'] }]);
  });

  it('a front reference never makes the back angle ready, and a back reference alone never makes a front-like angle ready', () => {
    const backOnly: SetTryOnComponents = {
      top: [{ role: 'back_reference', isOriginal: true, archivedAt: null }],
      bottom: [{ role: 'back_reference', isOriginal: true, archivedAt: null }],
    };
    expect(planSetTryOnAngles(backOnly, ['front'])[0]).toMatchObject({ ready: false, reasons: ['NO_TOP_REFERENCE', 'NO_BOTTOM_REFERENCE'] });
  });

  it('a generated (not real) or archived reference never counts for readiness, on either component', () => {
    const generated: SetTryOnComponents = {
      top: [{ role: 'front_reference', isOriginal: false, archivedAt: null }],
      bottom: [{ role: 'front_reference', isOriginal: true, archivedAt: '2026-01-01' }],
    };
    expect(planSetTryOnAngles(generated, ['front'])[0]).toMatchObject({ ready: false, reasons: ['NO_TOP_REFERENCE', 'NO_BOTTOM_REFERENCE'] });
  });

  it('defaults to every angle when none is named', () => {
    expect(planSetTryOnAngles(empty).map((p) => p.angle)).toEqual(SET_TRY_ON_ANGLES);
  });
});

describe('missingSetTryOnAngles', () => {
  it('lists only the angles still missing at least one component’s own reference', () => {
    const frontOnly: SetTryOnComponents = {
      top: [{ role: 'front_reference', isOriginal: true, archivedAt: null }],
      bottom: [{ role: 'front_reference', isOriginal: true, archivedAt: null }],
    };
    expect(missingSetTryOnAngles(frontOnly)).toEqual(['back']);
  });

  it('lists nothing once both components have every reference the set needs', () => {
    const complete: SetTryOnComponents = {
      top: [
        { role: 'front_reference', isOriginal: true, archivedAt: null },
        { role: 'back_reference', isOriginal: true, archivedAt: null },
      ],
      bottom: [
        { role: 'front_reference', isOriginal: true, archivedAt: null },
        { role: 'back_reference', isOriginal: true, archivedAt: null },
      ],
    };
    expect(missingSetTryOnAngles(complete)).toEqual([]);
  });

  it('lists every angle when neither component has anything on file', () => {
    expect(missingSetTryOnAngles({ top: [], bottom: [] })).toEqual([...SET_TRY_ON_ANGLES]);
  });
});
