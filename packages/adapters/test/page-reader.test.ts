// PR 33 — the page reader: the SSRF guard (the server itself, private networks and cloud metadata are never read),
// the limits (size, time, forwarding steps), web pages only, and the mock's sample page (deterministic, never a price).
// The live reader runs against a local test server; the guard is loosened for that server only.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createConnections,
  directPageReader,
  isBlockedAddress,
  isBlockedHostName,
  mockProductPage,
  pageReader,
  pageReaderAdapters,
  PageReadError,
  readableUrl,
  type PageReader,
} from '../src';

const LIMITS = { maxBytes: 64 * 1024, timeoutMs: 2000, maxRedirects: 2 };

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof PageReadError ? e.code : String(e);
  }
}

describe('addresses the reader never reads', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '64:ff9b::a9fe:a9fe',
    'not-an-ip',
  ])('%s is blocked', (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8'])('%s is public', (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it('blocks names of this machine or its network', () => {
    for (const h of ['localhost', 'app.localhost', 'printer.local', 'metadata.google.internal', 'intranet', '127.0.0.1', '[::1]']) expect(isBlockedHostName(h), h).toBe(true);
    expect(isBlockedHostName('shop.example.com')).toBe(false);
  });

  it('reads only plain http(s) addresses', () => {
    expect(readableUrl('https://shop.example.com/p/polo#reviews').toString()).toBe('https://shop.example.com/p/polo');
    for (const bad of ['ftp://shop.example.com/x', 'file:///etc/passwd', 'https://user:pw@shop.example.com/', 'javascript:alert(1)', 'not a link']) {
      expect(() => readableUrl(bad), bad).toThrow(PageReadError);
    }
  });
});

describe('the mock page reader', () => {
  it('builds the same sample page for the same link, with a name from the address and no price', async () => {
    const a = mockProductPage('https://shop.example.com/products/navy-pique-polo-123');
    expect(a).toBe(mockProductPage('https://shop.example.com/products/navy-pique-polo-123'));
    expect(a).toContain('"name":"Navy Pique Polo"');
    expect(a).not.toMatch(/price|offers/i);
  });

  it('is what the connection layer hands out until the reader is switched on', async () => {
    const noRows = {
      integration: { findMany: async () => [], findUniqueOrThrow: async () => ({}), update: async () => ({}) },
      integrationTestRun: { create: async () => ({}) },
      auditLog: { create: async () => ({}) },
      $transaction: async () => [],
    } as unknown as Parameters<typeof createConnections>[0]['db'];
    const c = createConnections({ db: noRows, vault: { get: async () => null }, adapters: pageReaderAdapters, secretCacheMs: 1000, testTimeoutMs: 1000 });
    const r = await c.use<PageReader>('OTHER', { provider: 'pageReader' });
    expect(r.mode).toBe('MOCK');
    const page = await r.api.read('https://shop.example.com/p/black-oxford-shirt', LIMITS);
    expect(page.html).toContain('Black Oxford Shirt');
    expect(await codeOf(r.api.read('ftp://shop.example.com/x', LIMITS))).toBe('BAD_URL');
  });
});

describe('the live page reader (local test server)', () => {
  let server: Server;
  let base = '';
  const big = '<html><body>' + 'x'.repeat(LIMITS.maxBytes + 10) + '</body></html>';
  beforeAll(async () => {
    server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x');
      if (u.pathname === '/page') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<html><title>Polo</title>পোলো</html>');
      if (u.pathname === '/gz') return res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(gzipSync('<html><title>Zipped</title></html>'));
      if (u.pathname === '/hop') return res.writeHead(301, { location: '/page' }).end();
      if (u.pathname === '/loop') return res.writeHead(302, { location: '/loop' }).end();
      if (u.pathname === '/to-private') return res.writeHead(302, { location: 'http://10.0.0.1/admin' }).end();
      if (u.pathname === '/big') return res.writeHead(200, { 'content-type': 'text/html' }).end(big);
      if (u.pathname === '/big-zipped') return res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(gzipSync(big));
      if (u.pathname === '/image') return res.writeHead(200, { 'content-type': 'image/jpeg' }).end('jpeg');
      if (u.pathname === '/slow') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end('late'), 1500);
      res.writeHead(404, { 'content-type': 'text/html' }).end('none');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // Only the test server's own address is allowed; everything else keeps the normal guard.
  const reader = () => directPageReader({ userAgent: 'test', allowAddress: (ip) => ip === '127.0.0.1' || !isBlockedAddress(ip) });

  it('reads a page, decodes it, follows forwarding and unpacks gzip', async () => {
    const p = await reader().read(`${base}/page`, LIMITS);
    expect(p.html).toContain('পোলো');
    expect(p.status).toBe(200);
    const hop = await reader().read(`${base}/hop`, LIMITS);
    expect(hop.finalUrl).toBe(`${base}/page`);
    expect((await reader().read(`${base}/gz`, LIMITS)).html).toContain('Zipped');
  });

  it('stops at the limits and refuses what is not a web page', async () => {
    expect(await codeOf(reader().read(`${base}/loop`, LIMITS))).toBe('TOO_MANY_REDIRECTS');
    expect(await codeOf(reader().read(`${base}/big`, LIMITS))).toBe('TOO_BIG');
    expect(await codeOf(reader().read(`${base}/big-zipped`, LIMITS))).toBe('TOO_BIG');
    expect(await codeOf(reader().read(`${base}/image`, LIMITS))).toBe('NOT_HTML');
    expect(await codeOf(reader().read(`${base}/missing`, LIMITS))).toBe('HTTP_ERROR');
    expect(await codeOf(reader().read(`${base}/slow`, { ...LIMITS, timeoutMs: 300 }))).toBe('TIMEOUT');
  });

  it('never reads the server itself or a private network, also not through forwarding', async () => {
    const strict = directPageReader({ userAgent: 'test' });
    expect(await codeOf(strict.read(`${base}/page`, LIMITS))).toBe('BLOCKED_ADDRESS');
    for (const u of ['http://localhost/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://10.0.0.1/']) expect(await codeOf(strict.read(u, LIMITS)), u).toBe('BLOCKED_ADDRESS');
    expect(await codeOf(reader().read(`${base}/to-private`, LIMITS))).toBe('BLOCKED_ADDRESS');
  });

  it('the Test button reads the page it was given', async () => {
    const api = directPageReader({ userAgent: 'test', allowAddress: () => true });
    const out = await pageReader.test(api, { mode: 'LIVE', config: { testUrl: `${base}/page` }, storeId: null, secret: async () => null });
    expect(out.ok).toBe(true);
    expect(out.message).toContain('Polo');
  });
});
