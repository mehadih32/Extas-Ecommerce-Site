// PR 891 — the monthly review's "Send to Telegram" route: only POST, a valid store, and no message when the admin layer is not ready.
import { describe, expect, it } from 'vitest';
import { REVIEW_TEXT_MAX, reviewTelegramHandler } from './review-telegram-api';

const req = (method: string, url = 'http://x/api/admin/reports/review/telegram', body?: unknown) =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

describe('reviewTelegramHandler', () => {
  it('answers only POST', async () => {
    expect((await reviewTelegramHandler(req('GET'), null)).status).toBe(405);
  });
  it('refuses a bad store id before anything else', async () => {
    expect((await reviewTelegramHandler(req('POST', 'http://x/a?storeId=abc', { text: 'hi' }), null)).status).toBe(400);
  });
  it('sends nothing without the admin layer (no sign-in, no message)', async () => {
    let sent = 0;
    const res = await reviewTelegramHandler(req('POST', undefined, { text: 'hi' }), null, async () => void (sent += 1));
    expect(res.ok).toBe(false);
    expect(sent).toBe(0);
  });
  it('caps the message below Telegram\'s own limit', () => {
    expect(REVIEW_TEXT_MAX).toBeLessThan(4096);
  });
});
