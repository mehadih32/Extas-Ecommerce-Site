// S28 · PR 681 — the product page's video: nothing while off, links read per provider, VideoObject only when complete.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { videoLdOf, videoModel, type VideoRow } from './pdp-video';
import { byteRange } from './video-serve';
import { indexWithVideos, videoUrlsetXml } from '../seo/video-sitemap';

const on = { ...registry['catalogue.video'].default, on: true };
const link: VideoRow = {
  source: 'LINK',
  provider: 'YOUTUBE',
  url: 'https://youtu.be/abcDEF12345',
  fileAssetId: null,
  posterAssetId: null,
  durationSec: 15,
  titleEn: 'On model',
  titleBn: null,
};
const file: VideoRow = {
  source: 'FILE',
  provider: 'FILE',
  url: null,
  fileAssetId: '11111111-1111-7111-8111-111111111111',
  posterAssetId: null,
  durationSec: 20,
  titleEn: null,
  titleBn: null,
};

describe('videoModel', () => {
  it('shows nothing while the switch is off (as shipped) or without a row', () => {
    expect(videoModel(link, registry['catalogue.video'].default, 'en')).toBeNull();
    expect(videoModel(null, on, 'en')).toBeNull();
  });
  it('makes an embed for a link and the shop clip address for a file', () => {
    expect(videoModel(link, on, 'en')).toMatchObject({
      kind: 'embed',
      provider: 'YOUTUBE',
      watchUrl: 'https://www.youtube.com/watch?v=abcDEF12345',
      title: 'On model',
      playOnTap: true,
    });
    expect(videoModel(file, on, 'bn')).toMatchObject({ kind: 'file', playUrl: '/media/video/11111111-1111-7111-8111-111111111111', watchUrl: null });
  });
  it('respects the allowed providers, the upload switch and the Bengali title falling back to English', () => {
    expect(videoModel(link, { ...on, providers: ['VIMEO'] }, 'en')).toBeNull();
    expect(videoModel(file, { ...on, allowUpload: false }, 'en')).toBeNull();
    expect(videoModel(link, on, 'bn')!.title).toBe('On model');
  });
  it('writes a VideoObject only when the poster, length and date are all there', () => {
    const m = videoModel(link, on, 'en');
    const p = { name: 'Polo', description: null, posterUrl: 'https://shop.example/media/x.jpg', pageUrl: 'https://shop.example/p/polo', uploadDate: '2026-11-13T00:00:00.000Z' };
    expect(videoLdOf(m, p)).toMatchObject({
      '@type': 'VideoObject',
      name: 'On model',
      description: 'Polo',
      duration: 'PT15S',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abcDEF12345',
    });
    expect(videoLdOf(m, { ...p, posterUrl: null })).toBeNull();
    expect(videoLdOf(m, { ...p, uploadDate: null })).toBeNull();
    expect(videoLdOf({ ...m!, durationSec: null }, p)).toBeNull();
    expect(videoLdOf(videoModel(file, on, 'en'), p)).toMatchObject({ contentUrl: 'https://shop.example/media/video/11111111-1111-7111-8111-111111111111' });
  });
});

describe('byteRange', () => {
  it('reads the three range shapes and refuses the impossible', () => {
    expect(byteRange(null, 100)).toBeNull();
    expect(byteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(byteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99 });
    expect(byteRange('bytes=100-', 100)).toBe('bad');
    expect(byteRange('bytes=5-2', 100)).toBe('bad');
    expect(byteRange('nonsense', 100)).toBe('bad');
  });
});

describe('video sitemap', () => {
  const item = {
    page: 'https://shop.example/p/polo',
    title: 'Polo & shirt',
    description: 'A <polo>',
    thumbnail: 'https://shop.example/media/t.jpg',
    player: 'https://www.youtube-nocookie.com/embed/abc',
    content: null,
    durationSec: 15,
    published: new Date('2026-11-13T00:00:00Z'),
  };
  it('writes each video with escaped words, and leaves out one with neither player nor file', () => {
    const x = videoUrlsetXml([item, { ...item, player: null, content: null, page: 'https://shop.example/p/none' }]);
    expect(x).toContain('<video:title>Polo &amp; shirt</video:title>');
    expect(x).toContain('<video:description>A &lt;polo&gt;</video:description>');
    expect(x).toContain('<video:duration>15</video:duration>');
    expect(x).not.toContain('/p/none');
  });
  it('is added to the index only while there is a video', () => {
    const idx = '<?xml version="1.0"?>\n<sitemapindex>\n</sitemapindex>\n';
    expect(indexWithVideos(idx, new URL('https://shop.example'), false)).toBe(idx);
    expect(indexWithVideos(idx, new URL('https://shop.example'), true)).toContain('https://shop.example/sitemaps/videos.xml');
  });
});
