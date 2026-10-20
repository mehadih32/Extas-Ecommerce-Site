// The live page reader: the server reads the page itself, once, like a browser opening a link — no key needed. Every
// connection goes through a lookup that refuses the server itself, private networks and cloud metadata addresses
// (the check runs on the address actually connected to, so a name that resolves to a private address is refused
// too), forwarding is followed by hand and checked again at every step, the page is cut off at `maxBytes` and the
// whole read at `timeoutMs`.
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';
import { isBlockedAddress, isBlockedHostName, PageReadError, readableUrl, type PageLimits, type PageReader } from './types';

export interface DirectReaderOptions {
  /** Sent as the User-Agent header. */
  userAgent: string;
  /** Tests only: which addresses may be connected to (default: every public address). */
  allowAddress?: (ip: string) => boolean;
}

const HTML = /^(text\/html|application\/xhtml\+xml)\b/i;

function guardedLookup(allow: (ip: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 4);
      const list = addresses as unknown as LookupAddress[];
      const bad = list.find((a) => !allow(a.address));
      if (bad || !list.length) return callback(new PageReadError('BLOCKED_ADDRESS', 'this address is never read'), '', 4);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

function decoded(res: IncomingMessage): Readable {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(createGunzip());
  if (enc === 'deflate') return res.pipe(createInflate());
  if (enc === 'br') return res.pipe(createBrotliDecompress());
  return res;
}

function charsetOf(contentType: string): string {
  const m = contentType.match(/charset\s*=\s*"?([^";\s]+)/i);
  return m?.[1]?.toLowerCase() ?? 'utf-8';
}

function textOf(bytes: Uint8Array, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function directPageReader(opts: DirectReaderOptions): PageReader {
  const allow = opts.allowAddress ?? ((ip: string) => !isBlockedAddress(ip));
  const lookup = guardedLookup(allow);

  function once(u: URL, limits: PageLimits, signal: AbortSignal): Promise<{ status: number; location: string | null; contentType: string; body: Uint8Array | null }> {
    return new Promise((resolve, reject) => {
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        u,
        {
          method: 'GET',
          lookup,
          signal,
          headers: { 'user-agent': opts.userAgent, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', 'accept-encoding': 'gzip, deflate, br' },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const contentType = String(res.headers['content-type'] ?? '');
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            return resolve({ status, location: res.headers.location, contentType, body: null });
          }
          if (status >= 400) {
            res.resume();
            return reject(new PageReadError('HTTP_ERROR', `the site answered ${status}`, String(status)));
          }
          if (!HTML.test(contentType)) {
            res.resume();
            return reject(new PageReadError('NOT_HTML', 'the address is not a web page', contentType.split(';')[0] || null));
          }
          const declared = Number(res.headers['content-length']);
          if (Number.isFinite(declared) && declared > limits.maxBytes && !res.headers['content-encoding']) {
            res.destroy();
            return reject(new PageReadError('TOO_BIG', 'the page is larger than allowed'));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          const stream = decoded(res);
          stream.on('data', (c: Buffer) => {
            size += c.length;
            if (size > limits.maxBytes) {
              res.destroy();
              stream.destroy();
              reject(new PageReadError('TOO_BIG', 'the page is larger than allowed'));
              return;
            }
            chunks.push(c);
          });
          stream.on('end', () => resolve({ status, location: null, contentType, body: new Uint8Array(Buffer.concat(chunks)) }));
          stream.on('error', (e) => reject(e instanceof PageReadError ? e : new PageReadError('NETWORK', 'the page could not be read')));
        },
      );
      req.on('error', (e) => {
        if (e instanceof PageReadError) return reject(e);
        if ((e as { name?: string }).name === 'AbortError') return reject(new PageReadError('TIMEOUT', 'the site did not answer in time'));
        reject(new PageReadError('NETWORK', 'the site could not be reached', (e as { code?: string }).code ?? null));
      });
      req.end();
    });
  }

  return {
    async read(url, limits) {
      let u = readableUrl(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
      try {
        for (let step = 0; ; step++) {
          const host = u.hostname.replace(/^\[|\]$/g, '');
          // An address written as numbers is connected to without a lookup: it is checked here instead.
          if (isIP(host) ? !allow(host) : isBlockedHostName(host)) throw new PageReadError('BLOCKED_ADDRESS', 'this address is never read');
          const r = await once(u, limits, controller.signal);
          if (r.location !== null) {
            if (step >= limits.maxRedirects) throw new PageReadError('TOO_MANY_REDIRECTS', 'the link forwards too many times');
            u = readableUrl(new URL(r.location, u).toString());
            continue;
          }
          const body = r.body ?? new Uint8Array();
          return { url, finalUrl: u.toString(), status: r.status, contentType: r.contentType, html: textOf(body, r.contentType), bytes: body.byteLength };
        }
      } catch (e) {
        if (controller.signal.aborted && !(e instanceof PageReadError && e.code !== 'NETWORK')) throw new PageReadError('TIMEOUT', 'the site did not answer in time');
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
