// PR 608 · p3 review (owner rule: unsigned or stale ERP calls are refused before any database read; refusals are
// counted and rate-limited). The ERP webhook receiver with a made-up database that logs every read: a request without
// a well-formed signature reads nothing at all (no setting, no table, no vault); a flood of well-formed wrong signatures
// from one address is cut off for that address only, and a call signed with a store's own secret always gets through.
import { describe, expect, it } from 'vitest';
import { signedErpWebhook } from '@extas/adapters';
import { registry, type Key, type Value } from '@extas/settings';
import { erpWebhookRequestRefusal, newErpWebhookGuard, receiveErpWebhook, type SettingsReader, type WebhookDeps } from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');
const SECRET = 'sample-store-secret-for-tests';

/** A database that answers like one store with its own connection and logs every call. */
function world(log: string[], secret: { value: string } = { value: SECRET }) {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => async () => {
          log.push(`${name}.${op}`);
          if (name === 'store' && op === 'findMany') return [{ id: 1, erpMode: 'EXTAS_ERP' }];
          if (name === 'store' && op === 'findUnique') return { erpCompanyId: null, erpMode: 'EXTAS_ERP' };
          if (name === 'webhookEvent' && op === 'count') return 0;
          if (name === 'webhookEvent' && op === 'create') return { id: 'we-1' };
          if (name === 'securityEvent') return { id: 'se-1' };
          return null;
        },
      },
    );
  const db = new Proxy({}, { get: (_t, m: string) => model(m) }) as never;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      log.push(`setting ${key}`);
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const connections = {
    use: async () => {
      throw new Error('not used');
    },
    secretOf: async () => {
      log.push('vault');
      return { value: secret.value, integrationId: 'int-1', provider: 'extasErp', mode: 'LIVE', storeId: 1 };
    },
  } as unknown as WebhookDeps['connections'];
  const clock = { now: T0.getTime() };
  const deps: WebhookDeps = { db, settings, connections, now: () => new Date(clock.now) };
  return { deps, overrides, clock };
}

const signed = (secret: string, id: string) => {
  const w = signedErpWebhook(secret, { id, type: 'stock.changed', data: { sku: 'SAMPLE-1', warehouseId: 'W1', onHand: 1, reserved: 0, available: 1, updatedAt: T0.toISOString() } }, T0);
  return { rawBody: w.body, signature: w.headers['x-extas-signature'] ?? null, timestamp: w.headers['x-extas-timestamp'] ?? null, idempotencyKey: null };
};

describe('PR 608 · the ERP webhook refuses before it reads', () => {
  it('no signature, or one that can never verify: refused (401) with nothing read', async () => {
    const log: string[] = [];
    const { deps } = world(log);
    const guard = newErpWebhookGuard();
    const ts = String(Math.floor(T0.getTime() / 1000));
    const bad: [string | null, string | null][] = [
      [null, null],
      [`sha256=${'a'.repeat(64)}`, null],
      [null, ts],
      ['sha256=zz', ts],
      ['md5=00', ts],
      [`sha256=${'a'.repeat(64)}`, 'yesterday'],
    ];
    for (const [signature, timestamp] of bad) {
      const r = await receiveErpWebhook(deps, { rawBody: '{}', signature, timestamp, idempotencyKey: null }, guard);
      expect(r.status).toBe(401);
    }
    expect(log).toEqual([]);
    // The route's own check (before it builds anything) says the same, counted, reading nothing.
    expect(erpWebhookRequestRefusal({ signature: null, timestamp: null }, T0, guard)).toMatchObject({ status: 401 });
    expect([...guard.pending.values()].reduce((a, b) => a + b, 0)).toBe(7);
    expect(log).toEqual([]);
  });

  it('a stale signature is refused after reading the settings only (no table, no vault)', async () => {
    const log: string[] = [];
    const { deps } = world(log);
    const old = signedErpWebhook(SECRET, { id: 'evt-old', type: 'stock.changed', data: {} }, new Date(T0.getTime() - 3_600_000));
    const r = await receiveErpWebhook(deps, { rawBody: old.body, signature: old.headers['x-extas-signature']!, timestamp: old.headers['x-extas-timestamp']!, idempotencyKey: null }, newErpWebhookGuard());
    expect(r).toEqual({ status: 401, code: 'STALE' });
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((l) => l.startsWith('setting '))).toBe(true);
  });

  it('a flood of wrong signatures cuts off that address only; the real ERP is answered even from it', async () => {
    const log: string[] = [];
    const { deps, overrides } = world(log);
    overrides.set('erp.siteApi.refusedPerMinute', 3);
    const guard = newErpWebhookGuard();
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) codes.push((await receiveErpWebhook(deps, { ...signed('a-wrong-secret', `evt-w${i}`), address: '203.0.113.9' }, guard)).code);
    // Three, then the one refresh call of the minute (round 2), then cut off.
    expect(codes.slice(0, 4)).toEqual(['BAD_SIGNATURE', 'BAD_SIGNATURE', 'BAD_SIGNATURE', 'BAD_SIGNATURE']);
    expect(codes.slice(4).every((c) => c === 'RATE_LIMITED')).toBe(true);
    // Cut off: nothing more is read for that address's unverified calls.
    const reads = log.length;
    expect(await receiveErpWebhook(deps, { ...signed('a-wrong-secret', 'evt-w99'), address: '203.0.113.9' }, guard)).toEqual({ status: 429, code: 'RATE_LIMITED' });
    expect(log.length).toBe(reads);
    // Another address still gets its lookup; the store's own signed event is taken from either address.
    expect((await receiveErpWebhook(deps, { ...signed('a-wrong-secret', 'evt-x1'), address: '198.51.100.7' }, guard)).code).toBe('BAD_SIGNATURE');
    expect(await receiveErpWebhook(deps, { ...signed(SECRET, 'evt-ok-1'), address: '203.0.113.9' }, guard)).toMatchObject({ status: 202, code: 'ACCEPTED' });
    expect(await receiveErpWebhook(deps, { ...signed(SECRET, 'evt-ok-2'), address: '198.51.100.7' }, guard)).toMatchObject({ status: 202, code: 'ACCEPTED' });
    // The refusals are kept as one summary row at most (never one row each).
    expect(log.filter((l) => l === 'securityEvent.create').length).toBeLessThanOrEqual(1);
  });

  it('round 2: fifty wrong signatures at the same moment get no more lookups than the limit', async () => {
    const log: string[] = [];
    const { deps, overrides } = world(log);
    overrides.set('erp.siteApi.refusedPerMinute', 3);
    const guard = newErpWebhookGuard();
    const req = { ...signed('a-wrong-secret', 'evt-burst'), address: '203.0.113.7' };
    const all = await Promise.all(Array.from({ length: 50 }, () => receiveErpWebhook(deps, req, guard)));
    const tally: Record<string, number> = {};
    for (const a of all) tally[a.code] = (tally[a.code] ?? 0) + 1;
    // Three slots and the one refresh call; the other 46 are cut off before any lookup.
    expect(tally).toEqual({ BAD_SIGNATURE: 4, RATE_LIMITED: 46 });
    expect(log.filter((l) => l === 'vault').length).toBeLessThanOrEqual(4);
  });

  it('round 2: after a secret change the real ERP is answered again within the refresh time, even while its address is cut off', async () => {
    const log: string[] = [];
    const secret = { value: SECRET };
    const { deps, overrides, clock } = world(log, secret);
    overrides.set('erp.siteApi.refusedPerMinute', 3);
    overrides.set('system.integrationKeyCacheSeconds', 30);
    const guard = newErpWebhookGuard();
    const at = (s: string, id: string, when = new Date(clock.now)) => {
      const w = signedErpWebhook(s, { id, type: 'stock.changed', data: { sku: 'SAMPLE-1', warehouseId: 'W1', onHand: 1, reserved: 0, available: 1, updatedAt: when.toISOString() } }, when);
      return receiveErpWebhook(deps, { rawBody: w.body, signature: w.headers['x-extas-signature']!, timestamp: w.headers['x-extas-timestamp']!, idempotencyKey: null, address: '192.0.2.10' }, guard);
    };
    expect((await at(SECRET, 'evt-a')).code).toBe('ACCEPTED');
    // The owner types a new secret; old (stale) calls from the same address use up its minute.
    secret.value = 'the-new-secret';
    for (let i = 0; i < 6; i++) await at('junk', `evt-j${i}`, new Date(clock.now - 3_600_000));
    // The refresh call (stale calls never take it) reads the secrets again: the new one is known from then on.
    expect((await at('the-new-secret', 'evt-b')).code).toBe('ACCEPTED');
    expect((await at('the-new-secret', 'evt-c')).code).toBe('ACCEPTED');
    // Changed again within the refresh time (30 s here): cut off until the next refresh call is due, then answered.
    secret.value = 'the-newest-secret';
    expect((await at('the-newest-secret', 'evt-d')).code).toBe('RATE_LIMITED');
    clock.now += 31_000;
    for (let i = 0; i < 6; i++) await at('junk', `evt-k${i}`, new Date(clock.now - 3_600_000));
    expect((await at('the-newest-secret', 'evt-e')).code).toBe('ACCEPTED');
    expect((await at('the-newest-secret', 'evt-f')).code).toBe('ACCEPTED');
  });
});
