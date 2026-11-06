// PR 629 (CN-036) — the readiness checklist: Publish only when every check passes.
import { describe, expect, it } from 'vitest';
import { checkPasses, readiness, type FormCheck } from './form';

const checks: FormCheck[] = [
  { id: 'name', label: 'Name', field: 'name', rule: 'minLength', arg: 3 },
  { id: 'price', label: 'Price', field: 'price', rule: 'min', arg: 1 },
  { id: 'size', label: 'Sizes', field: 'sizes', rule: 'filled' },
];

describe('readiness', () => {
  it('passes each rule only when it is met', () => {
    expect(checkPasses({ id: 'a', label: '', field: 'x', rule: 'filled' }, { x: '  ' })).toBe(false);
    expect(checkPasses({ id: 'a', label: '', field: 'x', rule: 'filled' }, { x: ['M'] })).toBe(true);
    expect(checkPasses({ id: 'a', label: '', field: 'x', rule: 'number' }, { x: '12.5' })).toBe(true);
    expect(checkPasses({ id: 'a', label: '', field: 'x', rule: 'number' }, { x: '' })).toBe(false);
    expect(checkPasses({ id: 'a', label: '', field: 'x', rule: 'max', arg: 10 }, { x: '11' })).toBe(false);
    expect(checkPasses({ id: 'a', label: '', field: 'x', rule: 'maxLength', arg: 5 }, { x: 'পোলো' })).toBe(true);
    expect(checkPasses({ id: 'a', label: '', field: 'x', rule: 'minLength', arg: 3 }, { x: 'ab' })).toBe(false);
  });

  it('keeps Publish off until every check passes (and with no checks at all)', () => {
    expect(readiness(checks, {}).ready).toBe(false);
    const half = readiness(checks, { name: 'Polo', price: '0' });
    expect(half.done).toBe(1);
    expect(half.ready).toBe(false);
    expect(readiness(checks, { name: 'Polo', price: '1450', sizes: 'M,L' })).toMatchObject({ ready: true, done: 3 });
    expect(readiness([], {}).ready).toBe(false);
  });
});
