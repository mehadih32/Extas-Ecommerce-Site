// S13 · PR 257 — the ad platforms' server event APIs: each platform's own shape for the same event (names, value,
// category, size and colour, the shared event id), the mock that sends nothing anywhere, the live clients against
// stand-in platforms, and no key in any answer.
import { describe, expect, it } from 'vitest';
import {
  adEventAdapters,
  allAdapters,
  createGoogleClient,
  createMetaClient,
  createTiktokClient,
  findConnection,
  googleAnalyticsConfig,
  googleEvents,
  metaConversionsAdapter,
  metaConversionsConfig,
  metaPayload,
  mockAdOutbox,
  NO_TEST_CODE,
  tiktokEventsConfig,
  tiktokPayload,
  type AdEvent,
} from '../src';

const AT = new Date(Date.UTC(2026, 9, 31, 10, 0, 0));
const EVENT: AdEvent = {
  eventId: 'purchase-EX1001',
  name: 'purchase',
  at: AT,
  url: 'https://shop.example.test/checkout',
  value: 2450,
  currency: 'BDT',
  items: [{ id: 'p-1', sku: 'POLO-NVY-M', name: 'Sample polo', category: 'Polos', colour: 'Navy', size: 'M', quantity: 2, price: 1225 }],
  orderNumber: 'EX1001',
  user: { em: 'e'.repeat(64), ph: 'a'.repeat(64), phPlus: 'b'.repeat(64), ext: 'c'.repeat(64), fbp: 'fb.1.1700000000000.123', ua: 'SampleBrowser/1.0' },
};
const TOKEN = 'sample-token-0123456789abcdef';

function stand(answer: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit; body: unknown }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const i = init ?? {};
    calls.push({ url: String(url), init: i, body: i.body ? JSON.parse(String(i.body)) : null });
    return answer(String(url), i);
  }) as typeof fetch;
  return { f, calls };
}

describe('ad platform payloads (PR 257)', () => {
  it('Meta: the standard event, the shared id, hashes only, value and contents', () => {
    const p = metaPayload([EVENT], { testEventCode: 'TEST123' }) as { data: Record<string, unknown>[]; test_event_code: string };
    expect(p.test_event_code).toBe('TEST123');
    expect(p.data[0]).toMatchObject({ event_name: 'Purchase', event_id: 'purchase-EX1001', event_time: AT.getTime() / 1000, action_source: 'website', event_source_url: 'https://shop.example.test/checkout' });
    expect(p.data[0]!.user_data).toEqual({ em: ['e'.repeat(64)], ph: ['a'.repeat(64)], external_id: ['c'.repeat(64)], fbp: 'fb.1.1700000000000.123', client_user_agent: 'SampleBrowser/1.0' });
    expect(p.data[0]!.custom_data).toMatchObject({ value: 2450, currency: 'BDT', content_ids: ['p-1'], content_category: 'Polos', contents: [{ id: 'p-1', quantity: 2, item_price: 1225 }], num_items: 2, order_id: 'EX1001' });
    expect(metaPayload([EVENT])).not.toHaveProperty('test_event_code');
  });

  it('Google: one body per event with the item, its variant (colour / size) and the order as the transaction', () => {
    const [b] = googleEvents([EVENT], { test: true }) as { client_id: string; user_data: unknown; events: { name: string; params: Record<string, unknown> }[] }[];
    expect(b!.client_id).toBe('c'.repeat(64));
    expect(b!.user_data).toEqual({ sha256_email_address: ['e'.repeat(64)], sha256_phone_number: ['b'.repeat(64)] });
    expect(b!.events[0]).toMatchObject({ name: 'purchase', params: { currency: 'BDT', value: 2450, transaction_id: 'EX1001', event_id: 'purchase-EX1001', debug_mode: true } });
    expect(b!.events[0]!.params.items).toEqual([{ item_id: 'p-1', item_name: 'Sample polo', item_category: 'Polos', item_variant: 'Navy / M', quantity: 2, price: 1225 }]);
  });

  it('TikTok: its own event names, the pixel, the hashed contact and the contents', () => {
    const p = tiktokPayload([{ ...EVENT, name: 'addToBag', orderNumber: null }], { pixelCode: 'CSAMPLE1234567890' }) as { event_source_id: string; data: Record<string, unknown>[] };
    expect(p.event_source_id).toBe('CSAMPLE1234567890');
    expect(p.data[0]).toMatchObject({ event: 'AddToCart', event_id: 'purchase-EX1001', user: { email: 'e'.repeat(64), phone: 'b'.repeat(64), external_id: 'c'.repeat(64), user_agent: 'SampleBrowser/1.0' } });
    expect((p.data[0]!.properties as Record<string, unknown>).contents).toEqual([{ content_id: 'p-1', content_name: 'Sample polo', content_category: 'Polos', quantity: 2, price: 1225 }]);
    expect(p.data[0]!.properties).not.toHaveProperty('order_id');
  });
});

describe('ad platform adapters (PR 257)', () => {
  it('are Keys & connections rows, each with its one key, and in the adapter list', () => {
    expect(findConnection('metaConversions')).toMatchObject({ kind: 'META', adapter: true, secrets: [{ field: 'accessToken' }] });
    expect(findConnection('googleAnalytics')).toMatchObject({ kind: 'GOOGLE', adapter: true, secrets: [{ field: 'apiSecret' }] });
    expect(findConnection('tiktokEvents')).toMatchObject({ kind: 'TIKTOK', adapter: true, secrets: [{ field: 'accessToken' }] });
    for (const a of adEventAdapters) expect(allAdapters).toContain(a);
  });

  it('checks the plain settings', () => {
    expect(metaConversionsConfig.safeParse({ pixelId: '123456789012345' }).success).toBe(true);
    expect(metaConversionsConfig.safeParse({ pixelId: 'abc' }).success).toBe(false);
    expect(googleAnalyticsConfig.safeParse({ measurementId: 'G-ABC123XYZ' }).success).toBe(true);
    expect(googleAnalyticsConfig.safeParse({ measurementId: 'UA-1234-1' }).success).toBe(false);
    expect(tiktokEventsConfig.safeParse({ pixelCode: 'CSAMPLE1234567890', testEventCode: 'TEST42' }).success).toBe(true);
    expect(tiktokEventsConfig.safeParse({ pixelCode: 'CSAMPLE1234567890', baseUrl: 'http://plain.example' }).success).toBe(false);
  });

  it('the mock sends nothing anywhere and keeps what it would have sent', async () => {
    mockAdOutbox.clear();
    const ctx = { mode: 'MOCK' as const, config: { pixelId: '123456789012345' }, storeId: null, secret: async () => null };
    const api = await metaConversionsAdapter.mock(ctx);
    expect(await api.send([EVENT])).toEqual({ ok: true, sent: 1 });
    const [m] = mockAdOutbox.all();
    expect(m).toMatchObject({ provider: 'metaConversions', platform: 'meta', test: false, eventIds: ['purchase-EX1001'] });
    expect(JSON.stringify(m!.payload)).toContain('"event_name":"Purchase"');
    expect(await metaConversionsAdapter.test(api, ctx)).toMatchObject({ ok: true });
  });

  it('Meta live: the token travels in a header, never in the address or an error', async () => {
    const { f, calls } = stand(() => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    const c = createMetaClient({ baseUrl: 'https://graph.test', apiVersion: 'v21.0', pixelId: '123456789012345', token: TOKEN, testEventCode: 'TEST1', fetch: f });
    expect(await c.send([EVENT], { test: true })).toEqual({ ok: true, sent: 1 });
    expect(calls[0]!.url).toBe('https://graph.test/v21.0/123456789012345/events');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]!.body).toMatchObject({ test_event_code: 'TEST1' });
    const bad = createMetaClient({ baseUrl: 'https://graph.test', apiVersion: 'v21.0', pixelId: '1234567', token: TOKEN, fetch: stand(() => new Response(JSON.stringify({ error: { message: `Invalid OAuth access token ${TOKEN}` } }), { status: 400 })).f });
    const r = await bad.send([EVENT]);
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(JSON.stringify(await bad.check())).not.toContain(TOKEN);
    // qa-gate: a test event with no test event code is never sent (Meta would count it as a real one)
    const before = calls.length;
    const noCode = createMetaClient({ baseUrl: 'https://graph.test', apiVersion: 'v21.0', pixelId: '123456789012345', token: TOKEN, fetch: f });
    expect(await noCode.send([EVENT], { test: true })).toEqual({ ok: false, error: NO_TEST_CODE });
    expect(calls.length).toBe(before);
  });

  it('Google live: one call per event; the Test uses the checking address; the secret is never in an answer', async () => {
    const { f, calls } = stand((url) => (url.includes('/debug/') ? new Response(JSON.stringify({ validationMessages: [] }), { status: 200 }) : new Response(null, { status: 204 })));
    const c = createGoogleClient({ baseUrl: 'https://ga.test', measurementId: 'G-ABC123XYZ', apiSecret: TOKEN, fetch: f });
    expect(await c.send([EVENT, { ...EVENT, eventId: 'view-1', name: 'view' }])).toEqual({ ok: true, sent: 2 });
    expect(calls.map((x) => new URL(x.url).pathname)).toEqual(['/mp/collect', '/mp/collect']);
    expect(await c.check()).toMatchObject({ ok: true });
    expect(new URL(calls[2]!.url).pathname).toBe('/debug/mp/collect');
    // qa-gate: a test event goes only to the checking address, never counted
    expect(await c.send([EVENT], { test: true })).toEqual({ ok: true, sent: 1 });
    expect(new URL(calls[3]!.url).pathname).toBe('/debug/mp/collect');
    const down = createGoogleClient({ baseUrl: 'https://ga.test', measurementId: 'G-ABC123XYZ', apiSecret: TOKEN, fetch: (async () => Promise.reject(new Error(`connect to https://ga.test/mp/collect?api_secret=${TOKEN}`))) as typeof fetch });
    const r = await down.send([EVENT]);
    expect(r).toEqual({ ok: false, error: 'Google did not answer' });
  });

  it('TikTok live: code 0 is a success; the Test needs the test event code', async () => {
    const { f, calls } = stand(() => new Response(JSON.stringify({ code: 0, message: 'OK' }), { status: 200 }));
    const c = createTiktokClient({ baseUrl: 'https://tt.test', pixelCode: 'CSAMPLE1234567890', token: TOKEN, fetch: f });
    expect(await c.send([EVENT])).toEqual({ ok: true, sent: 1 });
    expect((calls[0]!.init.headers as Record<string, string>)['Access-Token']).toBe(TOKEN);
    expect(await c.check()).toMatchObject({ ok: false });
    // qa-gate: a test event with no test event code is never sent (TikTok would count it as a real one)
    expect(await c.send([EVENT], { test: true })).toEqual({ ok: false, error: NO_TEST_CODE });
    expect(calls).toHaveLength(1);
    const refused = createTiktokClient({ baseUrl: 'https://tt.test', pixelCode: 'CSAMPLE1234567890', token: TOKEN, testEventCode: 'TEST9', fetch: stand(() => new Response(JSON.stringify({ code: 40001, message: `bad token ${TOKEN}` }), { status: 200 })).f });
    const r = await refused.check();
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain(TOKEN);
  });
});
