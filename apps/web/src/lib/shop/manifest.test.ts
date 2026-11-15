// PR 744 — the home-screen manifest (no database).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { buildManifest } from './manifest';

const off = registry['app.homeScreen'].default;
const fallbackIcon = { src: '/tab.ico', sizes: 'any', type: 'image/svg+xml' };
const base = { storeName: 'Test Shop Long Name', background: '#ffffff', icons: [], fallbackIcon };

describe('buildManifest (PR 744)', () => {
  it('is nothing while off', () => {
    expect(buildManifest({ ...base, set: off })).toBeNull();
  });
  it('falls back to the shop name, the theme colour and the tab icon', () => {
    const m = buildManifest({ ...base, set: { ...off, on: true } })!;
    expect(m.name).toBe('Test Shop Long Name');
    expect((m.short_name as string).length).toBeLessThanOrEqual(12);
    expect(m.theme_color).toBe('#ffffff');
    expect(m.icons).toEqual([{ ...fallbackIcon, purpose: 'any' }]);
  });
  it('uses the owner`s own values and the picked icon sizes', () => {
    const m = buildManifest({ ...base, icons: [{ src: '/m/1', sizes: '512x512', type: 'image/jpeg' }], set: { ...off, on: true, name: 'Mine', shortName: 'M', themeColour: '#111111', backgroundColour: '#222222', display: 'minimal-ui' } })!;
    expect(m).toMatchObject({ name: 'Mine', short_name: 'M', theme_color: '#111111', background_color: '#222222', display: 'minimal-ui' });
    expect((m.icons as unknown[]).length).toBe(1);
  });
});
