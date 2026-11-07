// Follow-up 505 (PR 425, 426; Blueprint B4.8) — downloading a file a customer sent on a channel, so the shop keeps its
// own copy (Meta keeps none: a WhatsApp media address expires, a Messenger attachment link is temporary).
//
// - `guardedDownload` is the one way a channel file is read: https only (plain http only for tests), no user name or
//   password in the address, the server itself, private networks, link-local (cloud metadata) and other reserved
//   addresses refused — the check runs on the address actually connected to (the page reader's guarded lookup), and on
//   every forwarding step, followed by hand. The file is cut off at `maxBytes` and the whole read at `timeoutMs`. A
//   key sent with the first request (`authorization`) never follows a forwarding to another host.
// - `ChannelFileFetcher` is the per-channel adapter: Messenger and the live chat read the offered address as it is;
//   WhatsApp first asks Meta's media address with the channel's token for the file's own address, then downloads it
//   with the same token, and sends the token only to Meta's own hosts. `mockChannelFileFetcher` gives a small sample
//   file with no network, which the copy runs on until the channel's key is typed in (A1.3).
import { isIP } from 'node:net';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { AdapterError } from '../define';
import { guardedLookup } from '../page-reader/direct';
import { isBlockedAddress, isBlockedHostName } from '../page-reader/types';

export type MediaDownloadErrorCode = 'BAD_URL' | 'BLOCKED_ADDRESS' | 'TOO_BIG' | 'TIMEOUT' | 'TOO_MANY_REDIRECTS' | 'HTTP_ERROR' | 'NETWORK' | 'BAD_ANSWER' | 'NO_KEY';

export class MediaDownloadError extends AdapterError {
  readonly code: MediaDownloadErrorCode;
  readonly detail: string | null;
  constructor(code: MediaDownloadErrorCode, message: string, detail: string | null = null) {
    super(`${code}: ${message}`);
    this.name = 'MediaDownloadError';
    this.code = code;
    this.detail = detail;
  }
  /** Worth trying again later (the channel or the network, not the file itself). */
  get retryable(): boolean {
    return this.code === 'TIMEOUT' || this.code === 'NETWORK' || (this.code === 'HTTP_ERROR' && (this.detail === '429' || (this.detail ?? '').startsWith('5')));
  }
}

export interface DownloadLimits {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
}

export interface DownloadOptions extends DownloadLimits {
  userAgent: string;
  headers?: Record<string, string>;
  /** Tests only: which addresses may be connected to (default: every public address). */
  allowAddress?: (ip: string) => boolean;
  /** Tests only: plain http is refused unless this is set. */
  allowHttp?: boolean;
}

export interface Downloaded {
  finalUrl: string;
  contentType: string;
  body: Uint8Array;
}

/** An https address with no user name or password (plain http only when allowed), else BAD_URL. */
export function downloadableUrl(raw: string, allowHttp = false): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new MediaDownloadError('BAD_URL', 'not a web address');
  }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) throw new MediaDownloadError('BAD_URL', 'only https addresses are downloaded');
  if (u.username || u.password) throw new MediaDownloadError('BAD_URL', 'an address with a user name or password is not read');
  if (!u.hostname) throw new MediaDownloadError('BAD_URL', 'the address has no host');
  u.hash = '';
  return u;
}

function once(u: URL, o: DownloadOptions, headers: Record<string, string>, lookup: ReturnType<typeof guardedLookup>, signal: AbortSignal): Promise<{ location: string | null; contentType: string; body: Uint8Array | null }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', lookup, signal, headers: { 'user-agent': o.userAgent, accept: '*/*', ...headers } }, (res: IncomingMessage) => {
      const status = res.statusCode ?? 0;
      const contentType = String(res.headers['content-type'] ?? '');
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ location: res.headers.location, contentType, body: null });
      }
      if (status >= 400 || status < 200) {
        res.resume();
        return reject(new MediaDownloadError('HTTP_ERROR', `the channel answered ${status}`, String(status)));
      }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > o.maxBytes) {
        res.destroy();
        return reject(new MediaDownloadError('TOO_BIG', 'the file is larger than allowed'));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > o.maxBytes) {
          res.destroy();
          reject(new MediaDownloadError('TOO_BIG', 'the file is larger than allowed'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve({ location: null, contentType, body: new Uint8Array(Buffer.concat(chunks)) }));
      res.on('error', () => reject(new MediaDownloadError('NETWORK', 'the file could not be read')));
    });
    req.on('error', (e) => {
      if (e instanceof MediaDownloadError) return reject(e);
      if ((e as { code?: string }).code === 'BLOCKED_ADDRESS' || (e as { name?: string }).name === 'PageReadError') return reject(new MediaDownloadError('BLOCKED_ADDRESS', 'this address is never read'));
      if ((e as { name?: string }).name === 'AbortError') return reject(new MediaDownloadError('TIMEOUT', 'the channel did not answer in time'));
      reject(new MediaDownloadError('NETWORK', 'the channel could not be reached', (e as { code?: string }).code ?? null));
    });
    req.end();
  });
}

/** Downloads one file behind the SSRF guard (see the header). */
export async function guardedDownload(url: string, o: DownloadOptions): Promise<Downloaded> {
  const allow = o.allowAddress ?? ((ip: string) => !isBlockedAddress(ip));
  const lookup = guardedLookup(allow);
  let u = downloadableUrl(url, o.allowHttp);
  const firstHost = u.host;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs);
  try {
    for (let step = 0; ; step++) {
      const host = u.hostname.replace(/^\[|\]$/g, '');
      // an address written as numbers is connected to without a lookup: it is checked here instead
      if (isIP(host) ? !allow(host) : isBlockedHostName(host)) throw new MediaDownloadError('BLOCKED_ADDRESS', 'this address is never read');
      // a key goes only to the host it was given for, never along a forwarding to another one
      const headers = Object.fromEntries(Object.entries(o.headers ?? {}).filter(([k]) => u.host === firstHost || k.toLowerCase() !== 'authorization'));
      const r = await once(u, o, headers, lookup, controller.signal);
      if (r.location !== null) {
        if (step >= o.maxRedirects) throw new MediaDownloadError('TOO_MANY_REDIRECTS', 'the address forwards too many times');
        u = downloadableUrl(new URL(r.location, u).toString(), o.allowHttp);
        continue;
      }
      return { finalUrl: u.toString(), contentType: r.contentType.split(';')[0]!.trim().toLowerCase(), body: r.body ?? new Uint8Array() };
    }
  } catch (e) {
    if (controller.signal.aborted && !(e instanceof MediaDownloadError && e.code !== 'NETWORK')) throw new MediaDownloadError('TIMEOUT', 'the channel did not answer in time');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---- per channel -------------------------------------------------------------------------------------------------

export interface ChannelFile {
  /** Where the channel offered the file (a Messenger attachment link; for WhatsApp Meta's media address). */
  sourceUrl: string;
  contentType?: string | null;
}

export interface ChannelFileFetcher {
  fetch(file: ChannelFile, limits: DownloadLimits): Promise<{ body: Uint8Array; contentType: string }>;
}

type Download = (url: string, o: DownloadOptions) => Promise<Downloaded>;

/** Messenger and the live chat: the offered address is read as it is (no key). */
export function publicLinkFetcher(opts: { userAgent: string; download?: Download; allowAddress?: (ip: string) => boolean; allowHttp?: boolean }): ChannelFileFetcher {
  const download = opts.download ?? guardedDownload;
  return {
    async fetch(file, limits) {
      const r = await download(file.sourceUrl, { ...limits, userAgent: opts.userAgent, allowAddress: opts.allowAddress, allowHttp: opts.allowHttp });
      return { body: r.body, contentType: r.contentType || file.contentType || 'application/octet-stream' };
    },
  };
}

/** Meta's own hosts: the only ones a WhatsApp token is ever sent to (the Graph address and its file servers). */
export const META_MEDIA_HOST_SUFFIXES = ['facebook.com', 'fbsbx.com', 'fbcdn.net', 'whatsapp.net'] as const;
const metaHost = (host: string, extra: readonly string[]) => [...META_MEDIA_HOST_SUFFIXES, ...extra].some((s) => host === s || host.endsWith(`.${s}`));

/**
 * WhatsApp Cloud: the inbound file's address is Meta's media address (whatsappMediaUrl), which answers, with the
 * channel's token, `{ url, mime_type, file_size }`; the file is then read from that url with the same token.
 */
export function whatsappFileFetcher(opts: { token: string; userAgent: string; download?: Download; allowAddress?: (ip: string) => boolean; allowHttp?: boolean; extraHosts?: readonly string[] }): ChannelFileFetcher {
  const download = opts.download ?? guardedDownload;
  const extra = opts.extraHosts ?? [];
  const auth = { authorization: `Bearer ${opts.token}` };
  const metaOnly = (raw: string) => {
    const u = downloadableUrl(raw, opts.allowHttp);
    if (!metaHost(u.hostname, extra)) throw new MediaDownloadError('BLOCKED_ADDRESS', 'a WhatsApp file is read only from Meta');
    return u.toString();
  };
  return {
    async fetch(file, limits) {
      if (!opts.token) throw new MediaDownloadError('NO_KEY', 'the WhatsApp token is not typed in yet');
      const meta = await download(metaOnly(file.sourceUrl), { maxBytes: 64_000, timeoutMs: limits.timeoutMs, maxRedirects: 0, userAgent: opts.userAgent, headers: auth, allowAddress: opts.allowAddress, allowHttp: opts.allowHttp });
      let info: { url?: unknown; mime_type?: unknown };
      try {
        info = JSON.parse(new TextDecoder().decode(meta.body)) as typeof info;
      } catch {
        throw new MediaDownloadError('BAD_ANSWER', 'Meta did not say where the file is');
      }
      if (typeof info.url !== 'string') throw new MediaDownloadError('BAD_ANSWER', 'Meta did not say where the file is');
      const r = await download(metaOnly(info.url), { ...limits, userAgent: opts.userAgent, headers: auth, allowAddress: opts.allowAddress, allowHttp: opts.allowHttp });
      return { body: r.body, contentType: r.contentType || (typeof info.mime_type === 'string' ? info.mime_type : '') || file.contentType || 'application/octet-stream' };
    },
  };
}

/** A 1×1 PNG: the sample file the mock gives for any channel file (no network). */
export const MOCK_CHANNEL_FILE = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));

/** The copy runs on this until the channel's key is typed in: every file is the same small sample picture. */
export function mockChannelFileFetcher(): ChannelFileFetcher {
  return {
    async fetch(file, limits) {
      downloadableUrl(file.sourceUrl, true);
      if (MOCK_CHANNEL_FILE.byteLength > limits.maxBytes) throw new MediaDownloadError('TOO_BIG', 'the file is larger than allowed');
      return { body: MOCK_CHANNEL_FILE, contentType: 'image/png' };
    },
  };
}
