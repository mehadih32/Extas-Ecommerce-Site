// Follow-up 607 (PR 378) — a request body is read only up to its cap: the speed readings (`/api/shop/vitals`, 1 KB) and
// every admin JSON body (`body()`, the edge's own 25 MB) stop reading once longer, so a huge body is never buffered
// whole in the app before it is refused.
import { describe, expect, it } from 'vitest';
import { ADMIN_BODY_MAX, body } from './admin-auth';
import { readCapped } from './read-capped';
import { readCapped as fromWebhook } from './erp-webhook';

/** A body that counts how many bytes were pulled from it. */
function streamed(chunks: number, size: number) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (pulled >= chunks * size) return c.close();
      pulled += size;
      c.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
  return { request: new Request('https://shop.example.test/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), pulled: () => pulled };
}

describe('reading a body up to its cap (follow-up 607)', () => {
  it('gives the text under the cap and null over it, without reading the rest', async () => {
    expect(await readCapped(new Request('https://shop.example.test/x', { method: 'POST', body: '{"a":1}' }), 100)).toBe('{"a":1}');
    expect(await readCapped(new Request('https://shop.example.test/x', { method: 'GET' }), 100)).toBe('');
    const big = streamed(1_000, 1_024);
    expect(await readCapped(big.request, 4_096)).toBeNull();
    expect(big.pulled()).toBeLessThan(16 * 1_024);
    expect(fromWebhook).toBe(readCapped); // the webhooks' own reader is the same one
  });

  it("an admin body over the cap is an empty object (the validation names what is missing), read no further", async () => {
    expect(ADMIN_BODY_MAX).toBe(25 * 1024 * 1024);
    expect(await body(new Request('https://admin.example.test/x', { method: 'POST', body: '{"name":"Polo"}' }))).toEqual({ name: 'Polo' });
    expect(await body(new Request('https://admin.example.test/x', { method: 'POST', body: '[1,2]' }))).toEqual({});
    expect(await body(new Request('https://admin.example.test/x', { method: 'POST', body: 'not json' }))).toEqual({});
    const big = streamed(40_000, 1_024); // 40 MB of "a"
    expect(await body(big.request)).toEqual({});
    expect(big.pulled()).toBeLessThan(ADMIN_BODY_MAX + 2 * 1_024 * 1_024);
  });
});
