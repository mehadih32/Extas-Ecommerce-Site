// PR 818 — the AI limits: what a request may carry, the 80% line and the month-end pace (pure; the settings write is the resolver's).
import { describe, expect, it, vi } from 'vitest';
import { atSaverLine, monthEndAtThisPace, parseLimits, setAiLimits } from './limits';

describe('PR 818 · AI limits', () => {
  it('takes one change at a time and refuses anything else', () => {
    expect(parseLimits({ aiCapMinor: 500000 })).toEqual({ aiCapMinor: 500000 });
    expect(parseLimits({ aiCapMinor: null })).toEqual({ aiCapMinor: null });
    expect(parseLimits({ costSaver: true })).toEqual({ costSaver: true });
    expect(parseLimits({ costSaverAuto: false })).toEqual({ costSaverAuto: false });
    expect(() => parseLimits({})).toThrow();
    expect(() => parseLimits(null)).toThrow();
    expect(() => parseLimits({ aiCapMinor: 0 })).toThrow();
    expect(() => parseLimits({ aiCapMinor: 1.5 })).toThrow();
    expect(() => parseLimits({ aiCapMinor: '5' })).toThrow();
  });
  it('the saver line is 80% in whole numbers and a missing ceiling never reaches it', () => {
    expect(atSaverLine(79, 100)).toBe(false);
    expect(atSaverLine(80, 100)).toBe(true);
    expect(atSaverLine(1_000_000, null)).toBe(false);
    expect(atSaverLine(1_000_000, 0)).toBe(false);
  });
  it('the month-end pace spreads what was spent over the days gone', () => {
    expect(monthEndAtThisPace(1000, 10, 30)).toBe(3000);
    expect(monthEndAtThisPace(1000, 0, 30)).toBe(30000);
  });
  it('writes through the settings resolver with who and why, and writes nothing when nothing changed', async () => {
    const set = vi.fn(async () => undefined);
    const value = vi.fn(async (k: string) => (k === 'ai.monthlyCapMinor' ? 1000 : true));
    const deps = { resolver: { value, set } } as never;
    const who = { actor: { staffUserId: 'u1' } } as never;
    await setAiLimits(deps, who, { aiCapMinor: 1000 }, 1);
    expect(set).not.toHaveBeenCalled();
    await setAiLimits(deps, who, { aiCapMinor: 2000 }, 1);
    expect(set).toHaveBeenCalledWith('ai.monthlyCapMinor', 2000, expect.anything(), expect.objectContaining({ actorId: 'u1' }));
    await setAiLimits(deps, who, { costSaver: false }, 1);
    expect(set).toHaveBeenLastCalledWith('ai.costSaver', false, expect.anything(), expect.anything());
  });
});
