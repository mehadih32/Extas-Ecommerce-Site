// S18 · PR 378 — the browser's page protection reports: both report forms read, nothing personal kept (only the page's
// path and the origin of what was stopped), a body that is too big or not a report changes nothing.
import { describe, expect, it } from 'vitest';
import { blockedSource, cspReportHandler, cspViolationCounts, parseCspReport } from './csp-report';

const post = (body: string, h: Record<string, string> = {}) =>
  new Request('https://shop.example.test/api/security/csp-report', { method: 'POST', body, headers: { 'content-type': 'application/csp-report', ...h } });

describe('csp reports', () => {
  it('reads the old form and the Reporting API list, keeping only the path and the origin', () => {
    expect(
      parseCspReport({
        'csp-report': {
          'document-uri': 'https://shop.example.test/checkout?phone=01712345678',
          'violated-directive': 'script-src-elem',
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'https://evil.example/x.js?c=secret',
        },
      }),
    ).toEqual([{ directive: 'script-src-elem', blocked: 'https://evil.example', page: '/checkout' }]);
    expect(
      parseCspReport([
        { type: 'csp-violation', body: { documentURL: 'https://shop.example.test/', effectiveDirective: 'img-src', blockedURL: 'data:image/png;base64,AAA' } },
        { type: 'deprecation', body: {} },
      ]),
    ).toEqual([{ directive: 'img-src', blocked: 'data', page: '/' }]);
    expect(parseCspReport('nope')).toEqual([]);
  });

  it('keywords stay keywords; anything else is reduced to an origin or "other"', () => {
    expect(blockedSource('inline')).toBe('inline');
    expect(blockedSource('eval')).toBe('eval');
    expect(blockedSource('blob:https://x')).toBe('blob');
    expect(blockedSource('not a url')).toBe('other');
    expect(blockedSource('')).toBe('unknown');
  });

  it('answers 204, logs one line per violation and counts it; refuses an oversized body', async () => {
    const lines: string[] = [];
    const body = JSON.stringify({ 'csp-report': { 'document-uri': 'https://shop.example.test/p/x', 'effective-directive': 'connect-src', 'blocked-uri': 'https://t.example/c' } });
    const r = await cspReportHandler(post(body), (l) => lines.push(l));
    expect(r.status).toBe(204);
    expect(lines).toEqual(['csp: connect-src stopped https://t.example on /p/x']);
    expect(cspViolationCounts().find((c) => c.blocked === 'https://t.example')).toMatchObject({ directive: 'connect-src', count: 1 });
    expect((await cspReportHandler(post('x'.repeat(9000)), () => {})).status).toBe(413);
    expect((await cspReportHandler(post('not json'), () => {})).status).toBe(204);
    expect((await cspReportHandler(new Request('https://shop.example.test/api/security/csp-report'), () => {})).status).toBe(405);
  });
});
