// PR 24 — the responsive image component, rendered to HTML on the server: <picture> sources by format and screen,
// width and height always set, the colour placeholder, eager + high priority on the first screen, lazy otherwise.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import type { ImageFormat, ImageSource } from '@extas/media/delivery';
import { altFor, ResponsiveImage } from './ResponsiveImage';

const formats: ImageFormat[] = ['avif', 'webp', 'jpeg'];
const presets = registry['media.image.presets'].default;
const image = (rendered = true): ImageSource => ({
  id: 'a',
  dominantColor: '#142050',
  altEn: 'Navy polo, front',
  altBn: 'নেভি পোলো, সামনের দিক',
  ratio: registry['media.image.aspectRatio'].default,
  variants: rendered ? presets.flatMap((p) => formats.map((f) => ({ preset: p.name, format: f, width: p.width, height: (p.width * 5) / 4, url: `/media/m/${p.name}.${f}` }))) : [],
  slots: registry['media.image.slots'].default,
  phoneMaxWidth: registry['media.image.phoneMaxWidth'].default,
});

describe('<ResponsiveImage> (PR 24)', () => {
  it('a category card: AVIF and WebP sources, the JPEG img with width, height, lazy loading and the colour box', () => {
    const html = renderToStaticMarkup(<ResponsiveImage image={image()} slot="card" sizes="50vw" alt="Navy polo" />);
    expect(html.startsWith('<picture>')).toBe(true);
    expect(html).toContain('<source type="image/avif" srcSet="/media/m/card.avif 400w, /media/m/card2x.avif 800w" sizes="50vw"/>');
    expect(html).toContain('<source type="image/webp"');
    expect(html).toMatch(/<img src="\/media\/m\/card.jpeg" srcSet="\/media\/m\/card.jpeg 400w, \/media\/m\/card2x.jpeg 800w" sizes="50vw" width="800" height="1000" alt="Navy polo" loading="lazy" decoding="async" style="aspect-ratio:4 \/ 5;background-color:#142050"\/>/);
    expect(html).not.toContain('zoom');
  });

  it('the first-screen product photo: eager with high priority, a phone source by media query, never the zoom file', () => {
    const html = renderToStaticMarkup(<ResponsiveImage image={image()} slot="main" sizes="100vw" alt="Navy polo" priority />);
    expect(html).toContain('media="(max-width: 767px)" srcSet="/media/m/card.avif 400w, /media/m/card2x.avif 800w"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('width="1200" height="1500"');
    expect(html).not.toContain('zoom');
  });

  it('the zoom viewer gets the 2000 px file on a larger screen only', () => {
    const html = renderToStaticMarkup(<ResponsiveImage image={image()} slot="zoom" sizes="100vw" alt="Navy polo" />);
    expect(html).toContain('/media/m/zoom.avif 2000w');
    expect(html).toMatch(/media="\(max-width: 767px\)" srcSet="\/media\/m\/main.avif 1200w"/);
  });

  it('still processing: a colour box of the right shape, labelled for screen readers', () => {
    const html = renderToStaticMarkup(<ResponsiveImage image={image(false)} slot="card" sizes="50vw" alt="Navy polo" />);
    expect(html).toBe('<span role="img" aria-label="Navy polo" style="display:block;aspect-ratio:4 / 5;background-color:#142050" data-media-pending=""></span>');
  });

  it('alt text in the page language, else the fallback in that language (PR 232: never the other language)', () => {
    expect(altFor(image(), 'bn', 'x')).toBe('নেভি পোলো, সামনের দিক');
    expect(altFor({ altBn: null, altEn: 'Navy polo' }, 'bn', 'x')).toBe('x');
    expect(altFor({ altBn: 'নেভি পোলো', altEn: ' ' }, 'en', 'fallback')).toBe('fallback');
    expect(altFor({ altBn: null, altEn: null }, 'en', 'fallback')).toBe('fallback');
  });
});
