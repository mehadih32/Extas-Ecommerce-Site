// Follow-up 505 (PR 425, 426; B4.8): a channel file is downloaded only behind the SSRF guard — https only, never the
// server itself or a private network (also not through forwarding, also not by a name), cut off at the size and time
// limits; a key never follows a forwarding to another host; WhatsApp's token goes only to Meta's hosts. Local test
// servers stand in for the channels (plain http and 127.0.0.1 are allowed for the test only).
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardedDownload, isBlockedAddress, MediaDownloadError, mockChannelFileFetcher, publicLinkFetcher, whatsappFileFetcher, type DownloadOptions } from '../src';

const LIMITS = { maxBytes: 1_000, timeoutMs: 2_000, maxRedirects: 2 };
const local: Pick<DownloadOptions, 'allowAddress' | 'allowHttp' | 'userAgent'> = { allowAddress: (ip) => ip === '127.0.0.1' || ip === '127.0.0.2' || !isBlockedAddress(ip), allowHttp: true, userAgent: 'test' };

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof MediaDownloadError ? e.code : String(e);
  }
}

describe('media download behind the SSRF guard (follow-up 505)', () => {
  let server: Server;
  let base = '';
  const seen: { path: string; headers: IncomingHttpHeaders }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({ path: req.url ?? '', headers: req.headers });
      const at = req.url ?? '';
      if (at === '/photo.jpg') return res.writeHead(200, { 'content-type': 'image/jpeg; charset=binary' }).end(Buffer.from('jpeg-bytes'));
      if (at === '/big') return res.writeHead(200, { 'content-type': 'video/mp4' }).end(Buffer.alloc(5_000));
      if (at === '/to-private') return res.writeHead(302, { location: 'http://10.1.2.3/x' }).end();
      if (at === '/to-metadata') return res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }).end();
      if (at === '/to-photo') return res.writeHead(301, { location: '/photo.jpg' }).end();
      // the same server under another address: another host for the key's rule
      if (at === '/to-other-host') return res.writeHead(302, { location: `http://127.0.0.2:${(server.address() as AddressInfo).port}/photo.jpg` }).end();
      if (at === '/loop') return res.writeHead(302, { location: '/loop' }).end();
      if (at === '/slow') return void setTimeout(() => res.writeHead(200).end('late'), 1_500);
      if (at === '/gone') return res.writeHead(404).end();
      if (at === '/busy') return res.writeHead(503).end();
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '0.0.0.0', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('downloads a file and says its type', async () => {
    const r = await guardedDownload(`${base}/photo.jpg`, { ...LIMITS, ...local });
    expect([r.contentType, new TextDecoder().decode(r.body)]).toEqual(['image/jpeg', 'jpeg-bytes']);
    expect((await guardedDownload(`${base}/to-photo`, { ...LIMITS, ...local })).finalUrl).toBe(`${base}/photo.jpg`);
  });

  it('refuses plain http, a user name in the address, the server itself and private or metadata addresses — also through forwarding', async () => {
    expect(await code(guardedDownload(`${base}/photo.jpg`, { ...LIMITS, userAgent: 'test' }))).toBe('BAD_URL');
    expect(await code(guardedDownload('https://user:pw@files.example.com/x.jpg', { ...LIMITS, userAgent: 'test' }))).toBe('BAD_URL');
    expect(await code(guardedDownload('ftp://files.example.com/x.jpg', { ...LIMITS, userAgent: 'test' }))).toBe('BAD_URL');
    for (const u of ['https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://localhost/x', 'https://192.168.1.10/x'])
      expect(await code(guardedDownload(u, { ...LIMITS, userAgent: 'test' }))).toBe('BLOCKED_ADDRESS');
    // the test server itself is reached only because the test allows 127.0.0.1; its forwarding to a private address is not
    expect(await code(guardedDownload(`${base}/to-private`, { ...LIMITS, ...local }))).toBe('BLOCKED_ADDRESS');
    expect(await code(guardedDownload(`${base}/to-metadata`, { ...LIMITS, ...local }))).toBe('BLOCKED_ADDRESS');
  });

  it('stops at the size, the time and the forwarding limits; says what the channel answered', async () => {
    expect(await code(guardedDownload(`${base}/big`, { ...LIMITS, ...local }))).toBe('TOO_BIG');
    expect(await code(guardedDownload(`${base}/slow`, { ...LIMITS, timeoutMs: 300, ...local }))).toBe('TIMEOUT');
    expect(await code(guardedDownload(`${base}/loop`, { ...LIMITS, ...local }))).toBe('TOO_MANY_REDIRECTS');
    const gone = await guardedDownload(`${base}/gone`, { ...LIMITS, ...local }).catch((e: MediaDownloadError) => e);
    expect([gone instanceof MediaDownloadError && gone.code, (gone as MediaDownloadError).retryable]).toEqual(['HTTP_ERROR', false]);
    const busy = await guardedDownload(`${base}/busy`, { ...LIMITS, ...local }).catch((e: MediaDownloadError) => e);
    expect((busy as MediaDownloadError).retryable).toBe(true);
  });

  it('a key sent to the first host never follows a forwarding to another host', async () => {
    seen.length = 0;
    expect((await guardedDownload(`${base}/to-other-host`, { ...LIMITS, ...local, headers: { authorization: 'Bearer sample' } })).finalUrl).toContain('127.0.0.2');
    expect(seen.map((s) => s.headers.authorization)).toEqual(['Bearer sample', undefined]);
    seen.length = 0;
    await guardedDownload(`${base}/to-photo`, { ...LIMITS, ...local, headers: { authorization: 'Bearer sample' } });
    expect(seen.map((s) => s.headers.authorization)).toEqual(['Bearer sample', 'Bearer sample']);
  });

  it('Messenger reads the offered link; WhatsApp asks Meta for the file with the token and sends the token only to Meta', async () => {
    expect(new TextDecoder().decode((await publicLinkFetcher(local).fetch({ sourceUrl: `${base}/photo.jpg` }, LIMITS)).body)).toBe('jpeg-bytes');
    const calls: { url: string; auth: string | undefined }[] = [];
    const fake = async (url: string, o: DownloadOptions) => {
      calls.push({ url, auth: o.headers?.authorization });
      if (url.includes('/v21.0/')) return { finalUrl: url, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', mime_type: 'image/jpeg' })) };
      return { finalUrl: url, contentType: '', body: new TextEncoder().encode('wa-bytes') };
    };
    const wa = whatsappFileFetcher({ token: 'sample-token', userAgent: 'test', download: fake });
    const got = await wa.fetch({ sourceUrl: 'https://graph.facebook.com/v21.0/123456' }, LIMITS);
    expect([new TextDecoder().decode(got.body), got.contentType]).toEqual(['wa-bytes', 'image/jpeg']);
    expect(calls).toEqual([
      { url: 'https://graph.facebook.com/v21.0/123456', auth: 'Bearer sample-token' },
      { url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', auth: 'Bearer sample-token' },
    ]);
    calls.length = 0;
    expect(await code(wa.fetch({ sourceUrl: 'https://files.example.com/123' }, LIMITS))).toBe('BLOCKED_ADDRESS');
    expect(calls).toEqual([]);
    expect(await code(whatsappFileFetcher({ token: '', userAgent: 'test', download: fake }).fetch({ sourceUrl: 'https://graph.facebook.com/v21.0/1' }, LIMITS))).toBe('NO_KEY');
  });

  it('the mock gives a small sample picture with no network', async () => {
    const r = await mockChannelFileFetcher().fetch({ sourceUrl: 'https://files.example.com/x.jpg' }, LIMITS);
    expect([r.contentType, r.body.byteLength > 0]).toEqual(['image/png', true]);
  });
});
