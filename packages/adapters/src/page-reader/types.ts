// The page reader (PR 33): reads one outside web page (a supplier's or brand's product page) for the catalogue's
// "import from a link". It returns the page's HTML and nothing else; what a page says is worked out by the catalogue
// (packages/catalogue/src/link-import.ts), never here.
import { isIP } from 'node:net';
import { AdapterError } from '../define';

export interface PageLimits {
  /** A page larger than this is refused (bytes, after decompression). */
  maxBytes: number;
  /** The whole read, every forwarding step included (ms). */
  timeoutMs: number;
  /** Forwarding steps (3xx) followed before the read stops. */
  maxRedirects: number;
}

export interface PageRead {
  /** The address asked for. */
  url: string;
  /** The address the page was finally read from (after forwarding). */
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  bytes: number;
}

export interface PageReader {
  read(url: string, limits: PageLimits): Promise<PageRead>;
}

export type PageReadErrorCode =
  /** Not an http(s) address, or it carries a user name or password. */
  | 'BAD_URL'
  /** The address is the server itself, a private network or another address that is never read (SSRF guard). */
  | 'BLOCKED_ADDRESS'
  | 'TOO_BIG'
  | 'TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  /** The answer is not a web page (an image, a PDF …). */
  | 'NOT_HTML'
  /** The site answered with an error status (details: the status). */
  | 'HTTP_ERROR'
  /** The site could not be reached (name not found, connection refused …). */
  | 'NETWORK';

export class PageReadError extends AdapterError {
  readonly code: PageReadErrorCode;
  readonly detail: string | null;
  constructor(code: PageReadErrorCode, message: string, detail: string | null = null) {
    super(`${code}: ${message}`);
    this.name = 'PageReadError';
    this.code = code;
    this.detail = detail;
  }
}

export const isPageReadError = (e: unknown): e is PageReadError => e instanceof PageReadError;

/** An http(s) address with no user name or password, else BAD_URL. */
export function readableUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new PageReadError('BAD_URL', 'not a web address');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new PageReadError('BAD_URL', 'only http and https addresses are read');
  if (u.username || u.password) throw new PageReadError('BAD_URL', 'an address with a user name or password is not read');
  if (!u.hostname) throw new PageReadError('BAD_URL', 'the address has no host');
  u.hash = '';
  return u;
}

// --- addresses that are never read ---------------------------------------------------------------------------

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // the server itself
  ['169.254.0.0', 16], // link-local (cloud metadata lives here)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

const v4ToInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;

function blockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

/** The 8 groups of an IPv6 address as numbers (handles `::` and a trailing IPv4 part). */
function v6Groups(ip: string): number[] {
  let s = ip.toLowerCase().split('%')[0]!;
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]!);
    s = s.slice(0, -tail[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, rest] = s.includes('::') ? s.split('::') : [s, null];
  const a = head ? head.split(':').filter(Boolean) : [];
  const b = rest ? rest.split(':').filter(Boolean) : [];
  const fill = rest === null ? [] : Array(8 - a.length - b.length).fill('0');
  return [...a, ...fill, ...b].map((g) => Number.parseInt(g, 16));
}

function blockedV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (g.length !== 8 || g.some((x) => !Number.isFinite(x))) return true;
  const zeroUntil = (i: number) => g.slice(0, i).every((x) => x === 0);
  if (zeroUntil(8)) return true; // ::
  if (zeroUntil(7) && g[7] === 1) return true; // ::1
  const embedded = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
  if (zeroUntil(5) && g[5] === 0xffff) return blockedV4(embedded(g[6]!, g[7]!)); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return blockedV4(embedded(g[6]!, g[7]!)); // NAT64
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

/** True for an address the page reader never connects to: the server, private networks, link-local, reserved. */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return blockedV4(ip);
  if (v === 6) return blockedV6(ip);
  return true;
}

/** Host names that always mean this machine or its private network, refused before any lookup. */
export function isBlockedHostName(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(h)) return isBlockedAddress(h);
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.');
}
