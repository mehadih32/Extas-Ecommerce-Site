// PR 741 — the e-mail look: off keeps the plain e-mail exactly; on wraps it in the owner's colours, logo and words.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { emailHtml, emailUrls } from './email-html';
import { wrapWithLook } from './email-look';

// hardcode-ok: made-up host and id
const urls = emailUrls('shop.example.com', '0190a0a0-0000-7000-8000-000000000001');
const parts = { text: 'Hello https://a.example/x', links: ['https://a.example/x'], unsubscribeLine: 'Unsubscribe', urls, lang: 'en' as const, trackOpens: false, trackClicks: false };
const look = { ...registry['email.look'].default, on: true, accent: '#ab1234', header: { en: 'Head line', bn: 'মাথা' }, footer: { en: 'Foot line', bn: 'পা' } };

describe('e-mail look (PR 741)', () => {
  it('no look, or null: the exact plain e-mail', () => {
    expect(emailHtml({ ...parts, look: null })).toBe(emailHtml(parts));
    expect(emailHtml(parts)).not.toContain('<table');
  });
  it('a look wraps the words in the owner`s colours, name, header, footer and link colour', () => {
    const html = emailHtml({ ...parts, look: { look, storeName: 'Test Shop', logoUrl: null, lang: 'en' } });
    expect(html).toContain('<table');
    expect(html).toContain('Test Shop');
    expect(html).toContain('Head line');
    expect(html).toContain('Foot line');
    expect(html).toContain('#ab1234');
    expect(html).toContain('Unsubscribe');
  });
  it('draws the logo when one is set, escapes the name', () => {
    const v = { look, storeName: 'A <b>', logoUrl: 'https://shop.example.com/media/x', lang: 'en' as const };
    const html = wrapWithLook(v, 'body', 'foot', '');
    expect(html).toContain('<img src="https://shop.example.com/media/x"');
    expect(html).toContain('A &lt;b&gt;');
    expect(wrapWithLook({ ...v, logoUrl: null }, 'b', 'f', '')).not.toContain('<img');
  });
});

describe('the new settings are off as shipped (PR 741–744)', () => {
  it('email, cookie and home screen', () => {
    expect(registry['email.look'].default.on).toBe(false);
    expect(registry['cookie.banner'].default.on).toBe(false);
    expect(registry['app.homeScreen'].default.on).toBe(false);
  });
});
