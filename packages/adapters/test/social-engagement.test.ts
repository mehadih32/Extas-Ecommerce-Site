// S23 · PR 443 — Facebook Page comments and Instagram comments + Direct messages for the Support inbox: the webhook
// parsers (the Page's own echo of its own reply, and anything not the right object, left out), the catalogue rows,
// and that both new providers share Messenger/WhatsApp's own signature check. Every id and token here is made up.
import { describe, expect, it } from 'vitest';
import {
  connectionCatalogue,
  facebookPageCommentsAdapter,
  instagramEngagementAdapter,
  mockFacebookCommentsAdapter,
  mockInstagramEngagementAdapter,
  parseFacebookCommentsWebhook,
  parseInstagramWebhook,
  verifyWhatsAppSignature,
  whatsappSignature,
} from '../src';

const ctx = { mode: 'MOCK' as const, config: {}, storeId: null, async secret() { return null; } };

describe('PR 443 · Facebook Page comments', () => {
  const body = {
    object: 'page',
    entry: [
      {
        id: '1000000001',
        changes: [
          { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'c_1', post_id: '1000000001_55', created_time: 1761300000, from: { id: 'fb-user-1', name: 'Sample Buyer' }, message: 'Is the navy polo in L?' } },
          // the Page's own reply to a comment: `from.id` is the Page's own id, left out
          { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'c_2', post_id: '1000000001_55', from: { id: '1000000001' }, message: 'Yes, it is!' } },
          // a reaction, not a comment: left out
          { field: 'feed', value: { item: 'reaction', verb: 'add', from: { id: 'fb-user-2' } } },
        ],
      },
    ],
  };

  it('reads a real comment; the Page`s own reply and anything that is not a comment are left out', () => {
    expect(parseFacebookCommentsWebhook(body)).toEqual([{ rootId: '1000000001', from: 'fb-user-1', name: 'Sample Buyer', messageId: 'c_1', text: 'Is the navy polo in L?', files: [], at: new Date(1761300000 * 1000), isPublicComment: true, postId: '1000000001_55' }]);
    expect(parseFacebookCommentsWebhook({ object: 'instagram', entry: body.entry })).toEqual([]);
    expect(parseFacebookCommentsWebhook(null)).toEqual([]);
  });

  it('the mock reads nothing real; the live reader signs in the same way as Messenger/WhatsApp', async () => {
    expect(await (await mockFacebookCommentsAdapter.mock(ctx)).account()).toEqual({ name: 'practice account' });
    const raw = 'sample-body';
    expect(verifyWhatsAppSignature(raw, whatsappSignature(raw, 'app-secret-443'), 'app-secret-443')).toBe(true);
    const row = connectionCatalogue.find((r) => r.id === 'facebookPageComments')!;
    expect(row).toMatchObject({ kind: 'META', provider: facebookPageCommentsAdapter.provider, adapter: true, exclusive: false });
    expect(row.secrets.map((s) => s.field).sort()).toEqual([...facebookPageCommentsAdapter.secrets].sort());
  });
});

describe('PR 443 · Instagram comments and Direct messages', () => {
  const body = {
    object: 'instagram',
    entry: [
      {
        id: '17800000000001',
        changes: [
          { field: 'comments', value: { id: 'ig_c_1', text: 'Price of this one?', from: { id: 'ig-user-1', username: 'buyer_one' }, media: { id: 'media_55' } } },
          // the account's own reply to a comment: `from.id` is the account's own id, left out
          { field: 'comments', value: { id: 'ig_c_2', text: 'DM us!', from: { id: '17800000000001' } } },
        ],
        messaging: [
          { sender: { id: 'ig-user-1' }, recipient: { id: '17800000000001' }, timestamp: 1761300000000, message: { mid: 'ig_m_1', text: 'Do you deliver to Khulna?' } },
          { sender: { id: '17800000000001' }, recipient: { id: 'ig-user-1' }, timestamp: 1761300060000, message: { mid: 'ig_m_2', text: 'our own reply', is_echo: true } },
        ],
      },
    ],
  };

  it('reads a real comment and a real Direct message; echoes and the account`s own reply are left out', () => {
    expect(parseInstagramWebhook(body)).toEqual([
      { rootId: '17800000000001', from: 'ig-user-1', name: 'buyer_one', messageId: 'ig_c_1', text: 'Price of this one?', files: [], at: expect.any(Date), isPublicComment: true, postId: 'media_55' },
      { rootId: '17800000000001', from: 'ig-user-1', messageId: 'ig_m_1', text: 'Do you deliver to Khulna?', files: [], at: new Date(1761300000000), isPublicComment: false },
    ]);
    expect(parseInstagramWebhook({ object: 'page', entry: body.entry })).toEqual([]);
    expect(parseInstagramWebhook(null)).toEqual([]);
  });

  it('the mock reads nothing real; the catalogue row never locks out Studio`s own Meta connections', async () => {
    expect(await (await mockInstagramEngagementAdapter.mock(ctx)).account()).toEqual({ name: 'practice account' });
    const row = connectionCatalogue.find((r) => r.id === 'instagramEngagement')!;
    expect(row).toMatchObject({ kind: 'META', provider: instagramEngagementAdapter.provider, adapter: true, exclusive: false });
    expect(row.secrets.map((s) => s.field).sort()).toEqual([...instagramEngagementAdapter.secrets].sort());
  });
});
