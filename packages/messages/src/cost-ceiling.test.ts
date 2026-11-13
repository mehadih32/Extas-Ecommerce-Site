// S28 · PR 698 — the cost ceiling's sums: the state of a channel, the share spent, the store's month, and what the engine
// does when a channel is over (hold, or go by the step's fallback channel when that one is still under its ceiling).
import { describe, expect, it } from 'vitest';
import { ceilingPct, ceilingState, ceilingVerdict, monthStartIn } from './cost-ceiling';

const status = (over: Partial<Parameters<typeof ceilingVerdict>[0]> = {}) => ({
  enabled: true,
  fallbackToCheapest: false,
  channels: [
    { channel: 'SMS' as const, ceilingMinor: 1000, spentMinor: 1000, pct: 100, state: 'over' as const },
    { channel: 'WHATSAPP' as const, ceilingMinor: null, spentMinor: 0, pct: null, state: 'none' as const },
  ],
  ...over,
});

describe('cost ceilings (PR 698)', () => {
  it('has no state without a ceiling; warns at the share; is over at the ceiling', () => {
    expect(ceilingState(5000, null, 80)).toBe('none');
    expect(ceilingState(799, 1000, 80)).toBe('ok');
    expect(ceilingState(800, 1000, 80)).toBe('warn');
    expect(ceilingState(999, 1000, 80)).toBe('warn');
    expect(ceilingState(1000, 1000, 80)).toBe('over');
    expect(ceilingState(1300, 1000, 80)).toBe('over');
  });
  it('gives the share spent in whole percent, uncapped', () => {
    expect(ceilingPct(250, 1000)).toBe(25);
    expect(ceilingPct(1300, 1000)).toBe(130);
    expect(ceilingPct(10, null)).toBeNull();
    expect(ceilingPct(10, 0)).toBeNull();
  });
  it('starts the month at midnight of the store\'s own zone', () => {
    expect(monthStartIn(new Date('2026-11-13T06:00:00Z'), 'Asia/Dhaka').toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(monthStartIn(new Date('2026-11-30T20:00:00Z'), 'Asia/Dhaka').toISOString()).toBe('2026-11-30T18:00:00.000Z');
    expect(monthStartIn(new Date('2026-11-13T06:00:00Z'), 'UTC').toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
  it('holds a message on a channel over its ceiling, and only that channel', () => {
    expect(ceilingVerdict(status(), 'SMS', null)).toEqual({ hold: true, useFallback: false });
    expect(ceilingVerdict(status(), 'WHATSAPP', null)).toEqual({ hold: false });
    expect(ceilingVerdict(status({ enabled: false }), 'SMS', null)).toEqual({ hold: false });
  });
  it('goes by the fallback channel only with the switch on and that channel not over', () => {
    expect(ceilingVerdict(status({ fallbackToCheapest: true }), 'SMS', 'WHATSAPP')).toEqual({ hold: true, useFallback: true });
    expect(ceilingVerdict(status({ fallbackToCheapest: true }), 'SMS', 'EMAIL')).toEqual({ hold: true, useFallback: true });
    expect(ceilingVerdict(status({ fallbackToCheapest: true }), 'SMS', null)).toEqual({ hold: true, useFallback: false });
    expect(ceilingVerdict(status({ fallbackToCheapest: false }), 'SMS', 'WHATSAPP')).toEqual({ hold: true, useFallback: false });
    const both = status({
      fallbackToCheapest: true,
      channels: [
        { channel: 'SMS', ceilingMinor: 1000, spentMinor: 1000, pct: 100, state: 'over' },
        { channel: 'WHATSAPP', ceilingMinor: 500, spentMinor: 600, pct: 120, state: 'over' },
      ],
    });
    expect(ceilingVerdict(both, 'SMS', 'WHATSAPP')).toEqual({ hold: true, useFallback: false });
  });
});
