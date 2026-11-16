// S29 · PR 758–761 — the lenses' reading of the Geography map setting: off (or missing, or not in the expected shape) is
// off, never a guess; each lens and the advisor are their own switches.
import { describe, expect, it } from 'vitest';
import { LENS_KEYS, lensSettingOf, readLensSetting } from './setting';

const ON = { on: true, minOrders: 10, warnReturnPct: 25, topProducts: 5, lenses: { courier: false, risk: true, money: false, demand: true }, ai: false };

describe('lensSettingOf', () => {
  it('reads the numbers and which lens is on', () => {
    expect(lensSettingOf(ON)).toEqual({ minOrders: 10, warnReturnPct: 25, topProducts: 5, lenses: { courier: false, risk: true, money: false, demand: true }, ai: false });
  });
  it('the page switch off means off, whatever the lenses say', () => {
    expect(lensSettingOf({ ...ON, on: false })).toBeNull();
  });
  it('anything missing or in the wrong shape is off', () => {
    expect(lensSettingOf(undefined)).toBeNull();
    expect(lensSettingOf('on')).toBeNull();
    expect(lensSettingOf({ ...ON, minOrders: '10' })).toBeNull();
    expect(lensSettingOf({ ...ON, warnReturnPct: Number.NaN })).toBeNull();
  });
  it('a lens or the advisor that is not exactly true is off', () => {
    const s = lensSettingOf({ ...ON, lenses: { risk: 1, money: 'yes' }, ai: 'true' })!;
    expect(LENS_KEYS.map((k) => s.lenses[k])).toEqual([false, false, false, false]);
    expect(s.ai).toBe(false);
  });
});

describe('readLensSetting', () => {
  it('reads the stored value for the store', async () => {
    const seen: unknown[] = [];
    const resolver = { value: async (key: string, at: unknown) => (seen.push([key, at]), ON) };
    expect((await readLensSetting(resolver as never, 7))?.lenses.risk).toBe(true);
    expect(seen).toEqual([['reports.geoMap', { storeId: 7 }]]);
  });
  it('a setting that is not registered yet, or a failing read, is off', async () => {
    expect(await readLensSetting({ value: async () => { throw new Error('unknown setting'); } } as never, 1)).toBeNull();
  });
});
