// S18 · PR 386 (Blueprint B6.1, B6.3) — the shop's protection at Cloudflare (registry version 80; lane B's reserved run,
// CN-031). Labels: messages/edge.<lang>.json (group `security`; the admin's place is Settings → Sign-in & security →
// Cloudflare protection). Cloudflare's own DDoS protection is always on; this is the shop's plan of its own rules,
// written to Cloudflare only when someone presses "Send to Cloudflare" (the mock until the token is in, A1.3), and
// every rule is limited to the shop's host names (@extas/adapters cdn/shield.ts), so another site on the same zone
// (the old shop until go-live) is never touched.
//
// - `edge.shield.securityLevel`: Cloudflare's security level for the shop — never "I'm under attack", which shows every
//   customer a waiting page (B6.3: no challenge for customers).
// - `edge.shield.browserCheck`: Cloudflare's browser integrity check (refuses requests with a forged or missing browser
//   header; invisible to a real customer).
// - `edge.shield.sslStrict`: SSL Full (strict) between Cloudflare and the server (the Origin certificate, PR 7).
// - `edge.shield.blockProbes` / `probePaths`: refuse the addresses robots try on every site; the shop has none of them.
// - `edge.shield.adminChallenge`: a managed challenge on the admin's sign-in page only (B6.3 allows it there, never on
//   the shop). Off by default.
// - `edge.shield.adminLoginPer10s`: above this many admin sign-in tries in 10 seconds, Cloudflare refuses that address
//   for 10 seconds. It refuses people, so it is off (null) by default and only the owner may set it (CLAUDE.md rule 6).
import { z } from 'zod';
import { setting } from './define';

const V = 80;

export const EDGE_SECURITY_LEVELS = ['essentially_off', 'low', 'medium', 'high'] as const;

/** How many addresses the list takes, and how long one may be. */
export const EDGE_PROBE_PATHS_MAX = 30;
export const EDGE_PROBE_PATH_LEN = 100;

/** An address beginning: "/" then plain address letters only (no quote, no space: it goes into a Cloudflare rule). */
export const probePathSchema = z
  .string()
  .max(EDGE_PROBE_PATH_LEN)
  .regex(/^\/[A-Za-z0-9._~\-/]+$/, { message: 'an address starting with /' });

export const edgeShieldSchema = z
  .object({
    securityLevel: z.enum(EDGE_SECURITY_LEVELS),
    browserCheck: z.boolean(),
    sslStrict: z.boolean(),
    blockProbes: z.boolean(),
    probePaths: z
      .array(probePathSchema)
      .max(EDGE_PROBE_PATHS_MAX)
      .refine((l) => new Set(l).size === l.length, { message: 'every address once' }),
    adminChallenge: z.boolean(),
    adminLoginPer10s: z.int().min(1).max(1000).nullable(),
  })
  .strict();
export type EdgeShieldSettings = z.output<typeof edgeShieldSchema>;

export const edgeSettings = {
  'edge.shield': setting({
    scope: 'installation',
    schema: edgeShieldSchema,
    default: {
      securityLevel: 'medium',
      browserCheck: true,
      sslStrict: true,
      blockProbes: true,
      probePaths: ['/wp-login.php', '/wp-admin', '/xmlrpc.php', '/.env', '/.git'],
      adminChallenge: false,
      adminLoginPer10s: null,
    },
    valueType: 'JSON',
    group: 'security',
    labelKey: 'edge.shield.label',
    helpKey: 'edge.shield.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 60,
    version: V,
  }),
};
