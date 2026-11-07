// Follow-up 372 — the couriers' webhook route's own half: an unknown courier and the switch off are 404 before the body
// is read; a body over the limit is 413 (also a chunked one with no Content-Length); every refusal of the caller is one
// 401 code; Pathao's set-up reply header reaches the answer. The shipping service is stubbed; values are made up.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDeps } from './admin-auth';

const state = vi.hoisted(() => ({ max: 64 as number | null, seen: [] as string[], answer: { status: 200, code: 'OK' } as { status: number; code: string; headers?: Record<string, string> } }));

vi.mock('@extas/shipping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@extas/shipping')>()),
  courierWebhookMaxBytes: async () => state.max,
  receiveCourierWebhook: async (_deps: unknown, provider: string, req: { rawBody: string }) => {
    state.seen.push(`${provider}:${req.rawBody}`);
    return state.answer;
  },
}));

const { courierWebhookRoute } = await import('./courier-webhook');

const opts = { deps: () => ({}) as AdminDeps, build: async () => ({}) as never };
const post = (body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
  new Request('https://shop.example.test/api/courier/steadfast/webhook', { method: 'POST', body, headers, ...(typeof body === 'string' ? {} : { duplex: 'half' }) } as RequestInit);

describe('follow-up 372 · courier webhook route', () => {
  beforeEach(() => {
    state.max = 64;
    state.seen = [];
    state.answer = { status: 200, code: 'OK' };
  });

  it('an unknown courier and the switch off answer 404 and never read the body', async () => {
    expect((await courierWebhookRoute(post('{}'), 'mockCourier', opts)).status).toBe(404);
    state.max = null;
    const r = await courierWebhookRoute(post('{}'), 'steadfast', opts);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(state.seen).toEqual([]);
  });

  it('a body over the limit is 413, by its header or by reading a chunked one only up to the limit', async () => {
    expect((await courierWebhookRoute(post('x'.repeat(65), { 'content-length': '65' }), 'steadfast', opts)).status).toBe(413);
    const chunks = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('x'.repeat(40)));
        c.enqueue(new TextEncoder().encode('x'.repeat(40)));
        c.close();
      },
    });
    expect((await courierWebhookRoute(post(chunks), 'steadfast', opts)).status).toBe(413);
    expect(state.seen).toEqual([]);
  });

  it('a received call reaches the service; every refusal of the caller is one code; the courier header passes on', async () => {
    const ok = await courierWebhookRoute(post('{"a":1}'), 'steadfast', opts);
    expect(ok.status).toBe(200);
    expect(state.seen).toEqual(['steadfast:{"a":1}']);
    state.answer = { status: 401, code: 'UNAUTHORIZED' };
    const no = await courierWebhookRoute(post('{}'), 'pathao', opts);
    expect([no.status, await no.json()]).toEqual([401, { ok: false, code: 'UNAUTHORIZED' }]);
    state.answer = { status: 202, code: 'HANDSHAKE', headers: { 'X-Pathao-Merchant-Webhook-Integration-Secret': 'reply-1' } };
    const hs = await courierWebhookRoute(post('{}'), 'pathao', opts);
    expect(hs.status).toBe(202);
    expect(hs.headers.get('x-pathao-merchant-webhook-integration-secret')).toBe('reply-1');
    expect(hs.headers.get('cache-control')).toBe('no-store');
  });
});
