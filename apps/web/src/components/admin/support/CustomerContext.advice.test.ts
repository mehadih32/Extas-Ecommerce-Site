// parity F4 · PR 850 — the advice line under the customer panel: green confirms by itself, yellow wants a call, red asks the delivery charge first.
import { describe, expect, it } from 'vitest';
import { adviceKey } from './CustomerContext';

describe('adviceKey', () => {
  it('maps the risk band tone to the prototype advice', () => {
    expect(adviceKey('ok')).toBe('auto');
    expect(adviceKey('warn')).toBe('call');
    expect(adviceKey('bad')).toBe('charge');
  });
  it('says nothing when there is no band', () => {
    expect(adviceKey(undefined)).toBeNull();
  });
});
