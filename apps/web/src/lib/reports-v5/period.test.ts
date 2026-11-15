import { describe, expect, it } from 'vitest';
import { protoKey, protoRange, withProtoPeriod } from './period';

describe('report period buttons', () => {
  const today = '2026-11-15';
  it('maps each button to its two days', () => {
    expect(protoRange('today', today)).toEqual({ from: today, to: today });
    expect(protoRange('d7', today)).toEqual({ from: '2026-11-09', to: today });
    expect(protoRange('d30', today)).toEqual({ from: '2026-10-17', to: today });
    expect(protoRange('month', today)).toEqual({ from: '2026-11-01', to: today });
    expect(protoRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('knows which button a range is, else custom', () => {
    expect(protoKey(undefined, '2026-11-09', today, today)).toBe('d7');
    expect(protoKey('month', '2026-11-01', today, today)).toBe('month');
    expect(protoKey(undefined, '2026-01-01', '2026-01-09', today)).toBe('custom');
  });
  it('starts at 30 days when nothing is asked for', () => {
    expect(withProtoPeriod({}, today)).toMatchObject({ from: '2026-10-17', to: today, p: 'd30' });
    expect(withProtoPeriod({ p: 'today' }, today)).toMatchObject({ from: today, to: today });
    expect(withProtoPeriod({ from: '2026-10-01', to: '2026-10-05' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-05' });
  });
});
