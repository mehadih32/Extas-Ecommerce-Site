// PR 33 — the page reader connection (Keys & connections: "Read product pages from links"). It needs no key: once the
// owner gives it a test page and its Test button passes, the server reads pages itself (direct.ts). Until then it runs
// on the mock: no network, a made-up sample page built from the link (a name from the address, a sample description,
// sample photo links, never a price), so the import screen can be tried from day one (A1.3).
import { z } from 'zod';
import { defineAdapter } from '../define';
import { directPageReader } from './direct';
import { readableUrl, type PageReader } from './types';

export * from './types';
export { directPageReader, type DirectReaderOptions } from './direct';

export const pageReaderConfig = z.object({
  /** A product page the Test button reads (any page the owner trusts, e.g. a supplier's). */
  testUrl: z.url({ protocol: /^https?$/, message: 'not a web address' }).max(500),
  /** Sent to the sites read; optional. */
  userAgent: z.string().trim().min(1).max(200).optional(),
});
type Config = z.infer<typeof pageReaderConfig>;

/** What the reader says it is when the owner has not named it (no shop name: that is a setting). */
const DEFAULT_AGENT = 'Mozilla/5.0 (compatible; catalogue-link-import)';

/** Limits for the Test button's one read. */
const TEST_LIMITS = { maxBytes: 2_000_000, timeoutMs: 10_000, maxRedirects: 3 };

const words = (s: string) =>
  decodeURIComponent(s)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .split(/[-_+\s]+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The mock's page for a link: the same link always gives the same page. */
export function mockProductPage(url: string): string {
  const u = readableUrl(url);
  const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
  const name = words(last) || 'Sample Product';
  const img = (n: number) => new URL(`/images/${encodeURIComponent(last || 'sample')}-${n}.jpg`, u).toString();
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: `${name} — sample text from the page reader mock. Connect the page reader in Keys & connections to read the real page.`,
    brand: { '@type': 'Brand', name: 'Sample Brand' },
    color: 'Navy',
    material: '100% cotton',
    sku: `MOCK-${(last || 'sample').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24)}`,
    image: [img(1), img(2), img(3)],
  };
  return [
    '<!doctype html><html><head>',
    `<title>${escape(name)} | Sample Brand</title>`,
    `<meta property="og:title" content="${escape(name)}">`,
    `<meta property="og:image" content="${escape(img(1))}">`,
    '<meta name="description" content="Sample page from the page reader mock.">',
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    `</head><body><h1>${escape(name)}</h1></body></html>`,
  ].join('\n');
}

export const pageReader = defineAdapter<PageReader, Config>({
  kind: 'OTHER',
  provider: 'pageReader',
  modes: ['LIVE'],
  secrets: [],
  configSchema: pageReaderConfig,
  async create(ctx) {
    return directPageReader({ userAgent: ctx.config.userAgent ?? DEFAULT_AGENT });
  },
  async mock() {
    return {
      async read(url) {
        const u = readableUrl(url);
        const html = mockProductPage(u.toString());
        return { url, finalUrl: u.toString(), status: 200, contentType: 'text/html; charset=utf-8', html, bytes: new TextEncoder().encode(html).byteLength };
      },
    };
  },
  async test(api, ctx) {
    const page = await api.read(ctx.config.testUrl, TEST_LIMITS);
    const title = page.html.match(/<title[^>]*>([^<]{0,120})/i)?.[1]?.trim();
    return { ok: true, message: `read ${Math.round(page.bytes / 1024)} KB${title ? ` — "${title}"` : ''}` };
  },
});

export const pageReaderAdapters = [pageReader] as const;
