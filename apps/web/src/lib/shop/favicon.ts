// CN-016 / PR 501 — the site's tab icon. The owner's own icon (`brand.favicon`, a media picture) when he has uploaded
// one; until then a neutral icon drawn from the theme of the day (a bag in the theme's brand colour), never a logo or a
// name. The browser asks for /favicon.ico on every page (admin and progress page too), so the address must always
// answer: a 404 there is a console error, which fails the smoke test after every deploy.
import { ICON_PATHS } from '@/components/shop/icon-paths';
import type { ImageSource } from '@extas/media';
import type { ThemeTokens } from './tokens';

/** The neutral icon: a rounded square in the theme's brand colour with the shop's bag line icon on it. */
export function neutralIconSvg(t: Pick<ThemeTokens, 'brand' | 'surface'>): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    `<rect width="24" height="24" rx="5.5" fill="${t.brand}"/>` +
    `<g fill="none" stroke="${t.surface}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS.bag}</g>` +
    '</svg>'
  );
}

/** The smallest stored rendition of the owner's icon (any format), or null when it has none yet. */
export function smallestRendition(src: ImageSource | undefined): string | null {
  const v = [...(src?.variants ?? [])].sort((a, b) => a.width - b.width)[0];
  return v ? v.url : null;
}
