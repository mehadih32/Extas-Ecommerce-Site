// S21 · PR 423 (CN-015) — the customer problem recorder's rules, pure: what kinds of trouble the shop's pages report,
// which step of the journey a page is, how a page address and a message are made anonymous (no digits runs, no
// e-mail, no query, the changing part of an address masked), which reports share a cause (the fingerprint), and how
// urgent a problem is. The browser half is components/shop/ProblemProbe.tsx; the server half lib/problems/ingest.ts.
// Nothing here can carry a name, phone, address or payment detail.
import { createHash } from 'node:crypto';
import { BN_PREFIX } from '../shop/lang';
import { ROUTES } from '../shop/routes';

export const PROBLEM_KINDS = ['script_error', 'request_failed', 'slow_request', 'page_failed', 'error_screen', 'form_stuck', 'rage_click', 'broken_image', 'slow_load'] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

export const JOURNEY_STEPS = ['landing', 'browse', 'product', 'bag', 'checkout', 'tracking', 'account', 'other'] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

export const NETWORKS = ['slow-2g', '2g', '3g', '4g'] as const;
export type Network = (typeof NETWORKS)[number];

export const SEVERITIES = ['URGENT', 'IMPORTANT', 'CAN_WAIT'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Something stopped working for the visitor (not only slow or annoying). */
export const ERROR_KINDS: readonly ProblemKind[] = ['script_error', 'request_failed', 'page_failed', 'error_screen', 'form_stuck'];
/** The steps where a problem costs an order at once. */
export const MONEY_STEPS: readonly JourneyStep[] = ['bag', 'checkout'];

/** The longest message kept (after scrubbing). */
export const DETAIL_MAX = 200;
const PATH_MAX = 160;

const trimSlash = (p: string) => p.replace(/\/+$/, '');

/** The address parts after which one segment changes from page to page (a product, an order, a pay link …). */
function maskedPrefixes(productPrefix: string): string[] {
  return [
    trimSlash(productPrefix),
    trimSlash(ROUTES.category('')),
    trimSlash(ROUTES.combo('')),
    trimSlash(ROUTES.buildSet),
    trimSlash(ROUTES.order('')),
    trimSlash(ROUTES.checkoutPay('')),
    trimSlash(ROUTES.thanks('')),
    trimSlash(ROUTES.payLink('')),
  ].filter(Boolean);
}

/** A segment that is clearly an id: a long number, a uuid-like or hex token, or a very long word. */
const ID_SEGMENT = /^(?:\d{3,}|[0-9a-f]{8}-[0-9a-f-]{8,}|[0-9a-f]{16,}|.{41,})$/i;

/**
 * A page address as a pattern: no origin, query or fragment, no language prefix, and the changing segment after each
 * known prefix (and any id-like segment) masked — `/bn/p/blue-polo?x=1` → `/p/:x`.
 */
export function pathPattern(raw: string, productPrefix: string): string {
  let p = raw.trim();
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    p = '/';
  }
  p = p.replace(/[?#].*$/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  if (p === BN_PREFIX || p.startsWith(`${BN_PREFIX}/`)) p = p.slice(BN_PREFIX.length) || '/';
  const segs = p.split('/').filter(Boolean);
  const out: string[] = [];
  const prefixes = maskedPrefixes(productPrefix).map((x) => x.split('/').filter(Boolean));
  for (let i = 0; i < segs.length; i += 1) {
    const before = out.join('/');
    const masks = prefixes.some((pre) => pre.join('/') === before && pre.length === i);
    out.push(masks || ID_SEGMENT.test(segs[i]!) ? ':x' : segs[i]!.toLowerCase().slice(0, 40));
  }
  // `/combos/<rule>` is a rule's page, except the set builder itself
  const combos = trimSlash(ROUTES.combos).slice(1);
  if (out[0] === combos && out[1] && out[1] !== ROUTES.buildSet.split('/').pop()) out[1] = ':x';
  return `/${out.join('/')}`.slice(0, PATH_MAX);
}

/** Which step of the customer journey a page pattern is. */
export function stepOf(pattern: string, productPrefix: string): JourneyStep {
  const under = (prefix: string) => {
    const b = trimSlash(prefix);
    return pattern === b || pattern.startsWith(`${b}/`);
  };
  if (pattern === ROUTES.home) return 'landing';
  if (under(ROUTES.bag)) return 'bag';
  if (under(ROUTES.checkout) || under(ROUTES.payLink(''))) return 'checkout';
  if (under(ROUTES.orders)) return 'tracking';
  if (under(ROUTES.account)) return 'account';
  if (under(productPrefix) || under(ROUTES.combo(''))) return 'product';
  if ([ROUTES.category(''), ROUTES.search, ROUTES.combos, ROUTES.help(''), ROUTES.journal].some(under)) return 'browse';
  return 'other';
}

/**
 * A message with nothing personal left: addresses lose their query and fragment, e-mail addresses and runs of digits
 * (a phone, an order or card number) become `#`, white space is folded, and it is cut short.
 */
export function scrub(raw: string): string {
  return raw
    .replace(/https?:\/\/[^\s'"<>]+/gi, (u) => u.replace(/[?#].*$/, ''))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '#')
    .replace(/\+?\d[\d\s().-]{3,}\d/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DETAIL_MAX);
}

/** The same cause: the kind, the page pattern and the message with its numbers taken out. */
export function fingerprintOf(kind: ProblemKind, pattern: string, detail: string): string {
  const shape = detail.replace(/\d+/g, '#').toLowerCase();
  return createHash('sha256').update(`${kind}\n${pattern}\n${shape}`).digest('hex');
}

/** The device family from the browser's own description. */
export function deviceOf(ua: string): 'phone' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'phone';
  return 'desktop';
}

/** The browser family (never its version or anything finer). */
export function browserOf(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) return 'edge';
  if (/OPR\/|Opera/i.test(ua)) return 'opera';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

const RANK: Record<Severity, number> = { URGENT: 0, IMPORTANT: 1, CAN_WAIT: 2 };
/** The more urgent of two. */
export const worse = (a: Severity, b: Severity): Severity => (RANK[a] <= RANK[b] ? a : b);

/**
 * How urgent a problem is: something that stopped working on the bag or checkout, or that hit `urgentVisitors`
 * visitors in a day, is Urgent; anything else that stopped working, a broken picture, or a slow or annoying problem
 * that hit that many, is Important; slow and annoying ones Can wait.
 */
export function judge(kind: ProblemKind, step: JourneyStep, visitorsToday: number, urgentVisitors: number): Severity {
  const broke = ERROR_KINDS.includes(kind);
  const many = visitorsToday >= urgentVisitors;
  if (broke && (MONEY_STEPS.includes(step) || many)) return 'URGENT';
  if (broke || kind === 'broken_image' || many) return 'IMPORTANT';
  return 'CAN_WAIT';
}
