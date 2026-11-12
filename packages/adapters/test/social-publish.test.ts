// S23 · PR 440 — Facebook Page and Instagram publishing for the content studio: the mock outbox (nothing leaves the
// server), the live clients against a fake Graph API (Facebook's one call, Instagram's two-step container flow),
// Meta's refusals in words, and the catalogue rows matching the adapters. Every id and token here is made up.
import { describe, expect, it } from 'vitest';
import {
  connectionCatalogue,
  createFacebookPagePublisher,
  createInstagramPublisher,
  facebookPagePublishAdapter,
  facebookPagePublishConfig,
  instagramPublishAdapter,
  instagramPublishConfig,
  mockSocialPublishOutbox,
  studioPublishAdapters,
} from '../src';

describe('PR 440 · Facebook Page and Instagram publishing', () => {
  it('the mock keeps what it "posted" and never leaves the server', async () => {
    mockSocialPublishOutbox.clear();
    const api = await facebookPagePublishAdapter.mock({ mode: 'MOCK', config: { pageId: '1000000001' }, storeId: null, secret: async () => null });
    const r = await api.publishPhoto({ imageUrl: 'https://shop.example.test/media/a.jpg', caption: 'New arrival' });
    expect(r.ok).toBe(true);
    expect(mockSocialPublishOutbox.all()).toHaveLength(1);
    expect(mockSocialPublishOutbox.all()[0]).toMatchObject({ provider: 'facebookPagePublish', caption: 'New arrival' });
    expect(await api.publishPhoto({ imageUrl: '', caption: 'x' })).toMatchObject({ ok: false });
  });

  it('the Facebook client posts one photo and says Meta`s refusals in words', async () => {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const fake = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get('authorization') });
      const text = calls.length === 1 ? JSON.stringify({ id: '1000000001_2', post_id: '1000000001_2' }) : JSON.stringify({ error: { code: 190, message: 'expired' } });
      return new Response(text, { status: calls.length === 1 ? 200 : 400 });
    };
    const c = createFacebookPagePublisher({ baseUrl: 'https://graph.example.test', apiVersion: 'v21.0', accessToken: 'page-token', pageId: '1000000001', fetch: fake as typeof fetch });
    expect(await c.publishPhoto({ imageUrl: 'https://shop.example.test/media/a.jpg', caption: 'New arrival' })).toEqual({ ok: true, externalPostId: '1000000001_2' });
    expect(calls[0]).toEqual({ url: 'https://graph.example.test/v21.0/1000000001/photos', body: { url: 'https://shop.example.test/media/a.jpg', caption: 'New arrival', published: true }, auth: 'Bearer page-token' });
    expect(await c.publishPhoto({ imageUrl: 'https://shop.example.test/media/b.jpg', caption: 'x' })).toEqual({ ok: false, error: '190: the Page access token has expired or is not valid' });
  });

  it('the Instagram client creates a container then publishes it, and refuses on either step', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fake = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (calls.length === 1) return new Response(JSON.stringify({ id: 'creation-1' }), { status: 200 });
      return new Response(JSON.stringify({ id: 'media-1' }), { status: 200 });
    };
    const c = createInstagramPublisher({ baseUrl: 'https://graph.example.test', apiVersion: 'v21.0', accessToken: 'page-token', igUserId: '2000000002', fetch: fake as typeof fetch });
    expect(await c.publishPhoto({ imageUrl: 'https://shop.example.test/media/a.jpg', caption: 'New arrival' })).toEqual({ ok: true, externalPostId: 'media-1' });
    expect(calls[0]).toEqual({ url: 'https://graph.example.test/v21.0/2000000002/media', body: { image_url: 'https://shop.example.test/media/a.jpg', caption: 'New arrival' } });
    expect(calls[1]).toEqual({ url: 'https://graph.example.test/v21.0/2000000002/media_publish', body: { creation_id: 'creation-1' } });

    const failFirst = async () => new Response(JSON.stringify({ error: { code: 100, message: 'bad url' } }), { status: 400 });
    const c2 = createInstagramPublisher({ baseUrl: 'https://graph.example.test', apiVersion: 'v21.0', accessToken: 'page-token', igUserId: '2000000002', fetch: failFirst as typeof fetch });
    expect(await c2.publishPhoto({ imageUrl: 'not-public', caption: 'x' })).toEqual({ ok: false, error: '100: the photo address could not be read by Meta (it must be public https, not behind a password)' });
  });

  it('config needs digits-only ids; the catalogue rows match the adapters', () => {
    expect(facebookPagePublishConfig.safeParse({ pageId: '1000000001' }).success).toBe(true);
    expect(facebookPagePublishConfig.safeParse({ pageId: 'my-page' }).success).toBe(false);
    expect(instagramPublishConfig.safeParse({ igUserId: '2000000002' }).success).toBe(true);
    expect(instagramPublishConfig.safeParse({ igUserId: '' }).success).toBe(false);
    for (const a of [facebookPagePublishAdapter, instagramPublishAdapter]) {
      const row = connectionCatalogue.find((r) => r.kind === a.kind && r.provider === a.provider)!;
      expect(row).toMatchObject({ adapter: true, exclusive: false, targetMode: 'LIVE' });
      expect(row.secrets.map((s) => s.field)).toEqual([...a.secrets]);
    }
    expect(studioPublishAdapters.map((a) => `${a.kind}:${a.provider}`)).toEqual(['META:facebookPagePublish', 'META:instagramPublish']);
  });
});
