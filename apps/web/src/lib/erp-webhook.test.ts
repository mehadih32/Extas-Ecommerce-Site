// PR 608 · p3 review — POST /api/erp/webhook, the route's own half: an unsigned or malformed request is answered before
// anything is built or read; every 401 is the same answer (a sender cannot tell "no secret yet" from "wrong
// signature"); a body without a Content-Length (chunked) is read only up to `erp.webhook.maxBodyKb`. The database is a
// made-up one that logs every read; every secret is made up here.
import { describe, expect, it } from 'vitest';
import { signedErpWebhook } from '@extas/adapters';
import { newErpWebhookGuard, type WebhookDeps } from '@extas/inventory';
import { registry, type Key, type Value } from '@extas/settings';
import { erpWebhookRoute } from './erp-webhook';

const SECRET = 'sample-store-secret-for-route-tests';
const URL_ = 'https://shop.example.test/api/erp/webhook';

function fakeDeps(log: string[], secret: string | null): WebhookDeps {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => async () => {
          log.push(`${name}.${op}`);
          if (name === 'store' && op === 'findMany') return [{ id: 1 }];
          if (name === 'store' && op === 'findUnique') return { erpCompanyId: null };
          if (name === 'webhookEvent' && op === 'count') return 0;
          if (name === 'webhookEvent' && op === 'create') return { id: 'we-1' };
          if (name === 'securityEvent') return { id: 'se-1' };
          return null;
        },
      },
    );
  return {
    db: new Proxy({}, { get: (_t, m: string) => model(m) }) as never,
    settings: {
      async value<K extends Key>(key: K): Promise<Value<K>> {
        log.push(`setting ${key}`);
        return (key === 'erp.webhook.maxBodyKb' ? 1 : registry[key].default) as Value<K>;
      },
    },
    connections: {
      use: async () => {
        throw new Error('not used');
      },
      secretOf: async () => {
        log.push('vault');
        return secret ? { value: secret, integrationId: 'int-1', provider: 'extasErp', mode: 'LIVE', storeId: 1 } : null;
      },
    } as unknown as WebhookDeps['connections'],
  };
}

const post = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request(URL_, { method: 'POST', body, headers, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) } as RequestInit);
const stock = (secret: string, id: string, pad = '') =>
  signedErpWebhook(secret, { id, type: 'stock.changed', data: { sku: 'SAMPLE-1', warehouseId: 'W1', onHand: 1, reserved: 0, available: 1, updatedAt: new Date().toISOString(), pad } }, new Date());

describe('PR 608 · the ERP webhook route', () => {
  it('an unsigned or malformed request is refused before any deps are built (nothing read)', async () => {
    let built = 0;
    const opts = { guard: newErpWebhookGuard(), deps: async () => (built++, null) };
    const kinds: Record<string, string>[] = [{}, { 'x-extas-signature': 'sha256=zz', 'x-extas-timestamp': '1' }, { 'x-extas-signature': `sha256=${'a'.repeat(64)}` }];
    for (const headers of kinds) {
      const res = await erpWebhookRoute(post('{}', headers), opts);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, code: 'UNAUTHORIZED' });
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(built).toBe(0);
  });

  it('every 401 is the same answer: no secret yet, a wrong signature, a stale one', async () => {
    const answers: unknown[] = [];
    const w = stock('not-the-secret', 'evt-1');
    for (const secret of [null, SECRET]) {
      const res = await erpWebhookRoute(post(w.body, w.headers), { guard: newErpWebhookGuard(), deps: async () => fakeDeps([], secret) });
      answers.push([res.status, await res.json()]);
    }
    const old = signedErpWebhook(SECRET, { id: 'evt-old', type: 'stock.changed', data: {} }, new Date(Date.now() - 3_600_000));
    const res = await erpWebhookRoute(post(old.body, old.headers), { guard: newErpWebhookGuard(), deps: async () => fakeDeps([], SECRET) });
    answers.push([res.status, await res.json()]);
    expect(answers).toEqual([
      [401, { ok: false, code: 'UNAUTHORIZED' }],
      [401, { ok: false, code: 'UNAUTHORIZED' }],
      [401, { ok: false, code: 'UNAUTHORIZED' }],
    ]);
  });

  it('a chunked body (no Content-Length) is read only up to the limit, then refused (413)', async () => {
    const w = stock(SECRET, 'evt-big');
    let pulled = 0;
    const chunk = new TextEncoder().encode('x'.repeat(512));
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 1000) c.close();
        else c.enqueue(chunk);
      },
    });
    const log: string[] = [];
    const res = await erpWebhookRoute(post(body, w.headers), { guard: newErpWebhookGuard(), deps: async () => fakeDeps(log, SECRET) });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, code: 'TOO_LARGE' });
    // 1 KB limit, 512-byte chunks: a few pulls, never the 500 KB the sender offered.
    expect(pulled).toBeLessThan(10);
    expect(log.filter((l) => !l.startsWith('setting '))).toEqual([]);
  });

  it('a signed event within the limit is taken (202)', async () => {
    const w = stock(SECRET, 'evt-ok');
    const res = await erpWebhookRoute(post(w.body, w.headers), { guard: newErpWebhookGuard(), deps: async () => fakeDeps([], SECRET) });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, code: 'ACCEPTED', eventId: 'we-1' });
  });
});
