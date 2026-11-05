// PR 624: the tap beacon — same site only, a size cap, POST only; a bad tap or no database still answers 204 and the
// counting itself is @extas/support's (taps.db.test.ts).
import { describe, expect, it, vi } from 'vitest';
import { supportTapHandler } from './support-taps';

const HOST = 'shop.example.test';
const req = (body: string, o: { origin?: string; method?: string } = {}) =>
  new Request(`https://${HOST}/api/shop/support-tap`, { method: o.method ?? 'POST', headers: { host: HOST, origin: o.origin ?? `https://${HOST}`, 'content-type': 'text/plain' }, ...(o.method === 'GET' ? {} : { body }) });

describe('support tap beacon', () => {
  it('refuses another site, a GET and a long body', async () => {
    expect((await supportTapHandler(req('{}', { origin: 'https://elsewhere.example' }), 1, null)).status).toBe(403);
    expect((await supportTapHandler(req('', { method: 'GET' }), 1, null)).status).toBe(405);
    expect((await supportTapHandler(req('x'.repeat(200)), 1, { db: {} as never, settings: {} as never })).status).toBe(413);
  });

  it('answers 204 with no database, and for a body that is not JSON', async () => {
    expect((await supportTapHandler(req('{"ch":"messenger","place":"header"}'), 1, null)).status).toBe(204);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = { db: {} as never, settings: { value: async () => ({ enabled: false }) } as never };
    expect((await supportTapHandler(req('not json'), 1, deps)).status).toBe(204);
    warn.mockRestore();
  });
});
