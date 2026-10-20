// The image pipeline without a database: the owner's spec as settings defaults, standardisation (sizes, 4:5, formats,
// quality, no enlarging, contain/cover, rotation, metadata), the naming convention, the watermark and the <picture>
// sources. Pictures are generated on the fly (fixtures.ts).
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadSchema } from '@extas/db';
import { registry } from '@extas/settings';
import {
  downloadKey,
  escapeXml,
  frameOf,
  inspectImage,
  isRenditionKey,
  MEDIA_REFERENCES,
  mediaUrl,
  NOT_A_USE,
  originalKey,
  phoneUrls,
  pictureSources,
  planRenditions,
  renditionKey,
  sha256,
  slugify,
  slugOfKey,
  stampWatermark,
  standardise,
  stripExtension,
  watermarkSvg,
  type ImageFormat,
  type ImageSource,
} from '../src';
import { defaultRenderConfig, NAVY, near, photo, pixel, WHITE } from './fixtures';

describe('owner spec as settings (registry v6, A2.9.7)', () => {
  it('five sizes thumb 160 · card 400 · card2x 800 · main 1200 · zoom 2000, ratio 4:5, AVIF + WebP + JPEG, quality 75–80', () => {
    expect(registry['media.image.presets'].default).toEqual([
      { name: 'thumb', width: 160 },
      { name: 'card', width: 400 },
      { name: 'card2x', width: 800 },
      { name: 'main', width: 1200 },
      { name: 'zoom', width: 2000 },
    ]);
    expect(registry['media.image.aspectRatio'].default).toEqual({ width: 4, height: 5 });
    expect(registry['media.image.formats'].default).toEqual(['avif', 'webp', 'jpeg']);
    const q = registry['media.image.quality'];
    expect(q.default).toBe(78);
    expect(q.schema.safeParse(75).success && q.schema.safeParse(80).success).toBe(true);
    expect(q.schema.safeParse(74).success || q.schema.safeParse(81).success).toBe(false);
    expect(registry['media.photos.minimum'].default).toBe(4);
    expect(registry['media.photos.requiredRoles'].default).toEqual(['FRONT', 'BACK', 'DETAIL', 'ON_MODEL']);
  });

  it('every new media key is registry version 6; the watermark text and the CDN address are owner data with no default', () => {
    const keys = Object.keys(registry).filter((k) => k.startsWith('media.'));
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const k of keys) expect(registry[k as keyof typeof registry].version, k).toBe(6);
    expect(registry['media.watermark.text'].isOwnerData).toBe(true);
    expect(registry['media.watermark.text'].default).toBeNull();
    expect(registry['media.publicBaseUrl'].isOwnerData).toBe(true);
  });

  it('refuses a format list without JPEG, a duplicate size name, and a zoom-free phone rule is the default', () => {
    expect(registry['media.image.formats'].schema.safeParse(['avif', 'webp']).success).toBe(false);
    expect(registry['media.image.presets'].schema.safeParse([{ name: 'card', width: 400 }, { name: 'card', width: 800 }]).success).toBe(false);
    const slots = registry['media.image.slots'].default;
    for (const [slot, s] of Object.entries(slots)) expect(s.phone, slot).not.toContain('zoom');
    expect(slots.zoom!.wide).toEqual(['zoom']);
  });
});

describe('standardisation (PR 22)', () => {
  it('makes 5 sizes × 3 formats at 4:5 from a 4:5 original, in the real formats, with the photo colour stored', async () => {
    const cfg = defaultRenderConfig();
    const std = await standardise(await photo(2000, 2500), cfg);
    expect(std.files).toHaveLength(15);
    for (const f of std.files) {
      const want = cfg.presets.find((p) => p.name === f.preset)!.width;
      expect([f.width, f.height], `${f.preset}.${f.format}`).toEqual([want, Math.round((want * 5) / 4)]);
      const info = await inspectImage(f.body);
      expect(info?.mime).toBe(`image/${f.format}`);
      expect([info?.width, info?.height]).toEqual([f.width, f.height]);
      expect(f.quality).toBe(78);
    }
    expect(near(hexToRgb(std.dominantColor), NAVY, 40)).toBe(true);
  });

  it('never enlarges: a 1000 px wide original gives 1000 px main and zoom, the smaller sizes as asked', async () => {
    const std = await standardise(await photo(1000, 1250), defaultRenderConfig({ formats: ['jpeg'] }));
    const w = Object.fromEntries(std.files.map((f) => [f.preset, [f.width, f.height]]));
    expect(w).toEqual({ thumb: [160, 200], card: [400, 500], card2x: [800, 1000], main: [1000, 1250], zoom: [1000, 1250] });
  });

  it('contain (default): another shape is kept whole on the background colour; cover cuts it to 4:5', async () => {
    const wide = await photo(1500, 1000);
    expect(frameOf(1500, 1000, { ratio: { width: 4, height: 5 }, fit: 'contain' })).toEqual({ width: 1500, height: 1875 });
    const contain = await standardise(wide, defaultRenderConfig({ formats: ['jpeg'], background: '#ff0000' }));
    const main = contain.files.find((f) => f.preset === 'main')!;
    expect([main.width, main.height]).toEqual([1200, 1500]);
    expect(near(await pixel(main.body, 600, 3), { r: 255, g: 0, b: 0 })).toBe(true); // the frame above the photo
    expect(near(await pixel(main.body, 3, 750), NAVY)).toBe(true); // the photo itself, left edge
    const cover = await standardise(wide, defaultRenderConfig({ formats: ['jpeg'], fit: 'cover' }));
    const cmain = cover.files.find((f) => f.preset === 'main')!;
    expect([cmain.width, cmain.height]).toEqual([800, 1000]); // the 4:5 cut of a 1000 px tall photo is 800 wide
    expect(near(await pixel(cmain.body, 400, 3), NAVY)).toBe(true); // no frame: photo to the edge
  });

  it('turns the photo the way the camera meant, drops every bit of metadata, and fills see-through parts', async () => {
    const turned = await photo(1500, 1200, 'jpeg', { orientation: 6 });
    const info = await inspectImage(turned);
    expect([info?.width, info?.height]).toEqual([1200, 1500]); // displayed upright
    const std = await standardise(turned, defaultRenderConfig({ formats: ['jpeg'] }));
    const meta = await sharp(std.files[0]!.body).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    const png = await standardise(await photo(1200, 1500, 'png', { alpha: true }), defaultRenderConfig({ formats: ['webp'] }));
    expect((await sharp(png.files[0]!.body).metadata()).hasAlpha).toBe(false);
  });

  it('a phone-size category photo and the main photo stay inside the owner targets (40 KB / 150 KB) on a real-ish photo', async () => {
    const std = await standardise(await photo(2000, 2500), defaultRenderConfig({ avifEffort: 4 }));
    const card = std.files.find((f) => f.preset === 'card' && f.format === 'avif')!;
    const main = std.files.find((f) => f.preset === 'main' && f.format === 'avif')!;
    expect(card.body.byteLength).toBeLessThan(40 * 1024);
    expect(main.body.byteLength).toBeLessThan(150 * 1024);
  });

  it('says what a file really is, whatever its name; not a picture → null', async () => {
    expect((await inspectImage(await photo(300, 300, 'png')))?.mime).toBe('image/png');
    expect((await inspectImage(await photo(300, 300, 'webp')))?.mime).toBe('image/webp');
    expect(await inspectImage(new TextEncoder().encode('%PDF-1.7 not a picture'))).toBeNull();
  });
});

describe('naming convention (PR 22, P06 §3)', () => {
  it('descriptive, lower-case, hyphenated; nothing usable → image', () => {
    expect(slugify('Piqué Polo — Navy (front)')).toBe('pique-polo-navy-front');
    expect(slugify(stripExtension('IMG_0023.JPG'))).toBe('img-0023');
    expect(slugify('নেভি পোলো')).toBe('image');
    expect(slugify('a'.repeat(100))).toHaveLength(60);
  });

  it('originals, renditions and download copies each have their own place; only renditions are public', () => {
    const checksum = sha256(new Uint8Array([1, 2, 3]));
    const o = originalKey({ storeId: 1, checksum, slug: 'polo-navy-front', ext: 'jpg', at: new Date('2026-10-20T00:00:00Z') });
    expect(o).toBe(`media/s1/o/2026/10/${checksum.slice(0, 16)}-polo-navy-front.jpg`);
    expect(slugOfKey(o)).toBe('polo-navy-front');
    const id = '0192f1a2-3b4c-7d5e-8f90-123456789abc';
    const r = renditionKey({ storeId: 1, assetId: id, slug: 'polo-navy-front', preset: 'card2x', format: 'jpeg', hash: 'abcdef012345' });
    expect(r).toBe(`media/s1/r/${id}/polo-navy-front-card2x.abcdef012345.jpg`);
    expect(isRenditionKey(r)).toBe(true);
    expect(isRenditionKey(o)).toBe(false);
    expect(isRenditionKey(downloadKey({ storeId: 1, assetId: id, slug: 'x', hash: 'abcdef012345' }))).toBe(false);
    expect(isRenditionKey(`media/s1/r/${id}/../o/x.abcdef012345.jpg`)).toBe(false);
  });

  it('a settings change gives every rendition a new name (nothing is overwritten); the same settings the same names', () => {
    const asset = { id: '0192f1a2-3b4c-7d5e-8f90-123456789abc', storeId: 1, storageKey: 'media/s1/o/2026/10/0123456789abcdef-polo.jpg', checksumSha256: 'ab'.repeat(32) };
    const a = planRenditions(asset, defaultRenderConfig());
    const b = planRenditions(asset, defaultRenderConfig());
    const c = planRenditions(asset, defaultRenderConfig({ quality: 75 }));
    expect(a).toHaveLength(15);
    expect(a).toEqual(b);
    expect(a.every((x, i) => x.key !== c[i]!.key)).toBe(true);
    expect(a.every((x) => isRenditionKey(x.key))).toBe(true);
  });
});

describe('watermark on download only (PR 23, C7.11)', () => {
  it('stamps a copy; the clean picture stays byte for byte the same', async () => {
    const clean = await photo(1200, 1500);
    const before = sha256(clean);
    const marked = await stampWatermark(clean, { text: 'Sample shop', position: 'bottom-right', opacity: 0.6, scale: 6, quality: 78 });
    expect(sha256(clean)).toBe(before);
    const meta = await sharp(marked).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 1500]);
    // Bottom-right corner (the plate) is darker than the navy around it; the top-left corner is untouched.
    const corner = await pixel(marked, 1200 - 60, 1500 - 50);
    const plain = await pixel(clean, 1200 - 60, 1500 - 50);
    expect(corner.r + corner.g + corner.b).not.toBe(plain.r + plain.g + plain.b);
    expect(near(await pixel(marked, 10, 10), NAVY)).toBe(true);
  });

  it('places the mark where the setting says, repeats it when tiled, and escapes the text', async () => {
    const svg = watermarkSvg(1000, 1250, { text: 'A & <B>', position: 'top-left', opacity: 0.4, scale: 5 });
    expect(svg).toContain('A &amp; &lt;B&gt;');
    const x = Number(/<rect x="(\d+)"/.exec(svg)![1]);
    expect(x).toBeLessThan(100);
    const tiled = watermarkSvg(1000, 1250, { text: 'mark', position: 'tiled', opacity: 0.4, scale: 5 });
    expect((tiled.match(/<text /g) ?? []).length).toBeGreaterThan(6);
    expect(escapeXml(`"'`)).toBe('&quot;&apos;');
    const centre = await stampWatermark(await photo(800, 1000), { text: 'mark', position: 'centre', opacity: 1, scale: 10, quality: 78 });
    expect(near(await pixel(centre, 400, 430), WHITE, 60)).toBe(false); // the white square now carries the dark plate
  });
});

describe('responsive delivery (PR 24)', () => {
  const formats: ImageFormat[] = ['avif', 'webp', 'jpeg'];
  const presets = registry['media.image.presets'].default;
  const source = (variants = presets.flatMap((p) => formats.map((f) => ({ preset: p.name, format: f, width: p.width, height: (p.width * 5) / 4, url: `/media/x/${p.name}.${f}` })))): ImageSource => ({
    id: 'a',
    dominantColor: '#142050',
    altEn: 'Navy polo, front',
    altBn: null,
    ratio: { width: 4, height: 5 },
    variants,
    slots: registry['media.image.slots'].default,
    phoneMaxWidth: registry['media.image.phoneMaxWidth'].default,
  });

  it('category card: AVIF, then WebP, then the JPEG <img>, 400 and 800 only, width and height set', () => {
    const m = pictureSources(source(), 'card')!;
    expect(m.sources.map((s) => s.type)).toEqual(['image/avif', 'image/webp']);
    expect(m.sources[0]!.srcSet).toBe('/media/x/card.avif 400w, /media/x/card2x.avif 800w');
    expect(m.img).toEqual({ src: '/media/x/card.jpeg', srcSet: '/media/x/card.jpeg 400w, /media/x/card2x.jpeg 800w', width: 800, height: 1000 });
  });

  it('product main photo: phone gets 400/800 by a media query, a larger screen 800/1200; zoom is 2000 on a larger screen', () => {
    const m = pictureSources(source(), 'main')!;
    const phone = m.sources.filter((s) => s.media === '(max-width: 767px)');
    expect(phone.map((s) => s.type)).toEqual(['image/avif', 'image/webp', 'image/jpeg']);
    expect(phone[0]!.srcSet).toBe('/media/x/card.avif 400w, /media/x/card2x.avif 800w');
    expect(m.sources.find((s) => !s.media && s.type === 'image/avif')!.srcSet).toBe('/media/x/card2x.avif 800w, /media/x/main.avif 1200w');
    expect(m.img.width).toBe(1200);
    expect(pictureSources(source(), 'zoom')!.img.srcSet).toBe('/media/x/zoom.jpeg 2000w');
  });

  it('a phone is never sent the 2000 px file, in any place', () => {
    for (const slot of Object.keys(registry['media.image.slots'].default)) {
      expect(phoneUrls(source(), slot).some((u) => u.includes('zoom')), slot).toBe(false);
    }
  });

  it('nothing rendered yet → null (the component then shows the colour box); an unknown place is a mistake', () => {
    expect(pictureSources(source([]), 'card')).toBeNull();
    expect(() => pictureSources(source(), 'nowhere')).toThrow(/no image slot/);
  });

  it('addresses: this site /media by default, the CDN base when set', () => {
    expect(mediaUrl('media/s1/r/a/b.jpg', null)).toBe('/media/media/s1/r/a/b.jpg');
    expect(mediaUrl('media/s1/r/a/b.jpg', 'https://cdn.example.com/')).toBe('https://cdn.example.com/media/s1/r/a/b.jpg');
  });
});

describe('where a file is used (PR 37)', () => {
  it('every column of the schema that holds a file id is checked by the orphan clean-up', () => {
    const schema = loadSchema();
    const found: string[] = [];
    for (const m of schema.models) {
      for (const f of m.fields) {
        if (f.type === 'String' && /(^assetId$|AssetIds?$)/.test(f.name) && f.attrs.includes('@db.Uuid')) found.push(`${m.name}.${f.name}`);
      }
    }
    const listed = MEDIA_REFERENCES.map((r) => `${r.model}.${r.field}`);
    expect(found.filter((f) => !NOT_A_USE.includes(f)).sort()).toEqual([...listed].sort());
    for (const r of MEDIA_REFERENCES) {
      const field = schema.models.find((m) => m.name === r.model)!.fields.find((f) => f.name === r.field)!;
      expect(field.list, `${r.model}.${r.field}`).toBe(r.list);
    }
  });
});

function hexToRgb(h: string) {
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}
