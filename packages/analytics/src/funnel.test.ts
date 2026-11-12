import { describe, expect, it } from 'vitest';
import { computeFunnelResult, funnelInputSchema, funnelStepsSchema, type FunnelEventRow, type FunnelStepDef } from './funnel';

const step = (over: Partial<FunnelStepDef> = {}): FunnelStepDef => ({
  key: over.key ?? 'view',
  label: over.label ?? 'Viewed the page',
  eventName: over.eventName ?? 'product_view',
  pageType: over.pageType ?? null,
  productId: over.productId ?? null,
  categoryId: over.categoryId ?? null,
});

describe('funnelStepsSchema', () => {
  it('accepts a well-shaped, ordered pair of steps', () => {
    const steps = [step({ key: 'view', eventName: 'product_view' }), step({ key: 'bag', eventName: 'add_to_bag', label: 'Added to bag' })];
    expect(funnelStepsSchema.safeParse(steps).success).toBe(true);
  });

  it('refuses fewer than two steps', () => {
    expect(funnelStepsSchema.safeParse([step()]).success).toBe(false);
  });

  it('refuses more than the step cap', () => {
    const steps = Array.from({ length: 9 }, (_, i) => step({ key: `k${i}` }));
    expect(funnelStepsSchema.safeParse(steps).success).toBe(false);
  });

  it('refuses a duplicate step key', () => {
    const steps = [step({ key: 'a' }), step({ key: 'a', eventName: 'add_to_bag' })];
    expect(funnelStepsSchema.safeParse(steps).success).toBe(false);
  });

  it('refuses an event name outside the catalogue', () => {
    const steps = [step(), { ...step({ key: 'b' }), eventName: 'not_a_real_event' }];
    expect(funnelStepsSchema.safeParse(steps).success).toBe(false);
  });

  it('refuses an unknown field on a step (strict)', () => {
    const steps = [step(), { ...step({ key: 'b' }), weight: 5 }];
    expect(funnelStepsSchema.safeParse(steps).success).toBe(false);
  });

  it('refuses a productId that does not look like one', () => {
    const steps = [step({ productId: 'not-an-id!' }), step({ key: 'b', eventName: 'add_to_bag' })];
    expect(funnelStepsSchema.safeParse(steps).success).toBe(false);
  });

  it('accepts a step scoped by pageType, productId and categoryId', () => {
    const steps = [
      step({ pageType: 'product', productId: '0123456789abcdef', categoryId: 'fedcba9876543210' }),
      step({ key: 'b', eventName: 'add_to_bag' }),
    ];
    expect(funnelStepsSchema.safeParse(steps).success).toBe(true);
  });
});

describe('funnelInputSchema', () => {
  it('accepts a named funnel with a valid step list', () => {
    const input = { name: 'Product page', steps: [step(), step({ key: 'b', eventName: 'add_to_bag' })] };
    expect(funnelInputSchema.safeParse(input).success).toBe(true);
  });

  it('refuses an empty name', () => {
    const input = { name: '', steps: [step(), step({ key: 'b', eventName: 'add_to_bag' })] };
    expect(funnelInputSchema.safeParse(input).success).toBe(false);
  });

  it('refuses an unknown top-level field (strict)', () => {
    const input = { name: 'X', steps: [step(), step({ key: 'b', eventName: 'add_to_bag' })], archived: false };
    expect(funnelInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('computeFunnelResult', () => {
  const row = (over: Partial<FunnelEventRow>): FunnelEventRow => ({
    visitorId: over.visitorId ?? 'v1',
    name: over.name ?? 'product_view',
    pageType: over.pageType ?? null,
    productId: over.productId ?? null,
    categoryId: over.categoryId ?? null,
  });

  it('returns zero visitors for every step when there are no events', () => {
    const steps = [step(), step({ key: 'b', eventName: 'add_to_bag' })];
    const r = computeFunnelResult(steps, []);
    expect(r.steps.map((s) => s.visitors)).toEqual([0, 0]);
    expect(r.steps[0]!.conversionFromPrevious).toBeNull();
    expect(r.steps[0]!.conversionFromFirst).toBeNull();
  });

  it('counts a distinct visitor once even with repeated qualifying events', () => {
    const steps = [step()];
    const events = [row({ visitorId: 'v1' }), row({ visitorId: 'v1' }), row({ visitorId: 'v2' })];
    const r = computeFunnelResult(steps, events);
    expect(r.steps[0]!.visitors).toBe(2);
  });

  it('only carries a visitor to step 2 when they also qualified for step 1', () => {
    const steps = [step({ key: 'view', eventName: 'product_view' }), step({ key: 'bag', eventName: 'add_to_bag' })];
    const events = [
      row({ visitorId: 'v1', name: 'product_view' }),
      row({ visitorId: 'v1', name: 'add_to_bag' }),
      row({ visitorId: 'v2', name: 'add_to_bag' }), // never viewed — not carried into step 2
      row({ visitorId: 'v3', name: 'product_view' }), // viewed but never bagged
    ];
    const r = computeFunnelResult(steps, events);
    expect(r.steps[0]!.visitors).toBe(2); // v1, v3
    expect(r.steps[1]!.visitors).toBe(1); // v1 only
    expect(r.steps[1]!.conversionFromPrevious).toBe(0.5);
    expect(r.steps[1]!.conversionFromFirst).toBe(0.5);
  });

  it('a step scoped to one productId only counts events for that product', () => {
    const steps = [step({ eventName: 'product_view', productId: 'aaaaaaaaaaaaaaaa' })];
    const events = [row({ visitorId: 'v1', productId: 'aaaaaaaaaaaaaaaa' }), row({ visitorId: 'v2', productId: 'bbbbbbbbbbbbbbbb' })];
    const r = computeFunnelResult(steps, events);
    expect(r.steps[0]!.visitors).toBe(1);
  });

  it('never divides by zero: a zero previous step yields a 0 conversion, not NaN or Infinity', () => {
    const steps = [step({ eventName: 'product_view' }), step({ key: 'b', eventName: 'add_to_bag' })];
    const events = [row({ visitorId: 'v1', name: 'add_to_bag' })]; // qualifies for step 2 but never step 1
    const r = computeFunnelResult(steps, events);
    expect(r.steps[0]!.visitors).toBe(0);
    expect(r.steps[1]!.visitors).toBe(0);
    expect(r.steps[1]!.conversionFromPrevious).toBe(0);
    expect(Number.isFinite(r.steps[1]!.conversionFromPrevious)).toBe(true);
  });

  it('keeps every step monotonically non-increasing in visitor count', () => {
    const steps = [step({ key: 'a', eventName: 'product_view' }), step({ key: 'b', eventName: 'add_to_bag' }), step({ key: 'c', eventName: 'purchase' })];
    const events = [
      row({ visitorId: 'v1', name: 'product_view' }),
      row({ visitorId: 'v1', name: 'add_to_bag' }),
      row({ visitorId: 'v1', name: 'purchase' }),
      row({ visitorId: 'v2', name: 'product_view' }),
      row({ visitorId: 'v2', name: 'add_to_bag' }),
      row({ visitorId: 'v3', name: 'product_view' }),
    ];
    const r = computeFunnelResult(steps, events);
    expect(r.steps.map((s) => s.visitors)).toEqual([3, 2, 1]);
  });
});
