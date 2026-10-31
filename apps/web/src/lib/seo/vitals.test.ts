// S11 · PR 234 — readings counted in buckets, the 75th percentile read back, the kind of page, and the targets.
import { describe, expect, it } from 'vitest';
import { SEO_VITALS_DEFAULT } from '@extas/settings';
import { addBuckets, BUCKETS, bucketOf, deviceOf, labMisses, p75, pageKindOf, targetOf, vitalUnits } from './vitals';

const T = SEO_VITALS_DEFAULT.targets;
const counts = (metric: 'LCP' | 'CLS', readings: number[]) => readings.reduce((c, r) => addBuckets(c, Object.assign(new Array(bucketOf(metric, r) + 1).fill(0), { [bucketOf(metric, r)]: 1 })), [] as number[]);

describe('Core Web Vitals (PR 234)', () => {
  it('keeps real readings only, in milliseconds or layout shift × 1000', () => {
    expect(vitalUnits('LCP', 2345.6)).toBe(2346);
    expect(vitalUnits('CLS', 0.1234)).toBe(123);
    expect(vitalUnits('LCP', -1)).toBeNull();
    expect(vitalUnits('LCP', Number.NaN)).toBeNull();
    expect(vitalUnits('TTFB', 120_000)).toBeNull();
    expect(vitalUnits('CLS', 42)).toBeNull();
  });

  it('counts each reading in its bucket; above the last limit in one more', () => {
    expect(bucketOf('LCP', 0)).toBe(0);
    expect(bucketOf('LCP', 100)).toBe(0);
    expect(bucketOf('LCP', 101)).toBe(1);
    expect(bucketOf('LCP', 2500)).toBe(BUCKETS.LCP.indexOf(2500));
    expect(bucketOf('LCP', 50_000)).toBe(BUCKETS.LCP.length);
    expect(bucketOf('CLS', 100)).toBe(BUCKETS.CLS.indexOf(100));
    expect(addBuckets([1, 2], [0, 1, 5])).toEqual([1, 3, 5]);
  });

  it('reads the 75th percentile back from the counts', () => {
    expect(p75('LCP', [])).toBeNull();
    // 100 readings spread 1.2–1.5 s: three quarters lie under ~1.425 s
    const c = new Array(BUCKETS.LCP.length + 1).fill(0);
    c[BUCKETS.LCP.indexOf(1500)] = 100;
    expect(p75('LCP', c)).toEqual({ value: 1425, over: false });
    // the third of four readings (1.1 s) sets it, read at the top of its bucket (1.0–1.2 s)
    expect(p75('LCP', counts('LCP', [900, 1000, 1100, 3200]))).toEqual({ value: 1200, over: false });
    const slow = new Array(BUCKETS.LCP.length + 1).fill(0);
    slow[BUCKETS.LCP.length] = 4;
    expect(p75('LCP', slow)).toEqual({ value: 20000, over: true });
    expect(p75('CLS', counts('CLS', [0, 0, 0.05, 0.3]))!.value).toBeLessThanOrEqual(50);
  });

  it('names the kind of page in both languages, the product prefix from the settings', () => {
    expect(pageKindOf('/', 'p')).toBe('home');
    expect(pageKindOf('/bn', 'p')).toBe('home');
    expect(pageKindOf('/collections/polos?size=M', 'p')).toBe('category');
    expect(pageKindOf('/bn/p/essential-pique-polo', 'p')).toBe('product');
    expect(pageKindOf('/item/essential-pique-polo', '/item/')).toBe('product');
    expect(pageKindOf('/combo/navy-set', 'p')).toBe('combo');
    expect(pageKindOf('/checkout/thanks/X1', 'p')).toBe('checkout');
    expect(pageKindOf('/account/orders', 'p')).toBe('account');
    expect(pageKindOf('/journal', 'p')).toBe('other');
    expect(pageKindOf('/bnx', 'p')).toBe('other');
  });

  it('a phone below the tablet width', () => {
    expect(deviceOf(390)).toBe('phone');
    expect(deviceOf(768)).toBe('desktop');
  });

  it("judges against PR 10's targets: FCP has none; weight only on a category page, load time only on the admin", () => {
    expect(targetOf('LCP', T)).toBe(2500);
    expect(targetOf('CLS', T)).toBe(100);
    expect(targetOf('FCP', T)).toBeNull();
    expect(labMisses({ path: '/', kind: 'home', lcpMs: 2400, cls: 0.05, ttfbMs: 500, kb: 3000 }, T)).toEqual([]);
    expect(labMisses({ path: '/collections/x', kind: 'category', lcpMs: 2600, cls: 0.2, ttfbMs: 700, kb: 1100 }, T)).toEqual(['LCP', 'CLS', 'TTFB', 'weight']);
    expect(labMisses({ path: '/admin', kind: 'admin', loadMs: 1200 }, T)).toEqual(['admin']);
  });
});
