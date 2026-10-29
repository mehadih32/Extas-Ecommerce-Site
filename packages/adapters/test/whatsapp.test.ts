// S14 · PR 292 — the WhatsApp Business Platform behind the contract, against a stand-in Graph API (nothing leaves the
// machine): a template send with its values in order, plain text inside the 24 hours, Meta's error codes, the template
// list and a submission, the webhook's signature, its receipts and the customer's messages; the practice sender plays
// the provider's approval.
import { describe, expect, it } from 'vitest';
import { createWhatsAppCloudClient, mockWhatsAppAdapter, parseWhatsAppWebhook, verifyWhatsAppSignature, whatsappCloudAdapter, whatsappCloudConfig, whatsappSignature } from '../src';

const BASE = 'https://graph.example';
const TO = '+8801700000292'; // hardcode-ok: a made-up test number

function graph(answers: Record<string, { status?: number; body?: unknown } | Error>) {
  const seen: { method: string; url: string; body: unknown; auth: string | null }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const h = new Headers(init?.headers);
    seen.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : null, auth: h.get('authorization') });
    const key = Object.keys(answers).find((k) => new URL(url).pathname.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: { error: { code: 100, message: 'Unknown path' } } };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchFn };
}

const client = (g: ReturnType<typeof graph>) => createWhatsAppCloudClient({ baseUrl: BASE, apiVersion: 'v21.0', accessToken: 'test-token-292', phoneNumberId: '1092', businessAccountId: '2092', fetch: g.fetchFn });

describe('PR 292 · the WhatsApp Business Platform', () => {
  it('a template goes with its name, language and the body`s values in order; plain text without one', async () => {
    const g = graph({ '/1092/messages': { body: { messages: [{ id: 'wamid.ONE' }] } } });
    const api = client(g);
    expect(await api.send({ to: TO, text: 'ignored', purpose: 'order.placed', template: { name: 'order_placed', language: 'bn', params: ['Rahim', '10023'] } })).toEqual({ ok: true, messageId: 'wamid.ONE' });
    expect(g.seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/v21.0/1092/messages`, auth: 'Bearer test-token-292' });
    expect(g.seen[0]!.body).toEqual({
      messaging_product: 'whatsapp',
      to: '8801700000292',
      type: 'template',
      template: { name: 'order_placed', language: { code: 'bn' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Rahim' }, { type: 'text', text: '10023' }] }] },
    });
    await api.send({ to: TO, text: 'Thank you', purpose: 'selfConfirmAnswer' });
    expect(g.seen[1]!.body).toEqual({ messaging_product: 'whatsapp', to: '8801700000292', type: 'text', text: { body: 'Thank you', preview_url: false } });
  });

  it('Meta`s codes: no WhatsApp on the number is never tried again; others are plain failures', async () => {
    const send = (answer: { status?: number; body?: unknown } | Error) => client(graph({ '/1092/messages': answer })).send({ to: TO, text: 'x', purpose: 'p' });
    expect(await send({ status: 400, body: { error: { code: 131026, message: 'Message undeliverable' } } })).toEqual({ ok: false, error: '131026: the number cannot get WhatsApp messages', notOnWhatsApp: true });
    expect(await send({ status: 400, body: { error: { code: 131047, message: 'Re-engagement message' } } })).toMatchObject({ ok: false, error: expect.stringContaining('24 hours') });
    expect(await send({ status: 400, body: { error: { code: 4, message: 'Too many calls' } } })).toEqual({ ok: false, error: '4: Too many calls' });
    expect(await send({ status: 502, body: {} })).toEqual({ ok: false, error: 'HTTP 502: the answer was not understood' });
    expect(await send(new Error('socket hang up'))).toEqual({ ok: false, error: 'WhatsApp did not answer (socket hang up)' });
    expect(await client(graph({})).send({ to: '01700000292', text: 'x', purpose: 'p' })).toMatchObject({ ok: false, notOnWhatsApp: true }); // hardcode-ok: a made-up test number
  });

  it('the templates with Meta`s word on each; a new one sent for approval with its examples', async () => {
    const g = graph({
      '/2092/message_templates': { body: { data: [
        { name: 'order_placed', language: 'en', status: 'APPROVED', rejected_reason: 'NONE' },
        { name: 'order_placed', language: 'bn', status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' },
        { name: 'order_packed', language: 'en', status: 'IN_APPEAL' },
      ] } },
    });
    expect(await client(g).templates!()).toEqual([
      { name: 'order_placed', language: 'en', status: 'APPROVED', reason: null },
      { name: 'order_placed', language: 'bn', status: 'REJECTED', reason: 'INVALID_FORMAT' },
      { name: 'order_packed', language: 'en', status: 'PENDING', reason: null },
    ]);
    const s = graph({ '/2092/message_templates': { body: { id: '777', status: 'PENDING', category: 'UTILITY' } } });
    expect(await client(s).submitTemplate!({ name: 'order_placed', language: 'bn', category: 'UTILITY', body: 'হ্যালো {{1}}, অর্ডার {{2}}', examples: ['Rahim', '10023'] })).toEqual({ id: '777', status: 'PENDING' });
    expect(s.seen[0]!.body).toEqual({ name: 'order_placed', language: 'bn', category: 'UTILITY', components: [{ type: 'BODY', text: 'হ্যালো {{1}}, অর্ডার {{2}}', example: { body_text: [['Rahim', '10023']] } }] });
    const bad = graph({ '/2092/message_templates': { status: 400, body: { error: { code: 100, message: 'Invalid parameter' } } } });
    await expect(client(bad).submitTemplate!({ name: 'x', language: 'en', category: 'UTILITY', body: 'x', examples: [] })).rejects.toThrow('100: Invalid parameter');
  });

  it('the Test reads the phone number; the practice mode never calls Meta', async () => {
    const g = graph({ '/1092': { body: { display_phone_number: '+880 1700-000292', verified_name: 'Sample Shop' } } });
    expect(await client(g).phone()).toEqual({ number: '+880 1700-000292', name: 'Sample Shop' });
    const ctx = { mode: 'MOCK' as const, config: { phoneNumberId: '1092', businessAccountId: '2092' }, storeId: 1, secret: async () => null };
    expect(await whatsappCloudAdapter.test(await whatsappCloudAdapter.mock(ctx), ctx)).toMatchObject({ ok: true, message: expect.stringContaining('mock') });
    expect(whatsappCloudAdapter.secrets).toEqual(['accessToken', 'appSecret', 'verifyToken']);
    expect(whatsappCloudConfig.safeParse({ phoneNumberId: '1092', businessAccountId: '2092', baseUrl: 'http://graph.example' }).success).toBe(false);
    expect(whatsappCloudConfig.safeParse({ phoneNumberId: '+8801700000292', businessAccountId: '2092' }).success).toBe(false);
  });

  it('the practice sender plays Meta: sent for approval is pending, approved at the next read', async () => {
    const ctx = { mode: 'MOCK' as const, config: {}, storeId: 1, secret: async () => null };
    const s = await mockWhatsAppAdapter.mock(ctx);
    expect(await s.submitTemplate!({ name: 'order_care', language: 'en', category: 'UTILITY', body: 'Hi {{1}}', examples: ['A'] })).toMatchObject({ status: 'PENDING' });
    expect((await s.templates!()).find((t) => t.name === 'order_care')).toEqual({ name: 'order_care', language: 'en', status: 'APPROVED', reason: null });
  });
});

describe('PR 292 · the webhook', () => {
  const secret = 'app-secret-292';
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '2092',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              statuses: [
                { id: 'wamid.ONE', status: 'delivered', timestamp: '1761300000', recipient_id: '8801700000292' },
                { id: 'wamid.TWO', status: 'failed', timestamp: '1761300060', errors: [{ code: 131026, title: 'Message undeliverable' }] },
                { id: 'wamid.THREE', status: 'deleted', timestamp: '1761300060' },
              ],
              messages: [
                { from: '8801700000292', id: 'wamid.IN1', timestamp: '1761300100', type: 'text', text: { body: '১' } },
                { from: '8801700000292', id: 'wamid.IN2', timestamp: '1761300200', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'STOP' } } },
                { from: '8801700000292', id: 'wamid.IN3', timestamp: '1761300300', type: 'image', image: { id: 'm1' } },
              ],
            },
          },
          { field: 'account_update', value: {} },
        ],
      },
    ],
  });

  it('the signature: Meta`s HMAC over the exact body, in constant time', () => {
    const sig = whatsappSignature(body, secret);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyWhatsAppSignature(body, sig, secret)).toBe(true);
    expect(verifyWhatsAppSignature(`${body} `, sig, secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, sig, 'another-secret')).toBe(false);
    expect(verifyWhatsAppSignature(body, null, secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, 'sha256=zz', secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, sig, '')).toBe(false);
  });

  it('reads the receipts and the customer`s messages; anything else is left alone', () => {
    const p = parseWhatsAppWebhook(JSON.parse(body));
    expect(p.receipts).toEqual([
      { messageId: 'wamid.ONE', status: 'delivered', at: new Date(1761300000 * 1000), error: null, notOnWhatsApp: false },
      { messageId: 'wamid.TWO', status: 'failed', at: new Date(1761300060 * 1000), error: '131026: the number cannot get WhatsApp messages', notOnWhatsApp: true },
    ]);
    expect(p.inbound.map((m) => [m.from, m.text])).toEqual([
      ['+8801700000292', '১'],
      ['+8801700000292', 'STOP'],
      ['+8801700000292', ''],
    ]);
    expect(parseWhatsAppWebhook(null)).toEqual({ receipts: [], inbound: [] });
    expect(parseWhatsAppWebhook({ entry: 'x' })).toEqual({ receipts: [], inbound: [] });
  });
});
