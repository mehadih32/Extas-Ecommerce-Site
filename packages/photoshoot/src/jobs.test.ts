// S24 · PR 451 — pure tests: the idempotency fingerprint and the C7.6 job state machine, no database involved.
import { describe, expect, it } from 'vitest';
import { computeIdempotencyKey, isTerminalJobStatus, isValidJobTransition, JOB_STATUSES, JOB_TERMINAL_STATUSES, JOB_TRANSITIONS, nextDifferentSeed } from './jobs';

describe('computeIdempotencyKey', () => {
  const base = { productId: 'p1', angle: 'front', tier: 'baseline', inputAssetIds: ['a1', 'a2'] };

  it('is deterministic for the exact same request', () => {
    expect(computeIdempotencyKey(base)).toBe(computeIdempotencyKey({ ...base }));
  });

  it('does not care about the order the input assets were listed in', () => {
    expect(computeIdempotencyKey({ ...base, inputAssetIds: ['a2', 'a1'] })).toBe(computeIdempotencyKey(base));
  });

  it('treats an omitted optional field the same as an explicit null', () => {
    expect(computeIdempotencyKey(base)).toBe(computeIdempotencyKey({ ...base, colourId: null, recipeId: null, modelId: null, sceneId: null, seed: null, provider: null }));
  });

  it('a different provider is a different key — PR 459: two requests that differ only by provider must not collide', () => {
    expect(computeIdempotencyKey({ ...base, provider: 'fashn' })).not.toBe(computeIdempotencyKey(base));
    expect(computeIdempotencyKey({ ...base, provider: 'fashn' })).not.toBe(computeIdempotencyKey({ ...base, provider: 'fitroom' }));
  });

  it('a different product is a different key', () => {
    expect(computeIdempotencyKey({ ...base, productId: 'p2' })).not.toBe(computeIdempotencyKey(base));
  });

  it('a different angle is a different key', () => {
    expect(computeIdempotencyKey({ ...base, angle: 'back' })).not.toBe(computeIdempotencyKey(base));
  });

  it('a different tier is a different key', () => {
    expect(computeIdempotencyKey({ ...base, tier: 'premium' })).not.toBe(computeIdempotencyKey(base));
  });

  it('a different set of input assets is a different key', () => {
    expect(computeIdempotencyKey({ ...base, inputAssetIds: ['a1', 'a3'] })).not.toBe(computeIdempotencyKey(base));
  });

  it('a pinned seed changes the key; a numeric and the same string seed match', () => {
    const withSeed = computeIdempotencyKey({ ...base, seed: 42 });
    expect(withSeed).not.toBe(computeIdempotencyKey(base));
    expect(withSeed).toBe(computeIdempotencyKey({ ...base, seed: '42' }));
  });

  it('a different colour/recipe/model/scene each change the key', () => {
    const variants = [{ colourId: 'c1' }, { recipeId: 'r1' }, { modelId: 'm1' }, { sceneId: 's1' }] as const;
    const keys = new Set(variants.map((v) => computeIdempotencyKey({ ...base, ...v })));
    keys.add(computeIdempotencyKey(base));
    expect(keys.size).toBe(variants.length + 1);
  });
});

describe('JOB_TRANSITIONS / isValidJobTransition', () => {
  it('lists every known job status, even one with nowhere left to go', () => {
    expect(Object.keys(JOB_TRANSITIONS).sort()).toEqual([...JOB_STATUSES].sort());
  });

  it('follows C7.6\'s own flow: draft -> queued -> processing -> review_required -> approved -> published', () => {
    expect(isValidJobTransition('DRAFT', 'QUEUED')).toBe(true);
    expect(isValidJobTransition('QUEUED', 'PROCESSING')).toBe(true);
    expect(isValidJobTransition('PROCESSING', 'REVIEW_REQUIRED')).toBe(true);
    expect(isValidJobTransition('REVIEW_REQUIRED', 'APPROVED')).toBe(true);
    expect(isValidJobTransition('APPROVED', 'PUBLISHED')).toBe(true);
  });

  it('never skips a step', () => {
    expect(isValidJobTransition('DRAFT', 'PROCESSING')).toBe(false);
    expect(isValidJobTransition('DRAFT', 'PUBLISHED')).toBe(false);
    expect(isValidJobTransition('QUEUED', 'REVIEW_REQUIRED')).toBe(false);
    expect(isValidJobTransition('REVIEW_REQUIRED', 'PUBLISHED')).toBe(false);
  });

  it('never moves out of a terminal status', () => {
    for (const terminal of JOB_TERMINAL_STATUSES) {
      for (const to of JOB_STATUSES) {
        expect(isValidJobTransition(terminal, to)).toBe(false);
      }
    }
  });

  it('allows the one retry edge, failed back to queued, and nowhere else from failed', () => {
    expect(isValidJobTransition('FAILED', 'QUEUED')).toBe(true);
    expect(isValidJobTransition('FAILED', 'PROCESSING')).toBe(false);
    expect(isValidJobTransition('FAILED', 'PUBLISHED')).toBe(false);
  });

  it('cancelled is reachable from every still-open status, never from a status already settled', () => {
    expect(isValidJobTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(isValidJobTransition('QUEUED', 'CANCELLED')).toBe(true);
    expect(isValidJobTransition('PROCESSING', 'CANCELLED')).toBe(true);
    expect(isValidJobTransition('REVIEW_REQUIRED', 'CANCELLED')).toBe(false);
    expect(isValidJobTransition('APPROVED', 'CANCELLED')).toBe(false);
  });
});

describe('nextDifferentSeed (PR 452, C7.5 step 7 — "retried with a different seed on failure")', () => {
  it('draws from the injected RNG', () => {
    expect(nextDifferentSeed({ randomSeed: () => 'abc' }, null)).toBe('abc');
  });

  it('is never the same as the previous seed, even when the RNG first repeats it', () => {
    const draws = ['same', 'same', 'different'];
    let i = 0;
    const seed = nextDifferentSeed({ randomSeed: () => draws[i++]! }, 'same');
    expect(seed).toBe('different');
    expect(i).toBe(3);
  });

  it('a previous seed of null is also "different" from anything drawn', () => {
    expect(nextDifferentSeed({ randomSeed: () => 'x' }, null)).toBe('x');
  });

  it('gives up rather than looping forever against a stuck RNG', () => {
    expect(() => nextDifferentSeed({ randomSeed: () => 'stuck' }, 'stuck')).toThrow();
  });

  it('with no injected RNG, draws real crypto randomness, different every time', () => {
    const a = nextDifferentSeed({}, null);
    const b = nextDifferentSeed({}, a);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('isTerminalJobStatus', () => {
  it('is true for published, rejected and cancelled; false for everything still moving', () => {
    expect(isTerminalJobStatus('PUBLISHED')).toBe(true);
    expect(isTerminalJobStatus('REJECTED')).toBe(true);
    expect(isTerminalJobStatus('CANCELLED')).toBe(true);
    expect(isTerminalJobStatus('DRAFT')).toBe(false);
    expect(isTerminalJobStatus('QUEUED')).toBe(false);
    expect(isTerminalJobStatus('PROCESSING')).toBe(false);
    expect(isTerminalJobStatus('REVIEW_REQUIRED')).toBe(false);
    expect(isTerminalJobStatus('APPROVED')).toBe(false);
    expect(isTerminalJobStatus('FAILED')).toBe(false);
  });
});
