// S25 · PR 489 — pure tests for the campaign overlay's shapes, its window and its matching/ranking (no database).
import { describe, expect, it } from 'vitest';
import {
  activeOverlayFor,
  isOverlayActive,
  OVERLAY_TEMPLATES,
  overlayAppliesToSchema,
  overlayDesignSchema,
  overlayInput,
  overlayReaches,
  type CampaignOverlayView,
  type OverlayAppliesTo,
} from './overlay';

const DESIGN = { labelEn: 'Flash sale', labelBn: 'ফ্ল্যাশ সেল', accent: '#C81E3A' };

function fakeOverlay(over: Partial<CampaignOverlayView> & { appliesTo: OverlayAppliesTo } = { appliesTo: { kind: 'all' } }): CampaignOverlayView {
  return {
    id: 'ov1',
    campaignId: null,
    templateKey: 'badge',
    design: DESIGN,
    enabled: true,
    startsAt: null,
    endsAt: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('overlayDesignSchema', () => {
  it('refuses a colour that is not a 6-digit hex', () => {
    expect(overlayDesignSchema.safeParse({ ...DESIGN, accent: 'red' }).success).toBe(false);
    expect(overlayDesignSchema.safeParse({ ...DESIGN, accent: '#fff' }).success).toBe(false);
  });

  it('accepts a real 6-digit hex colour', () => {
    expect(overlayDesignSchema.safeParse(DESIGN).success).toBe(true);
  });
});

describe('overlayAppliesToSchema', () => {
  it('accepts "all" with no slugs', () => {
    expect(overlayAppliesToSchema.safeParse({ kind: 'all' }).success).toBe(true);
  });

  it('refuses "products" with an empty slug list', () => {
    expect(overlayAppliesToSchema.safeParse({ kind: 'products', slugs: [] }).success).toBe(false);
  });

  it('accepts "categories" with slugs', () => {
    expect(overlayAppliesToSchema.safeParse({ kind: 'categories', slugs: ['polos', 'formal-shirts'] }).success).toBe(true);
  });
});

describe('overlayInput', () => {
  it('refuses a template outside the fixed set', () => {
    const bad = { templateKey: 'popup', design: DESIGN, appliesTo: { kind: 'all' } };
    expect(overlayInput.safeParse(bad).success).toBe(false);
  });

  it('accepts every listed template', () => {
    for (const t of OVERLAY_TEMPLATES) expect(overlayInput.safeParse({ templateKey: t, design: DESIGN, appliesTo: { kind: 'all' } }).success).toBe(true);
  });
});

describe('isOverlayActive', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('a disabled overlay is never active, even inside its window', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'all' }, enabled: false, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z' });
    expect(isOverlayActive(o, now)).toBe(false);
  });

  it('an archived overlay is never active', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'all' }, archived: true });
    expect(isOverlayActive(o, now)).toBe(false);
  });

  it('active before its start', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'all' }, startsAt: '2026-07-01T00:00:00.000Z' });
    expect(isOverlayActive(o, now)).toBe(false);
  });

  it('inactive after its end', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'all' }, endsAt: '2026-06-01T00:00:00.000Z' });
    expect(isOverlayActive(o, now)).toBe(false);
  });

  it('active with no window at all (open-ended)', () => {
    expect(isOverlayActive(fakeOverlay({ appliesTo: { kind: 'all' } }), now)).toBe(true);
  });

  it('active exactly on the start and end instants (inclusive edges)', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'all' }, startsAt: now.toISOString(), endsAt: now.toISOString() });
    expect(isOverlayActive(o, now)).toBe(true);
  });
});

describe('overlayReaches', () => {
  it('"all" reaches every product', () => {
    expect(overlayReaches(fakeOverlay({ appliesTo: { kind: 'all' } }), { slug: 'x', categorySlug: null })).toBe(true);
  });

  it('"products" reaches only its own slugs', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'products', slugs: ['polo-navy'] } });
    expect(overlayReaches(o, { slug: 'polo-navy', categorySlug: null })).toBe(true);
    expect(overlayReaches(o, { slug: 'polo-white', categorySlug: null })).toBe(false);
  });

  it('"categories" reaches a product only through its own category, never a product list', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'categories', slugs: ['polos'] } });
    expect(overlayReaches(o, { slug: 'polo-navy', categorySlug: 'polos' })).toBe(true);
    expect(overlayReaches(o, { slug: 'shirt-blue', categorySlug: 'formal-shirts' })).toBe(false);
    expect(overlayReaches(o, { slug: 'shirt-blue', categorySlug: null })).toBe(false);
  });
});

describe('activeOverlayFor', () => {
  const target = { slug: 'polo-navy', categorySlug: 'polos' };

  it('returns null when nothing reaches the product', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'products', slugs: ['other'] } });
    expect(activeOverlayFor([o], target)).toBeNull();
  });

  it('returns null when the only match is outside its window', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'all' }, endsAt: '2020-01-01T00:00:00.000Z' });
    expect(activeOverlayFor([o], target)).toBeNull();
  });

  it('a product-specific overlay beats a store-wide one', () => {
    const wide = fakeOverlay({ id: 'wide', appliesTo: { kind: 'all' }, createdAt: '2026-05-01T00:00:00.000Z' });
    const specific = fakeOverlay({ id: 'specific', appliesTo: { kind: 'products', slugs: ['polo-navy'] }, design: { ...DESIGN, labelEn: 'Specific' }, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(activeOverlayFor([wide, specific], target)?.labelEn).toBe('Specific');
  });

  it('a category overlay beats a store-wide one', () => {
    const wide = fakeOverlay({ id: 'wide', appliesTo: { kind: 'all' } });
    const cat = fakeOverlay({ id: 'cat', appliesTo: { kind: 'categories', slugs: ['polos'] }, design: { ...DESIGN, labelEn: 'Category' } });
    expect(activeOverlayFor([wide, cat], target)?.labelEn).toBe('Category');
  });

  it('among ties of the same reach, the most recently created wins', () => {
    const older = fakeOverlay({ id: 'older', appliesTo: { kind: 'all' }, design: { ...DESIGN, labelEn: 'Older' }, createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = fakeOverlay({ id: 'newer', appliesTo: { kind: 'all' }, design: { ...DESIGN, labelEn: 'Newer' }, createdAt: '2026-02-01T00:00:00.000Z' });
    expect(activeOverlayFor([older, newer], target)?.labelEn).toBe('Newer');
  });

  it('carries the template key through so the storefront knows which shape to draw', () => {
    const o = fakeOverlay({ appliesTo: { kind: 'all' }, templateKey: 'bottomStrip' });
    expect(activeOverlayFor([o], target)?.templateKey).toBe('bottomStrip');
  });
});
