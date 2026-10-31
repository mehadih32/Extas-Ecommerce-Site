// S18 · PR 378 (Blueprint B6.1) — the site's own security headers, the cross-site check in front of every API call and
// the per-address request limits, reviewed end to end (registry version 73). Labels: messages/web-security.<lang>.json
// (group `security`; the admin's place is Settings → Team & roles → Sign-in & security, SET-04d).
//
// - `security.csp.mode`: the Content-Security-Policy the app sends on every page — `report` (the default: the browser
//   only reports what the policy would have stopped, nothing is blocked), `enforce` (the browser blocks it) or `off`.
//   Caddy's own short policy (no plugins, no <base> tag, no framing by another site) is always on underneath.
// - `security.csp.extraSources`: outside addresses a page may load from, per kind (scripts, styles, images, fonts,
//   connections, frames, media, form posts). Empty by default: the shop loads everything from itself (media from
//   `media.publicBaseUrl` is allowed by itself). The owner adds, for example, a pixel's address when he turns one on.
// - `security.rateLimit.mode`: the per-address request limits — `observe` (the default: an address over its limit is
//   only logged, never refused, because many phones share one mobile-network address in Bangladesh), `enforce` (it
//   gets "try again in a minute") or `off`.
// - `security.rateLimit.perMinute`: requests a minute one address may send, per kind (sign-in and codes, checkout and
//   pay links, other shop changes, the browser's problem reports, webhooks). Generous by default.
// - `security.rateLimit.maxTracked`: how many addresses each server copy keeps counting at once (memory bound).
//
// None of these moves money, changes a price or blocks anyone for good: a refused request is told to try again.
import { z } from 'zod';
import { setting } from './define';

const V = 73;

const base = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'security', version: V } as const;

export const CSP_MODES = ['off', 'report', 'enforce'] as const;
export type CspMode = (typeof CSP_MODES)[number];

export const RATE_LIMIT_MODES = ['off', 'observe', 'enforce'] as const;
export type RateLimitMode = (typeof RATE_LIMIT_MODES)[number];

/** The kinds of outside address a page may use (one Content-Security-Policy directive each). */
export const CSP_SOURCE_KINDS = ['script', 'style', 'img', 'font', 'connect', 'frame', 'media', 'form'] as const;
export type CspSourceKind = (typeof CSP_SOURCE_KINDS)[number];

/**
 * One outside source: an https origin, optionally with a leading `*.` wildcard and a path (`https://*.example.com`,
 * `https://cdn.example.com/x/`). Never a keyword ('unsafe-eval', *), never http, never a quote or a space or a
 * semicolon (which would let a value add a directive of its own).
 */
export const cspSourceSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^https:\/\/(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?::\d{1,5})?(?:\/[A-Za-z0-9._~\-/]*)?$/, {
    message: 'an https address such as https://cdn.example.com',
  });

const sources = z.array(cspSourceSchema).max(20);
export const cspExtraSourcesSchema = z
  .object({ script: sources, style: sources, img: sources, font: sources, connect: sources, frame: sources, media: sources, form: sources })
  .strict();
export type CspExtraSources = z.output<typeof cspExtraSourcesSchema>;

/** The request kinds the limits count (lib/security/edge-gate.ts decides which address is which). */
export const RATE_BUCKETS = ['signIn', 'checkout', 'shopWrite', 'report', 'webhook'] as const;
export type RateBucket = (typeof RATE_BUCKETS)[number];

const perMinute = z.int().min(1).max(100_000);
export const ratePerMinuteSchema = z
  .object({ signIn: perMinute, checkout: perMinute, shopWrite: perMinute, report: perMinute, webhook: perMinute })
  .strict();
export type RatePerMinute = z.output<typeof ratePerMinuteSchema>;

const emptySources: CspExtraSources = { script: [], style: [], img: [], font: [], connect: [], frame: [], media: [], form: [] };

export const webSecuritySettings = {
  'security.csp.mode': setting({
    ...base,
    schema: z.enum(CSP_MODES),
    default: 'report' as CspMode,
    valueType: 'ENUM',
    labelKey: 'security.csp.mode.label',
    helpKey: 'security.csp.mode.help',
    sortOrder: 200,
  }),
  'security.csp.extraSources': setting({
    ...base,
    schema: cspExtraSourcesSchema,
    default: emptySources,
    valueType: 'JSON',
    labelKey: 'security.csp.extraSources.label',
    helpKey: 'security.csp.extraSources.help',
    sortOrder: 210,
  }),
  'security.rateLimit.mode': setting({
    ...base,
    schema: z.enum(RATE_LIMIT_MODES),
    default: 'observe' as RateLimitMode,
    valueType: 'ENUM',
    labelKey: 'security.rateLimit.mode.label',
    helpKey: 'security.rateLimit.mode.help',
    sortOrder: 220,
  }),
  'security.rateLimit.perMinute': setting({
    ...base,
    schema: ratePerMinuteSchema,
    default: { signIn: 30, checkout: 60, shopWrite: 600, report: 60, webhook: 1200 } as RatePerMinute,
    valueType: 'JSON',
    labelKey: 'security.rateLimit.perMinute.label',
    helpKey: 'security.rateLimit.perMinute.help',
    sortOrder: 230,
  }),
  'security.rateLimit.maxTracked': setting({
    ...base,
    schema: z.int().min(1_000).max(1_000_000),
    default: 50_000,
    valueType: 'INT',
    labelKey: 'security.rateLimit.maxTracked.label',
    helpKey: 'security.rateLimit.maxTracked.help',
    sortOrder: 240,
  }),
};
