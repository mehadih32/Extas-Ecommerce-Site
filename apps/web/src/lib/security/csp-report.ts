// S18 · PR 378 — what the browser reports when the page protection policy stopped (or, in report-only, would have
// stopped) something. Nothing personal is kept: the page's path without its query, the directive, and only the origin
// (or the keyword: inline, eval, data) of what was stopped. Each report is one log line, and this server copy keeps a
// small count per directive and source for the Site health pages (PR 413, 423). The body is size-capped; anything
// that is not a report is ignored. The proxy limits how many reports one address may send (bucket `report`).

/** The most a report body may be (a browser's report is well under 2 KB). */
export const CSP_REPORT_MAX_BYTES = 8_192; // hardcode-ok: a body-size guard, not a business number
/** How many distinct directive + source pairs one server copy counts (oldest dropped first). */
const MAX_KINDS = 200; // hardcode-ok: a memory bound for the in-process counts

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The origin or keyword of what was stopped; never a full address (it may carry a customer's data in its query). */
export function blockedSource(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return 'unknown';
  if (['inline', 'eval', 'self', 'data', 'blob', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink'].includes(v)) return v;
  if (v.startsWith('data:')) return 'data';
  if (v.startsWith('blob:')) return 'blob';
  try {
    return new URL(v).origin;
  } catch {
    return 'other';
  }
}

const pathOf = (raw: string): string => {
  try {
    return new URL(raw).pathname.slice(0, 200);
  } catch {
    return '';
  }
};

/** The violations in one report body (the old `csp-report` form and the Reporting API's list form). */
export function parseCspReport(body: unknown): CspViolation[] {
  const items: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const r of body.slice(0, 20)) {
      if (r && typeof r === 'object' && (r as { type?: unknown }).type === 'csp-violation') {
        const b = (r as { body?: unknown }).body;
        if (b && typeof b === 'object') items.push(b as Record<string, unknown>);
      }
    }
  } else if (body && typeof body === 'object') {
    const r = (body as { 'csp-report'?: unknown })['csp-report'];
    if (r && typeof r === 'object') items.push(r as Record<string, unknown>);
  }
  return items.map((r) => ({
    directive: str(r['effective-directive'] ?? r['effectiveDirective'] ?? r['violated-directive'], 60).split(' ')[0] || 'unknown',
    blocked: blockedSource(str(r['blocked-uri'] ?? r['blockedURL'])),
    page: pathOf(str(r['document-uri'] ?? r['documentURL'], 2000)),
  }));
}

const G = globalThis as unknown as { __extasCspCounts?: Map<string, { v: CspViolation; count: number; last: number }> };

/** Counts one violation in this server copy. */
export function countViolation(v: CspViolation, now = Date.now()): void {
  const m = (G.__extasCspCounts ??= new Map());
  const key = `${v.directive} ${v.blocked}`;
  const e = m.get(key);
  if (e) {
    m.delete(key);
    m.set(key, { v, count: e.count + 1, last: now });
  } else {
    m.set(key, { v, count: 1, last: now });
    if (m.size > MAX_KINDS) m.delete(m.keys().next().value!);
  }
}

/** This server copy's counts, the most frequent first. */
export function cspViolationCounts(): { directive: string; blocked: string; page: string; count: number; last: string }[] {
  return [...(G.__extasCspCounts?.values() ?? [])]
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ ...e.v, count: e.count, last: new Date(e.last).toISOString() }));
}

/** POST /api/security/csp-report. Always 204 for a report (a browser does nothing with the answer). */
export async function cspReportHandler(request: Request, log: (line: string) => void = console.warn): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > CSP_REPORT_MAX_BYTES) return new Response(null, { status: 413 });
  let text = '';
  try {
    text = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (text.length > CSP_REPORT_MAX_BYTES) return new Response(null, { status: 413 });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const v of parseCspReport(parsed)) {
    countViolation(v);
    log(`csp: ${v.directive} stopped ${v.blocked} on ${v.page || '?'}`);
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
