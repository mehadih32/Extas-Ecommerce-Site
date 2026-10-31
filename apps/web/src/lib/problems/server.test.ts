// S21 · PR 415 — watching a money route never changes its answer: a good or failed answer goes back as it was, a
// throw is thrown on, and with no database nothing is attempted. The visitor is a one-way hash of the device cookie.
import { describe, expect, it } from 'vitest';
import { serverVisitor, watchShop } from './server';

const req = (cookie?: string) => new Request('https://shop.example.test/api/bag/lines', { method: 'POST', headers: cookie ? { cookie } : {} });

describe('watchShop', () => {
  it('hands the answer back unchanged', async () => {
    const ok = watchShop('bag', '/api/bag/lines', async () => new Response('fine', { status: 201 }), () => null);
    const bad = watchShop('bag', '/api/bag/lines', async () => new Response('down', { status: 503 }), () => null);
    const okRes = await ok(req());
    expect([okRes.status, await okRes.text()]).toEqual([201, 'fine']);
    expect((await bad(req())).status).toBe(503);
  });
  it('throws the error on, also when the deps themselves cannot be made', async () => {
    const threw = watchShop(
      'checkout',
      '/api/checkout/orders',
      async (): Promise<Response> => {
        throw new Error('boom');
      },
      () => {
        throw new Error('no database');
      },
    );
    await expect(threw(req())).rejects.toThrow('boom');
  });
  it('passes the route context through', async () => {
    const run = watchShop('checkout', '/api/payments/callback/[provider]', async (_r: Request, ctx: { provider: string }) => new Response(ctx.provider), () => null);
    expect(await (await run(req(), { provider: 'sample' })).text()).toBe('sample');
  });
});

describe('serverVisitor', () => {
  it('is the same for one device, never the cookie itself, and fresh without one', () => {
    const a = serverVisitor(req('__Host-extas_dev=sample-token-1'));
    expect(a).toMatch(/^srv-[0-9a-f]{32}$/);
    expect(serverVisitor(req('x=1; __Host-extas_dev=sample-token-1'))).toBe(a);
    expect(serverVisitor(req('__Host-extas_dev=sample-token-2'))).not.toBe(a);
    expect(a).not.toContain('sample');
    expect(serverVisitor(req())).not.toBe(serverVisitor(req()));
  });
});
