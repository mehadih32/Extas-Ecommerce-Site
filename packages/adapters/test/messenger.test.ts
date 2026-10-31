// S22 · PR 426 — Facebook Messenger for the Support inbox: the webhook's messages (echoes, reads and other pages' noise
// left out), the mock sender (nothing leaves the server), the live client's send against a fake Graph API, Meta's error
// codes in words, and the catalogue row matching the adapter. Every id and token here is made up.
import { describe, expect, it } from 'vitest';
import { connectionCatalogue, createMessengerClient, messengerPageAdapter, messengerPageConfig, mockMessengerOutbox, mockMessengerSender, parseMessengerWebhook, supportAdapters, verifyWhatsAppSignature, whatsappSignature } from '../src';

const body = {
  object: 'page',
  entry: [
    {
      id: '1000000001',
      time: 1761300000000,
      messaging: [
        { sender: { id: 'PSID-1' }, recipient: { id: '1000000001' }, timestamp: 1761300000000, message: { mid: 'm_1', text: 'Is the navy polo in L?' } },
        { sender: { id: 'PSID-1' }, recipient: { id: '1000000001' }, timestamp: 1761300060000, message: { mid: 'm_2', attachments: [{ type: 'image', payload: { url: 'https://cdn.example.test/p.jpg' } }, { type: 'image', payload: { url: 'http://insecure.example.test/x.jpg' } }] } },
        { sender: { id: '1000000001' }, recipient: { id: 'PSID-1' }, timestamp: 1761300120000, message: { mid: 'm_3', text: 'our own reply', is_echo: true } },
        { sender: { id: 'PSID-1' }, recipient: { id: '1000000001' }, timestamp: 1761300180000, read: { watermark: 1 } },
      ],
    },
  ],
};

describe('PR 426 · Messenger (the Page) for the Support inbox', () => {
  it('reads the person`s messages and files; echoes of our own replies, reads and anything not a page are left out', () => {
    const got = parseMessengerWebhook(body);
    expect(got).toEqual([
      { pageId: '1000000001', from: 'PSID-1', messageId: 'm_1', text: 'Is the navy polo in L?', files: [], at: new Date(1761300000000) },
      { pageId: '1000000001', from: 'PSID-1', messageId: 'm_2', text: '', files: [{ kind: 'IMAGE', url: 'https://cdn.example.test/p.jpg' }], at: new Date(1761300060000) },
    ]);
    expect(parseMessengerWebhook({ object: 'instagram', entry: body.entry })).toEqual([]);
    expect(parseMessengerWebhook(null)).toEqual([]);
  });

  it('the webhook signs the same way as WhatsApp (X-Hub-Signature-256 with the app secret)', () => {
    const raw = JSON.stringify(body);
    expect(verifyWhatsAppSignature(raw, whatsappSignature(raw, 'app-secret'), 'app-secret')).toBe(true);
    expect(verifyWhatsAppSignature(raw, whatsappSignature(raw, 'app-secret'), 'other')).toBe(false);
  });

  it('the mock keeps what it "sent" and never leaves the server', async () => {
    mockMessengerOutbox.clear();
    const r = await mockMessengerSender().send({ to: 'PSID-1', text: 'Yes, L is in stock' });
    expect(r.ok).toBe(true);
    expect(mockMessengerOutbox.lastTo('PSID-1')?.text).toBe('Yes, L is in stock');
    expect(await mockMessengerSender().send({ to: 'PSID-1', text: '  ' })).toMatchObject({ ok: false });
  });

  it('the live client sends a RESPONSE to the person and says Meta`s refusals in words', async () => {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const fake = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get('authorization') });
      const text = calls.length === 1 ? JSON.stringify({ recipient_id: 'PSID-1', message_id: 'm_out_1' }) : JSON.stringify({ error: { code: 10, message: 'outside window' } });
      return new Response(text, { status: calls.length === 1 ? 200 : 400 });
    };
    const c = createMessengerClient({ baseUrl: 'https://graph.example.test', apiVersion: 'v21.0', accessToken: 'page-token', pageId: '1000000001', fetch: fake as typeof fetch });
    expect(await c.send({ to: 'PSID-1', text: 'Hello' })).toEqual({ ok: true, messageId: 'm_out_1' });
    expect(calls[0]).toEqual({ url: 'https://graph.example.test/v21.0/1000000001/messages', body: { recipient: { id: 'PSID-1' }, messaging_type: 'RESPONSE', message: { text: 'Hello' } }, auth: 'Bearer page-token' });
    expect(await c.send({ to: 'PSID-1', text: 'Late' })).toEqual({ ok: false, error: '10: outside the allowed window after the person`s last message' });
  });

  it('the Page id is digits; the catalogue row matches the adapter; Support gets both channels with their mocks', () => {
    expect(messengerPageConfig.safeParse({ pageId: '1000000001' }).success).toBe(true);
    expect(messengerPageConfig.safeParse({ pageId: 'my-page' }).success).toBe(false);
    const row = connectionCatalogue.find((r) => r.id === 'messengerPage')!;
    expect(row).toMatchObject({ kind: 'MESSENGER', provider: messengerPageAdapter.provider, adapter: true });
    expect(row.secrets.map((s) => s.field)).toEqual([...messengerPageAdapter.secrets]);
    expect(supportAdapters.map((a) => `${a.kind}:${a.provider}`)).toEqual(['WHATSAPP:mockWhatsApp', 'WHATSAPP:whatsappCloud', 'MESSENGER:mockMessenger', 'MESSENGER:messengerPage']);
  });
});
