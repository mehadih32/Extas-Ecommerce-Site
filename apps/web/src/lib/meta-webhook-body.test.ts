// Review R1 (security m2) — PR 292: the WhatsApp webhook reads a body only up to their limit. A
// chunked body has no Content-Length, so the header check alone never stops it: the body is read as a stream and a
// longer one is 413 before anything is verified or recorded. The deps and the limit are made up here.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ whatsapp: [] as string[], messenger: [] as string[] }));

vi.mock('@/lib/admin-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin-auth')>()),
  adminDeps: () => ({ db: {}, resolver: { value: async () => 30 }, vault: null, now: () => new Date() }),
}));
vi.mock('@extas/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@extas/messages')>()),
  whatsappWebhookMaxBytes: async () => 64,
  receiveWhatsAppWebhook: async (_deps: unknown, input: { rawBody: string }) => {
    seen.whatsapp.push(input.rawBody);
    return { status: 200, code: 'OK' };
  },
}));

const whatsapp = await import('@/app/api/whatsapp/webhook/route');

/** A POST whose body comes in chunks, with no Content-Length (like a chunked upload). */
function chunked(path: string, chunks: string[]): Request {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });
  return new Request(`https://shop.example.test${path}`, { method: 'POST', body, duplex: 'half' } as RequestInit);
}

beforeEach(() => {
  seen.whatsapp.length = 0;
  seen.messenger.length = 0;
});

describe.each([
  ['whatsapp', whatsapp.POST, '/api/whatsapp/webhook'],
] as const)('%s webhook body limit', (name, POST, path) => {
  it('refuses a chunked body over the limit with 413, before it is verified', async () => {
    const r = await POST(chunked(path, ['x'.repeat(40), 'y'.repeat(40)]));
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ ok: false, code: 'TOO_LARGE' });
    expect(seen[name]).toEqual([]);
  });

  it('passes a chunked body within the limit on whole', async () => {
    const r = await POST(chunked(path, ['{"a":', '1}']));
    expect(r.status).toBe(200);
    expect(seen[name]).toEqual(['{"a":1}']);
  });
});
