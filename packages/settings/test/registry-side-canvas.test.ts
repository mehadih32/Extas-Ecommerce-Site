// S02 · PR 596 — the side canvas ships off with no zone (today's look until the owner approves it), and a zone's
// schema refuses an unsafe link, an image that is not an https address or a shop path, and days backwards.
import { describe, expect, it } from 'vitest';
import { registry, sideZonesSchema } from '../src';

const zone = (over: Record<string, unknown> = {}) => ({
  id: 'zone01',
  name: 'Polo',
  side: 'left',
  on: true,
  pages: 'home',
  cats: [],
  from: null,
  to: null,
  top: 48,
  width: 112,
  height: 320,
  mode: 'sticky',
  kind: 'product',
  ref: 'essential-pique-polo',
  alt: { en: '', bn: '' },
  text: { en: '', bn: '' },
  href: '',
  style: 'full',
  ...over,
});

describe('layout.sideCanvas and layout.sideZones (PR 596, registry v245)', () => {
  it('ship off with no zone', () => {
    expect(registry['layout.sideCanvas'].default).toMatchObject({ enabled: false });
    expect(registry['layout.sideZones'].default).toEqual([]);
    expect(registry['layout.sideCanvas'].version).toBe(245);
  });

  it('takes a zone and refuses unsafe ones', () => {
    const ok = (z: unknown) => sideZonesSchema.safeParse([z]).success;
    expect(ok(zone())).toBe(true);
    expect(ok(zone({ kind: 'image', ref: 'https://cdn.example.com/a.webp' }))).toBe(true);
    expect(ok(zone({ kind: 'image', ref: 'javascript:alert(1)' }))).toBe(false);
    expect(ok(zone({ href: 'http://plain.example.com' }))).toBe(false);
    expect(ok(zone({ from: '2026-12-02', to: '2026-12-01' }))).toBe(false);
    expect(ok(zone({ width: 10 }))).toBe(false);
    expect(sideZonesSchema.safeParse([zone(), zone()]).success).toBe(false);
  });
});
