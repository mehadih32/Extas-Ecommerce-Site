import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin-lane-f.bn.json';
import en from '../../../messages/admin-lane-f.en.json';
import { deltaPct } from '../../components/admin/lane-f/Parts';
import { moneyOf, perOf, symbolOf } from './format';

type Tree = { [k: string]: string | Tree };
const flat = (t: Tree, p = ''): Record<string, string> => Object.entries(t).reduce<Record<string, string>>((a, [k, v]) => (typeof v === 'string' ? { ...a, [p + k]: v } : { ...a, ...flat(v, `${p}${k}.`) }), {});
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('lane F words (messages/admin-lane-f.*.json)', () => {
  const E = flat(en.lf as Tree);
  const B = flat(bn.lf as Tree);
  it('English and Bengali have the same keys', () => {
    expect(Object.keys(B).sort()).toEqual(Object.keys(E).sort());
  });
  it('every line fills the same {slots} in both languages and is never empty', () => {
    for (const k of Object.keys(E)) {
      expect(E[k]!.trim(), k).not.toBe('');
      expect(B[k]!.trim(), k).not.toBe('');
      expect(slots(B[k]!), k).toEqual(slots(E[k]!));
    }
  });
  it('Bengali lines use Western digits', () => {
    for (const [k, v] of Object.entries(B)) expect(/[০-৯]/.test(v), k).toBe(false);
  });
});

describe('lane F figures', () => {
  it('works out the change against the period before', () => {
    expect(deltaPct(110, 100)).toBeCloseTo(10);
    expect(deltaPct(50, 100)).toBeCloseTo(-50);
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(null, 5)).toBeNull();
  });
  it('writes money the way the prototype does', () => {
    expect(moneyOf(12345000, 'BDT')).toBe('৳1,23,450');
    expect(moneyOf(null, 'BDT', 'n/a')).toBe('n/a');
    expect(symbolOf('BDT')).toBe('৳');
    expect(perOf(4.2, 'BDT')).toBe('৳4.2');
    expect(perOf(null, 'BDT')).toBe('–');
  });
});
