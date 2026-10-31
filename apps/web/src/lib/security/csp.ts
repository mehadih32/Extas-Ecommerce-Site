// S18 · PR 378 (Blueprint B6.1) — the page protection policy (Content-Security-Policy) the app sends on every page. The
// shop and the admin load everything from themselves; the only outside addresses are the media address
// (`media.publicBaseUrl`, when the pictures come from a CDN) and the ones the owner adds per kind
// (`security.csp.extraSources`). Next.js writes small inline scripts into every page, so scripts allow 'unsafe-inline'
// (a nonce would make every page uncacheable); what the policy stops is everything else: plugins, a <base> tag, framing
// by another site, posting a form or sending data to another site, loading a script from one.
import type { CspExtraSources } from '@extas/settings';
import { CSP_REPORT_PATH } from './edge-gate';

export interface CspInput {
  extra: CspExtraSources;
  /** The media address (`media.publicBaseUrl`), or null when pictures come from this site. */
  mediaBaseUrl: string | null;
  /** True on a developer's machine: Next's live reload needs eval and its socket. */
  dev?: boolean;
  /** True when the policy goes out as Content-Security-Policy-Report-Only: browsers ignore (and log a console error
   * for) `upgrade-insecure-requests` there, so it is only sent with an enforced policy. */
  reportOnly?: boolean;
}

const originOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
};

const uniq = (xs: readonly string[]) => [...new Set(xs)];

/** The policy text. Every directive is named so nothing falls back to a wider default. */
export function buildCsp(input: CspInput): string {
  const { extra } = input;
  const media = originOf(input.mediaBaseUrl);
  const withMedia = media ? [media] : [];
  const dev = input.dev ?? false;
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...extra.script]],
    ['style-src', ["'self'", "'unsafe-inline'", ...extra.style]],
    ['img-src', ["'self'", 'data:', 'blob:', ...withMedia, ...extra.img]],
    ['font-src', ["'self'", 'data:', ...extra.font]],
    ['connect-src', ["'self'", ...(dev ? ['ws:'] : []), ...extra.connect]],
    ['media-src', ["'self'", 'blob:', ...withMedia, ...extra.media]],
    ['frame-src', ["'self'", ...extra.frame]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'", ...extra.form]],
    ['frame-ancestors', ["'self'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${uniq(values).join(' ')}`);
  if (!dev && !input.reportOnly) parts.push('upgrade-insecure-requests');
  parts.push(`report-uri ${CSP_REPORT_PATH}`);
  return parts.join('; ');
}
