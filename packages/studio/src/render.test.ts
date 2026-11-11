// S23 · PR 439 — the render plan builder, pure (no database, no pixel ever touched).
import { describe, expect, it } from 'vitest';
import { brandAssetsByKind, buildRenderPlan, type RenderScene } from './render';

describe('brandAssetsByKind', () => {
  it('groups by kind, first match wins, and leaves out a kind nobody has', () => {
    const map = brandAssetsByKind([
      { id: 'a1', tags: ['logo', 'winter-2026'] },
      { id: 'a2', tags: ['logo'] },
      { id: 'a3', tags: ['frame'] },
    ]);
    expect(map).toEqual({ logo: 'a1', frame: 'a3' });
  });

  it('is empty when nothing is tagged a brand-asset kind', () => {
    expect(brandAssetsByKind([{ id: 'a1', tags: ['winter-2026'] }])).toEqual({});
  });
});

describe('buildRenderPlan', () => {
  const products: RenderScene[] = [
    { productId: 'p1', productName: 'Tracksuit' },
    { productId: 'p2', productName: 'Polo' },
  ];
  const brandAssets = [{ id: 'logo-1', tags: ['logo'] }];

  it('an image template carries no duration, keeps scene order, and trims a blank caption to undefined', () => {
    const plan = buildRenderPlan({ kind: 'image', spec: { aspectRatio: '1:1', brandAssetIds: [] } }, products, brandAssets, '   ');
    expect(plan.kind).toBe('image');
    expect(plan.durationSeconds).toBeUndefined();
    expect(plan.scenes).toEqual(products);
    expect(plan.brandAssets).toEqual({ logo: 'logo-1' });
    expect(plan.caption).toBeUndefined();
  });

  it('a reel/short template carries the spec’s own duration, and the caption is trimmed', () => {
    const reel = buildRenderPlan({ kind: 'reel', spec: { aspectRatio: '9:16', durationSeconds: 15, brandAssetIds: [] } }, products, brandAssets, '  Winter drop  ');
    expect(reel.durationSeconds).toBe(15);
    expect(reel.caption).toBe('Winter drop');
    const short = buildRenderPlan({ kind: 'short', spec: { aspectRatio: '9:16', durationSeconds: 20, brandAssetIds: [] } }, products, brandAssets);
    expect(short.durationSeconds).toBe(20);
  });

  it('a story template carries no duration even if the spec happened to have one', () => {
    const plan = buildRenderPlan({ kind: 'story', spec: { aspectRatio: '9:16', durationSeconds: 8, brandAssetIds: [] } }, products, brandAssets);
    expect(plan.durationSeconds).toBeUndefined();
  });
});
