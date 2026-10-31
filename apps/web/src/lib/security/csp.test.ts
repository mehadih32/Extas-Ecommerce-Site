// S18 · PR 378 — the page protection policy: everything from this site, the media address and the owner's outside
// addresses only where he put them; no plugins, no <base>, no framing by another site; reports to the report path;
// eval only on a developer's machine; the settings defaults give a report-only policy.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { buildCsp } from './csp';
import { readEdgePolicy } from './edge-load';

const none = registry['security.csp.extraSources'].default;
const dir = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('buildCsp', () => {
  it('locks down what a page never needs', () => {
    const csp = buildCsp({ extra: none, mediaBaseUrl: null });
    expect(dir(csp, 'default-src')).toBe("default-src 'self'");
    expect(dir(csp, 'object-src')).toBe("object-src 'none'");
    expect(dir(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(dir(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(dir(csp, 'form-action')).toBe("form-action 'self'");
    expect(dir(csp, 'connect-src')).toBe("connect-src 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).toContain('report-uri /api/security/csp-report');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('adds the media origin (https only) and the owner`s sources under their own kind', () => {
    const csp = buildCsp({
      extra: { ...none, script: ['https://connect.example.com'], connect: ['https://*.example.com'] },
      mediaBaseUrl: 'https://media.example.net/shop/',
    });
    expect(dir(csp, 'img-src')).toBe("img-src 'self' data: blob: https://media.example.net");
    expect(dir(csp, 'media-src')).toContain('https://media.example.net');
    expect(dir(csp, 'script-src')).toBe("script-src 'self' 'unsafe-inline' https://connect.example.com");
    expect(dir(csp, 'connect-src')).toBe("connect-src 'self' https://*.example.com");
    expect(buildCsp({ extra: none, mediaBaseUrl: 'http://media.example.net' })).not.toContain('media.example.net');
  });

  it('a developer`s machine gets eval and the live-reload socket', () => {
    const csp = buildCsp({ extra: none, mediaBaseUrl: null, dev: true });
    expect(dir(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(dir(csp, 'connect-src')).toContain('ws:');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('a report-only policy leaves out upgrade-insecure-requests (browsers ignore it there and log a console error)', () => {
    const csp = buildCsp({ extra: none, mediaBaseUrl: null, reportOnly: true });
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(dir(csp, 'object-src')).toBe("object-src 'none'");
  });
});

describe('readEdgePolicy', () => {
  it('without a database: the declared defaults — report only, observe only', async () => {
    const p = await readEdgePolicy(null, false);
    expect(p.csp.mode).toBe('report');
    expect(p.csp.header).toContain("object-src 'none'");
    expect(p.csp.header).not.toContain('upgrade-insecure-requests');
    expect(p.rate).toEqual({
      mode: 'observe',
      perMinute: registry['security.rateLimit.perMinute'].default,
      maxTracked: registry['security.rateLimit.maxTracked'].default,
    });
  });

  it('reads the settings, and sends no policy when the owner turned it off', async () => {
    const values: Record<string, unknown> = { 'security.csp.mode': 'off', 'media.publicBaseUrl': null };
    const resolver = { value: async (k: string) => (k in values ? values[k] : registry[k as keyof typeof registry].default) };
    const p = await readEdgePolicy(resolver as never, false);
    expect(p.csp).toEqual({ mode: 'off', header: null });
  });

  it('a setting that cannot be read falls back to its default', async () => {
    const resolver = { value: async () => Promise.reject(new Error('down')) };
    const p = await readEdgePolicy(resolver as never, false);
    expect(p.rate.mode).toBe('observe');
  });
});
